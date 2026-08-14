// Model helpers: dates, week grouping, per-day peaks, unit prep & merging.

import type { CastToken, ScheduleModel, Scene, ShootDay } from "./types";

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

// NOTE: the /i flags matter. Schedules routinely shout their dates
// ("MONDAY 14TH APRIL"), and a case-sensitive ordinal suffix left every such
// day with a null _date — which silently broke date sorting, week grouping,
// continuity and the calendar for that production.
export function parseDayDate(d: Pick<ShootDay, "date">): Date | null {
  let m = d.date.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z.]+)(?:\s+(\d{4}))?/i);
  let mo = m && monthNum(m[2]);
  if (m && mo != null) return new Date(+(m[3] || 2026), mo, +m[1]);
  m = d.date.match(/([A-Za-z.]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?/i);
  mo = m && monthNum(m[1]);
  if (m && mo != null) return new Date(+(m[3] || 2026), mo, +m[2]);
  return null;
}

// Week key, verbatim from the prototype. NOTE: toISOString shifts the local
// Monday back to the Sunday UTC date during British Summer Time, so week
// labels render as e.g. "w/c 5 Jul" for the week starting Monday 6 Jul —
// that is exactly what the prototype shows, so it is preserved (grouping is
// unaffected). Tests pin behaviour by running with TZ=Europe/London.
export function weekKey(date: Date): string {
  const d = new Date(date);
  const wd = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - wd);
  return d.toISOString().slice(0, 10);
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

export function prepModel(model: ScheduleModel, unit: "Main" | "2nd"): ScheduleModel {
  for (const d of model.days) {
    d.unit = unit;
    d.id = (unit === "2nd" ? "U" : "M") + d.num;
    d._date = parseDayDate(d);
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
  }
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
