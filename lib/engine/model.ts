// Model helpers: dates, week grouping, per-day peaks, unit prep & merging.

import type { CastToken, ScheduleModel, Scene, ShootDay } from "./types";
import { resolveDayUnits } from "./units";

const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};
// Call sheets write months every which way: "April", "APRIL", "Apr", "Sept.".
// Full names win; a 3–5 letter word is accepted as an abbreviation, which keeps
// ordinary words ("Marketing") from being read as a month.
function monthNum(word: string): number | null {
  const w = word.toLowerCase().replace(/\.$/, "");
  if (MONTHS[w] != null) return MONTHS[w];
  if (w.length < 3 || w.length > 5) return null;
  for (const name of Object.keys(MONTHS))
    if (name.startsWith(w)) return MONTHS[name];
  return null;
}

// A 2-digit year on a call sheet is always this century in practice ("14/04/26"
// means 2026). The 70 pivot is the usual convention and keeps a stray "99"
// reading as 1999 rather than 2099.
function expandYear(raw: string): number {
  const n = +raw;
  if (raw.length >= 3) return n;
  return n <= 69 ? 2000 + n : 1900 + n;
}

// The year assumed when a schedule states none at all. Deliberately NOT a
// hardcoded 2026: a hardcoded year silently backdates (or forward-dates) every
// undated day the moment the calendar rolls over, which drags week grouping,
// sorting and the calendar with it. Callers that know better (prepModel, which
// can see the schedule's other days) pass their own anchor.
export function defaultDateYear(): number {
  return new Date().getFullYear();
}

export interface ParsedDate {
  date: Date;
  /** false = the source text stated no year and `date` uses the anchor year. */
  hasYear: boolean;
}

// Build a local-midnight date, rejecting rollovers: the Date constructor
// happily turns 31 February into 3 March, which silently invents a shoot day
// on the wrong date rather than admitting the source is unparseable.
function makeDate(y: number, mo: number, dd: number): Date | null {
  if (!(mo >= 0 && mo <= 11) || !(dd >= 1 && dd <= 31)) return null;
  const d = new Date(y, mo, dd);
  if (d.getFullYear() !== y || d.getMonth() !== mo || d.getDate() !== dd) return null;
  return d;
}

// NOTE: the /i flags matter. Schedules routinely shout their dates
// ("MONDAY 14TH APRIL"), and a case-sensitive ordinal suffix left every such
// day with a null _date — which silently broke date sorting, week grouping,
// continuity and the calendar for that production.
//
// Accepted shapes, in order of decreasing certainty:
//   ISO            2025-04-14, 2025/04/14
//   named month    14 April 2025 · MONDAY 14TH APRIL · Sept. 3 2025 · April 14th, 2025
//   UK numeric     14/04/2025 · 14/04/25 · 14.04.25 · 14-04-2025  (DD/MM — never MM/DD)
export function parseDayDateFull(
  d: Pick<ShootDay, "date">,
  opts: { year?: number } = {}
): ParsedDate | null {
  const text = (d.date || "").trim();
  if (!text) return null;
  const anchor = opts.year ?? defaultDateYear();

  // ISO first — unambiguous, and no other shape can be mistaken for it.
  let m = text.match(/(?:^|[^\d])(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?![\d])/);
  if (m) {
    const dt = makeDate(+m[1], +m[2] - 1, +m[3]);
    return dt ? { date: dt, hasYear: true } : null;
  }

  // Named month, day-first: "14 April 2025", "MONDAY 14TH APRIL", "14 Apr 25",
  // "23-Sep-2024". The year lookahead keeps a trailing call time ("3 September
  // 07:00") from being read as the year 2007.
  m = text.match(
    /(\d{1,2})(?:st|nd|rd|th)?[\s\-]+([A-Za-z.]+)(?:[,\s\-]+(\d{4}|\d{2})(?![\d:]))?/i
  );
  let mo = m && monthNum(m[2]);
  if (m && mo != null) {
    const dt = makeDate(m[3] ? expandYear(m[3]) : anchor, mo, +m[1]);
    return dt ? { date: dt, hasYear: !!m[3] } : null;
  }

  // Named month, month-first: "April 14th, 2025"
  m = text.match(
    /([A-Za-z.]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(?:(\d{4}|\d{2})(?![\d:]))?/i
  );
  mo = m && monthNum(m[1]);
  if (m && mo != null) {
    const dt = makeDate(m[3] ? expandYear(m[3]) : anchor, mo, +m[2]);
    return dt ? { date: dt, hasYear: !!m[3] } : null;
  }

  // UK numeric. DD/MM order always — this is a British production tool, and a
  // schedule that means 4 March writes 04/03. Reading it as April 3rd would
  // move the day a month and take the week grouping and calendar with it.
  m = text.match(
    /(?:^|[^\d])(\d{1,2})[/.\-](\d{1,2})(?:[/.\-](\d{4}|\d{2}))?(?![\d:])/
  );
  if (m) {
    const dt = makeDate(m[3] ? expandYear(m[3]) : anchor, +m[2] - 1, +m[1]);
    return dt ? { date: dt, hasYear: !!m[3] } : null;
  }
  return null;
}

export function parseDayDate(
  d: Pick<ShootDay, "date">,
  opts: { year?: number } = {}
): Date | null {
  return parseDayDateFull(d, opts)?.date ?? null;
}

// Week key = the Monday of the week the date falls in, as a plain local
// YYYY-MM-DD string.
//
// This used to build the local Monday midnight and then call toISOString(),
// which converts to UTC — so throughout British Summer Time the Monday came
// back labelled as the previous Sunday. Every production week was captioned a
// day early all summer, and the row either side of the BST→GMT change implied
// an 8-day week. Formatting the LOCAL date components has no such round-trip
// and is correct in every host timezone.
const pad2 = (n: number) => String(n).padStart(2, "0");
export function weekKey(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const wd = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - wd);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// Parse a weekKey back to a local Date. Anything rendering a week caption must
// use this rather than `new Date("2026-07-06")`, which the platform reads as
// UTC midnight and shifts west of Greenwich.
export function weekKeyDate(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  return m ? makeDate(+m[1], +m[2] - 1, +m[3]) : null;
}

export const isPerf = (c: CastToken) =>
  c.type === "stuntPerf" || c.type === "stuntDbl";
export const isStuntTok = (c: CastToken) => c.type === "stuntCoord" || isPerf(c);

export function dayPeakSA(d: ShootDay): number {
  return Math.max(0, ...d.scenes.map((s: Scene) => s.sa), 0);
}

// A day/scene "location" must name a real, mappable place — not a story beat.
// Schedules sometimes head a day with a narrative sequence/section title
// ("Hotel opening", "The Wedding", "Flashback", "Opening sequence", "Montage")
// and both the AI reader and the `== … ==` banner parser can mistake that for
// the day's location. Those are parts of the story, not somewhere the unit
// travels, so we reject them: the field is blanked and falls through to the
// scene location / "TBC" instead of showing a wrong place. The word list is
// deliberately narrow (no real UK place contains these whole words) to avoid
// ever dropping a genuine location.
const SEQ_TITLE_RX =
  /\b(opening|closing|finale|flash-?backs?|flash-?forwards?|montages?|sequences?|prologue|epilogue|reprise|titles?)\b/i;
export function looksLikeSequenceTitle(s?: string): boolean {
  const v = (s || "").trim();
  if (!v) return false;
  return SEQ_TITLE_RX.test(v);
}

// Ensure every day has a clean list of location blocks (distinct scene-location
// banners, in order). Block 0 is always the day's own `loc` so the primary
// banner is guaranteed present; parser-captured secondary banners are kept.
// Blank/consecutive-duplicate banners are dropped.
function normalizeLocBlocks(d: ShootDay): void {
  const src = Array.isArray(d.locBlocks) ? d.locBlocks : [];
  const primary = (d.loc || "").trim();
  const out: { loc: string; from: number }[] = [];
  const seen = new Set<string>();
  const add = (loc: string, from: number) => {
    const v = (loc || "").trim();
    if (!v || seen.has(v) || looksLikeSequenceTitle(v)) return;
    seen.add(v);
    out.push({ loc: v, from: Math.max(0, from | 0) });
  };
  if (primary) add(primary, 0);
  for (const b of src) add(b.loc, b.from);
  if (!out.length) {
    const slug = d.scenes?.find((s) => (s.slug || "").trim())?.slug;
    if (slug) add(slug, 0);
  }
  if (out.length) d.locBlocks = out;
  else delete d.locBlocks;
}

// A schedule that states no year on its day lines still knows what year it is
// — its OTHER days say so. Infer each undated-year day's year from the nearest
// day in schedule order that does state one, then correct for a shoot that runs
// across New Year (a December day followed by a January one is the next year).
// Only when the whole document states no year anywhere do we fall back to the
// anchor, and those days are flagged so the UI can say the year was assumed.
function resolveYears(model: ScheduleModel): void {
  const parsed = model.days.map((d) => parseDayDateFull(d));
  const anchorIdx = parsed.findIndex((p) => p && p.hasYear);
  const anchorYear = anchorIdx >= 0 ? parsed[anchorIdx]!.date.getFullYear() : defaultDateYear();

  let carryYear = anchorYear;
  let prevMonth: number | null = null;
  model.days.forEach((d, i) => {
    const p = parsed[i];
    if (!p) {
      d._date = null;
      delete d._dateYearAssumed;
      return;
    }
    if (p.hasYear) {
      carryYear = p.date.getFullYear();
      prevMonth = p.date.getMonth();
      d._date = p.date;
      delete d._dateYearAssumed;
      return;
    }
    // year absent: continue from the running year, rolling over at New Year
    let y = carryYear;
    if (prevMonth != null && prevMonth >= 10 && p.date.getMonth() <= 1) y = carryYear + 1;
    const dt = parseDayDate(d, { year: y });
    d._date = dt;
    prevMonth = dt ? dt.getMonth() : prevMonth;
    if (dt) carryYear = dt.getFullYear();
    // flagged only when NOTHING in the document stated a year — a day whose
    // year came from a neighbouring dated day is as good as stated
    if (anchorIdx < 0) d._dateYearAssumed = true;
    else delete d._dateYearAssumed;
  });
}

// A shoot day the schedule splits across several unit blocks — MAIN plus a
// SPLINTER, a 2ND UNIT or a REHEARSAL UNIT — arrives as one day record per
// block, all carrying the same day number. So does every unnumbered day
// ("Day 0": rehearsals, prep, second-bank days), which all read as number 0.
//
// Built from unit+number alone, all those records share ONE id — and one id
// means one entry in the per-day cost table. The grand total counts every
// block, but the day column can only print the surviving entry, so it prints
// that one block's money once per block. Measured on a real production
// (FML, 47 printed day rows over 39 ids): the day column footed to £454,049.73
// against a true £390,220.58 — a splinter unit with no crowd at all was shown
// charging £33,247.28, twice.
//
// So: THE FIRST record of a number keeps the plain id, and every later one is
// suffixed. Keeping the first untouched is what makes this safe to ship — day
// configs, scene edits and briefs already saved against `M6` still belong to
// the MAIN block, exactly as they did. Only the extra blocks, which never had
// an identity of their own, gain one.
const UNIT_TAG: Record<string, string> = {
  splinter: "SPL",
  second: "2ND",
  rehearsal: "REH",
  weatherCover: "WX",
  reshoot: "RS",
  main: "MAIN",
};
/** The suffix that separates this record from an earlier one of the same
 *  number: its unit kind, plus an occurrence number if that is not enough.
 *  Derived from the document's own order, so it is stable across re-imports. */
function blockSuffix(d: ShootDay, taken: Set<string>): string {
  const tag = UNIT_TAG[d.unitKind || "main"] || "MAIN";
  if (!taken.has(tag)) return tag;
  let n = 2;
  while (taken.has(tag + n)) n++;
  return tag + n;
}

export function prepModel(model: ScheduleModel, unit: "Main" | "2nd"): ScheduleModel {
  resolveYears(model);
  // number → suffixes already handed out for it (empty string = the plain id)
  const seenNums = new Map<string | number, Set<string>>();
  model.days.forEach((d, i) => {
    d.unit = unit;
    // A carried day that already has an id KEEPS it. An already-shot day whose
    // number the new schedule reuses is stitched in under a suffixed id
    // (`M12-Blue`) precisely so it cannot collide with the live D12; rebuilding
    // the id from unit+number here put the collision straight back, and two
    // day records sharing an id means one silently overwrites the other in the
    // per-day cost table — the day column then double-counts one day while the
    // grand total counts both.
    if (!(d.carried && d.id)) {
      const base = (unit === "2nd" ? "U" : "M") + d.num;
      // A carried day already carries its own revision suffix and is tracked
      // under it, so it plays no part in the block numbering.
      const taken = seenNums.get(d.num) || new Set<string>();
      if (!seenNums.has(d.num)) {
        seenNums.set(d.num, taken);
        d.id = base;
        delete d.block;
      } else {
        const suffix = blockSuffix(d, taken);
        taken.add(suffix);
        d.block = suffix;
        d.id = base + "-" + suffix;
      }
    }
    // the record's own identity, unique whatever the ids do
    d._uid = d.id + "@" + i;
    // Most Full Fat schedules state no day-level location — the set only
    // appears in each scene's slugline. parseExpanded already falls back to
    // the first scene's set; do it here too so an AI-read model (which
    // routinely returns days with no `loc`) is filled in the same way,
    // instead of showing a board full of blank locations. Travel-band
    // auto-detect reads this field, so a blank costs real money.
    // Drop a narrative sequence/section title mistaken for the location
    // ("Hotel opening" etc.) so the day falls back to its scene location and
    // reads "TBC" for the real place, rather than showing a non-place.
    if (looksLikeSequenceTitle(d.loc)) d.loc = "";
    if (!(d.loc || "").trim()) {
      const slug = d.scenes?.find((s) => (s.slug || "").trim())?.slug;
      if (slug) d.loc = slug;
    }
    if (/^studio$/i.test((d.loc || "").trim())) d.loc = "OMAX Studio";
    normalizeLocBlocks(d);
    // Which unit each scene belongs to, from the document's own markings. Done
    // here so every model — parsed, AI-read, breakdown-merged, hand-built —
    // arrives tagged, and no view has to re-derive it.
    resolveDayUnits(d);
  });
  model.multiUnit = false;
  return model;
}

export function mergeModels(a: ScheduleModel, b: ScheduleModel): ScheduleModel {
  const days = [...a.days, ...b.days].sort(
    (x, y) =>
      (x._date?.getTime() || 0) - (y._date?.getTime() || 0) || x.num - y.num
  );
  return {
    days,
    castMap: Object.assign({}, a.castMap, b.castMap),
    notes: a.notes || [],
    multiUnit: true,
  };
}
