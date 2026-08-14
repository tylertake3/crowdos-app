// Crowd Breakdown — the DOCUMENT projection.
//
// This is the deliverable a Crowd 2nd AD actually sends out: the classic
// landscape grid, banded by week / shoot day / unit, one block per scene with
// its requirement lines beneath it, and MAIN UNIT TOTAL / STUNTS-OTHER TOTAL
// footers. It is deliberately NOT the cost breakdown (that lives in crowd.ts
// and renders on its own page) — no money appears anywhere in this document,
// because the people who receive it are ADs, costume, make-up and locations.
//
// Same discipline as docmodel.ts: pure, no DOM, no clock. The screen renders
// this structure and the .xlsx / .csv writers flatten the SAME structure, so a
// printed page and an emailed sheet can never disagree.

import type {
  NamedCount,
  ReqTier,
  ScheduleModel,
  Scene,
  ShootDay,
} from "./types";

// Column set, verbatim from the reference documents. Locked.
export const CB_COLUMNS = [
  "SCENE",
  "SCENE DESCRIPTION",
  "DAY",
  "NO.",
  "CROWD CHARACTER",
  "NOTES/CONTINUITY",
  "NO.",
  "STUNTS/OTHER",
] as const;

/** One requirement line inside a scene block. */
export interface CbLine {
  /** null when the line is carried from another scene — shown, never re-booked */
  no: number | null;
  name: string;
  notes: string;
  tier: ReqTier;
  fromAbove: boolean;
  /** outside the crowd budget — renders in the STUNTS/OTHER column */
  reference: boolean;
  tbc: boolean;
  /**
   * Pooling identity: tier + name. A day's requirement is a PEAK across its
   * scenes, not a sum — "150 SA" in three scenes of one day is the same 150
   * people called once, so the day books 150, not 450. Every other surface in
   * the app (day board, cost engine, DOOD) pools on exactly this identity.
   */
  key: string;
  /** index of the source row inside its scene array, for write-back */
  slot: number;
}

export interface CbScene {
  kind: "scene";
  dayId: string;
  sceneNum: string;
  /** index of this scene within its day — the write-back address for edits */
  sceneIdx: number;
  /** "16 PT 2" */
  num: string;
  /** shooting location, printed under the scene number */
  loc: string;
  ie: string;
  slug: string;
  desc: string;
  /** cast numbers, e.g. "1, 2, 4, 5, 8, 10" */
  cast: string;
  scriptDay: string;
  tod: string;
  pages: string;
  crowd: CbLine[];
  other: CbLine[];
  /** affirmatively confirmed as having no crowd */
  na: boolean;
  /** nobody has assessed it yet */
  pending: boolean;
  heads: number;
  otherHeads: number;
}

export interface CbBandRow {
  kind: "week" | "day" | "unit" | "banner";
  label: string;
  sub?: string;
  dayId?: string;
}

export interface CbTotalRow {
  kind: "dayTotal" | "weekTotal" | "grandTotal";
  label: string;
  no: number;
  otherLabel: string;
  otherNo: number;
}

export type CbRow = CbBandRow | CbScene | CbTotalRow;

export interface CbDoc {
  title: string;
  subtitle: string;
  columns: string[];
  rows: CbRow[];
  totals: {
    crowd: number;
    other: number;
    days: number;
    scenes: number;
    crowded: number;
    confirmedNone: number;
    unassessed: number;
    pctAssessed: number;
  };
}

export interface CbOpts {
  /** production title printed at the head of the document */
  production?: string;
  /** date this breakdown is issued, as printed (e.g. "20/6/26") */
  breakdownDate?: string;
  /** the shooting schedule this was built from (e.g. "18/6/26") */
  scheduleDate?: string;
  /** drop scenes with no crowd and no requirement lines at all */
  hideEmpty?: boolean;
  /** include the STUNTS/OTHER columns (stunts, children, action vehicles) */
  includeOther?: boolean;
  /** print week banners and week totals */
  weeks?: boolean;
}

const clean = (v: unknown): string => String(v ?? "").replace(/\s+/g, " ").trim();

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

/** "Monday June 22" — the banner form the reference documents use. */
export function cbDayLabel(d: ShootDay): string {
  const dt = d._date;
  if (!dt) return clean(d.date).toUpperCase() ? clean(d.date) : `Day ${d.num}`;
  return `${WEEKDAYS[dt.getDay()]} ${MONTHS[dt.getMonth()]} ${dt.getDate()}`;
}

/** "MAIN UNIT  ROTHAMSTEAD  08:00 - 18:00  SCWD" */
export function cbUnitLabel(d: ShootDay): string {
  const unit =
    d.unitKind === "rehearsal"
      ? "REHEARSAL UNIT"
      : d.unit === "2nd" || d.unitKind === "second"
        ? "2ND UNIT"
        : d.unitKind === "splinter"
          ? "SPLINTER UNIT"
          : "MAIN UNIT";
  return [unit, clean(d.loc), clean(d.hours), clean(d.type)]
    .filter(Boolean)
    .join("  ")
    .toUpperCase();
}

function unitTotalLabel(d: ShootDay): string {
  return cbUnitLabel(d).split("  ")[0] + " TOTAL";
}

// A line is "from above" when the source says these are the same people as a
// previous scene. It prints, so the document reconciles with the AD's own
// paperwork, but it is never a new booking and never reaches a total.
//
// Deliberately per-LINE. A scene-level "(FROM ABOVE)" only inherits when the
// scene lists nothing of its own (see Scene.contFrom); a scene that carries
// both carried and genuinely new lines — POP sc 16 PT 2 has two carried groups
// and one new mechanic — must still book the new one.
function isFromAbove(r: NamedCount): boolean {
  if (r.flags && r.flags.includes("asAbove")) return true;
  if (/\(\s*from above/i.test(r.name || "")) return true;
  return !!(r.cont || r.contRef);
}

function lineNotes(r: NamedCount): string {
  return [
    clean(r.note),
    clean(r.contRef),
    r.cont ? `CONT ${clean(r.cont)}` : "",
    (r.flags || [])
      .filter((f) => f !== "asAbove")
      .map((f) => f.toUpperCase())
      .join(" "),
    r.tierTbc ? "TIER TBC" : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** tier + name, case- and space-insensitive — the pooling identity. */
export function cbKey(tier: ReqTier, name: string): string {
  return `${tier}|${clean(name).toLowerCase()}`;
}

function toLine(r: NamedCount, tier: ReqTier, reference: boolean, slot: number): CbLine {
  const fromAbove = isFromAbove(r);
  const raw = clean(r.name);
  const name = raw || (tier === "SA" ? "SA's" : tier);
  return {
    no: +r.count || 0,
    name: fromAbove && !/from above/i.test(name) ? `${name} (FROM ABOVE)` : name,
    notes: lineNotes(r),
    tier,
    fromAbove,
    reference,
    tbc: !!r.tierTbc,
    // pool on the SOURCE name, never the decorated one, so a "(FROM ABOVE)"
    // suffix can't split a group away from its own pool
    key: cbKey(tier, raw.replace(/\s*\(\s*from above[^)]*\)/i, "")),
    slot,
  };
}

function push(
  into: CbLine[],
  arr: NamedCount[] | undefined,
  tier: ReqTier,
  reference: boolean
): void {
  (arr || []).forEach((r, i) => {
    if (!clean(r.name) && !(+r.count || 0)) return;
    into.push(toLine(r, r.tier ?? tier, reference, i));
  });
}

/** The crowd + stunts/other lines a scene prints, in document order. */
export function cbSceneLines(sc: Scene): { crowd: CbLine[]; other: CbLine[] } {
  const crowd: CbLine[] = [];
  const other: CbLine[] = [];
  // anonymous background carries no name in the source — still a real line
  if (sc.sa > 0) {
    crowd.push({
      no: sc.sa,
      name: "SA's",
      notes: "",
      tier: "SA",
      fromAbove: false,
      reference: false,
      tbc: false,
      // all anonymous background on a day is one pool — that is precisely the
      // "150 SA in three scenes is 150 people" case
      key: cbKey("SA", ""),
      slot: -1,
    });
  }
  push(crowd, sc.saChars, "SA", false);
  push(crowd, sc.featured, "Featured", false);
  push(crowd, sc.spacts, "SPACT", false);
  push(other, sc.extras, "Stunt", true);
  push(other, sc.children, "Child", true);
  push(other, sc.avs, "AV", true);
  // A scene whose whole cell reads "(FROM ABOVE)" lists nothing of its own —
  // it inherits the previous scene's people. Print that as the single line it
  // is, so the document never shows a silently blank requirement cell.
  if (!crowd.length && (sc.contFrom || sc.contFromRef)) {
    crowd.push({
      no: null,
      name: clean(sc.contFrom ? `AS SCENE ${sc.contFrom} (FROM ABOVE)` : sc.contFromRef).toUpperCase(),
      notes: "",
      tier: "SA",
      fromAbove: true,
      reference: false,
      tbc: false,
      key: cbKey("SA", ""),
      slot: -1,
    });
  }
  return { crowd, other };
}

const headsOf = (lines: CbLine[]): number =>
  lines.reduce((a, l) => a + (l.fromAbove ? 0 : l.no || 0), 0);

/**
 * Fold a day's scene lines into its booking figure.
 *
 * A shoot day calls each group ONCE, so its requirement is the peak of each
 * identity across the day's scenes, never the sum. "150 SA" appearing in three
 * scenes of the same day is 150 people called for the day — booking 450 would
 * treble the day's crowd and its cost. Two DIFFERENT groups still add ("5
 * nurses" + "3 doctors" = 8), which is exactly what pooling by tier+name gives.
 *
 * This is the same rule the day board and the cost engine already apply
 * (daySaTotal / computeCrowdCosts), so every surface now agrees.
 */
export function poolDayHeads(scenes: { crowd: CbLine[]; other: CbLine[] }[]): {
  crowd: number;
  other: number;
} {
  const peak = (pick: (s: { crowd: CbLine[]; other: CbLine[] }) => CbLine[]): number => {
    const pools = new Map<string, number>();
    for (const sc of scenes) {
      for (const l of pick(sc)) {
        if (l.fromAbove) continue; // same people as an earlier scene
        pools.set(l.key, Math.max(pools.get(l.key) || 0, l.no || 0));
      }
    }
    let total = 0;
    for (const v of pools.values()) total += v;
    return total;
  };
  return { crowd: peak((s) => s.crowd), other: peak((s) => s.other) };
}

function buildScene(d: ShootDay, sc: Scene, idx: number): CbScene {
  const { crowd, other } = cbSceneLines(sc);
  const hasAny = crowd.length > 0 || other.length > 0;
  return {
    kind: "scene",
    dayId: d.id || `M${d.num}`,
    sceneNum: sc.num,
    sceneIdx: idx,
    num: clean(sc.num) + (clean(sc.part) ? ` PT ${clean(sc.part)}` : ""),
    loc: clean(d.loc).toUpperCase(),
    ie: clean(sc.ie).toUpperCase(),
    slug: clean(sc.slug || sc.desc).toUpperCase(),
    desc: clean(sc.slug ? sc.desc : ""),
    cast: (sc.cast || [])
      .map((c) => clean(c.code))
      .filter(Boolean)
      .join(", "),
    scriptDay: clean(sc.scriptDay).toUpperCase(),
    tod: clean(sc.tod).toUpperCase(),
    pages: clean(sc.pages),
    crowd,
    other,
    na: !hasAny && sc.reqStatus === "none",
    pending: !hasAny && sc.reqStatus !== "none",
    // what THIS scene needs on screen. The day's booking figure is pooled
    // across scenes (poolDayHeads) and is deliberately not a sum of these.
    heads: headsOf(crowd),
    otherHeads: headsOf(other),
  };
}

/**
 * Project a schedule model into the printable Crowd Breakdown document.
 * Nothing here reads the clock or the DOM — same model in, same document out.
 */
export function projectCrowdDoc(model: ScheduleModel, opts: CbOpts = {}): CbDoc {
  const includeOther = opts.includeOther !== false;
  const useWeeks = opts.weeks !== false;
  const rows: CbRow[] = [];

  const subtitle = [
    "CROWD BREAKDOWN",
    clean(opts.breakdownDate),
    opts.scheduleDate ? `BASED ON SHOOTING SCHEDULE ${clean(opts.scheduleDate)}` : "",
    "& NOTES",
  ]
    .filter(Boolean)
    .join(" ");

  let crowdTotal = 0;
  let otherTotal = 0;
  let sceneCount = 0;
  let crowded = 0;
  let confirmedNone = 0;
  let unassessed = 0;

  const days = model.days || [];
  // Week numbers run in schedule order from the first dated day.
  const weekIndex = new Map<string, number>();
  const keyOf = (d: ShootDay): string => {
    const dt = d._date;
    if (!dt) return "";
    const m = new Date(dt);
    m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
    return m.toISOString().slice(0, 10);
  };
  for (const d of days) {
    const k = keyOf(d);
    if (k && !weekIndex.has(k)) weekIndex.set(k, weekIndex.size + 1);
  }

  let curWeek = "";
  let weekCrowd = 0;
  let weekOther = 0;

  const closeWeek = () => {
    if (!useWeeks || !curWeek) return;
    const n = weekIndex.get(curWeek);
    rows.push({
      kind: "weekTotal",
      label: `WEEK ${n} TOTAL`,
      no: weekCrowd,
      otherLabel: includeOther ? `WEEK ${n} STUNTS/OTHER TOTAL` : "",
      otherNo: includeOther ? weekOther : 0,
    });
    weekCrowd = 0;
    weekOther = 0;
  };

  for (const d of days) {
    const wk = keyOf(d);
    if (useWeeks && wk && wk !== curWeek) {
      closeWeek();
      curWeek = wk;
      rows.push({ kind: "week", label: `WEEK ${weekIndex.get(wk)}` });
    }

    rows.push({
      kind: "day",
      label: cbDayLabel(d),
      sub: `Day ${d.num}`,
      dayId: d.id,
    });
    rows.push({ kind: "unit", label: cbUnitLabel(d), dayId: d.id });

    const dayScenes: CbScene[] = [];

    // Location banners split the day into blocks — "EXT USS AUGUSTA BUILD".
    const blocks = new Map<number, string>();
    for (const b of d.locBlocks || []) {
      if (b.from > 0 && clean(b.loc)) blocks.set(b.from, clean(b.loc).toUpperCase());
    }

    (d.scenes || []).forEach((sc, i) => {
      const banner = blocks.get(i);
      if (banner) rows.push({ kind: "banner", label: banner });
      for (const t of sc.tags || []) {
        if (/^(SET MOVE|IF TIME ALLOWS|COMPANY MOVE|UNIT MOVE|MOVE)$/i.test(t)) {
          rows.push({ kind: "banner", label: clean(t).toUpperCase() });
        }
      }

      const row = buildScene(d, sc, i);
      const empty = !row.crowd.length && !row.other.length;
      if (opts.hideEmpty && empty) return;

      sceneCount++;
      if (!empty) crowded++;
      else if (row.na) confirmedNone++;
      else unassessed++;

      if (!includeOther) row.other = [];
      dayScenes.push(row);
      rows.push(row);
    });

    // peak-per-identity across the day, NOT the sum of the scene figures
    const pooled = poolDayHeads(dayScenes);
    const dayCrowd = pooled.crowd;
    const dayOther = includeOther ? pooled.other : 0;

    rows.push({
      kind: "dayTotal",
      label: unitTotalLabel(d),
      no: dayCrowd,
      otherLabel: includeOther ? "STUNTS/OTHER TOTAL" : "",
      otherNo: dayOther,
    });

    crowdTotal += dayCrowd;
    otherTotal += dayOther;
    weekCrowd += dayCrowd;
    weekOther += dayOther;
  }

  closeWeek();

  if (days.length) {
    rows.push({
      kind: "grandTotal",
      label: "BREAKDOWN TOTAL",
      no: crowdTotal,
      otherLabel: includeOther ? "STUNTS/OTHER TOTAL" : "",
      otherNo: includeOther ? otherTotal : 0,
    });
  }

  const assessed = crowded + confirmedNone + unassessed;
  return {
    title: clean(opts.production) || "CROWD BREAKDOWN",
    subtitle,
    columns: includeOther ? [...CB_COLUMNS] : CB_COLUMNS.slice(0, 6),
    rows,
    totals: {
      crowd: crowdTotal,
      other: otherTotal,
      days: days.length,
      scenes: sceneCount,
      crowded,
      confirmedNone,
      unassessed,
      pctAssessed: assessed
        ? Math.round(((crowded + confirmedNone) / assessed) * 100)
        : 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Styled workbook projection.
//
// The .xlsx has to be the same DOCUMENT, not a data dump of it: the AD opens
// it in Excel, edits a number and prints it. So this describes the grid's
// structure — banding, merges, column widths, which cells are numbers — and
// the writer turns that into real Excel formatting. Still pure: no exceljs
// types leak in here, so the shape stays testable.
// ---------------------------------------------------------------------------

export type CbSheetRowKind =
  | "title"
  | "subtitle"
  | "blank"
  | "header"
  | "week"
  | "day"
  | "unit"
  | "banner"
  | "scene"
  | "dayTotal"
  | "weekTotal"
  | "grandTotal";

export interface CbSheetRow {
  kind: CbSheetRowKind;
  cells: (string | number | null)[];
  /** merge the whole row into one cell (bands and the title block) */
  full?: boolean;
  /** this row's crowd line is carried from another scene — never a booking */
  fromAbove?: boolean;
  /** nobody has assessed this scene yet */
  pending?: boolean;
}

export interface CbVMerge {
  /** 0-based column */
  col: number;
  /** 1-based first row */
  from: number;
  /** 1-based last row */
  to: number;
}

export interface CbStyledSheet {
  name: string;
  columns: string[];
  /** Excel column widths, in characters */
  widths: number[];
  rows: CbSheetRow[];
  /** vertical merges for scene blocks (scene / description / day cells) */
  merges: CbVMerge[];
  /** 1-based row the column headings sit on — frozen and repeated when printed */
  headerRow: number;
}

// Proportional to the on-screen column widths, in Excel character units.
const CB_WIDTHS_8 = [14, 46, 11, 6, 32, 22, 6, 28];

export function cbToStyledSheet(doc: CbDoc): CbStyledSheet {
  const w = doc.columns.length;
  const widths = w === 8 ? CB_WIDTHS_8 : CB_WIDTHS_8.slice(0, 6);
  const rows: CbSheetRow[] = [];
  const merges: CbVMerge[] = [];

  const pad = (cells: (string | number | null)[]): (string | number | null)[] => {
    const out = cells.slice(0, w);
    while (out.length < w) out.push(null);
    return out;
  };
  const add = (r: CbSheetRow): number => {
    rows.push({ ...r, cells: pad(r.cells) });
    return rows.length; // 1-based
  };

  add({ kind: "title", cells: [doc.title], full: true });
  add({ kind: "subtitle", cells: [doc.subtitle], full: true });
  add({ kind: "blank", cells: [] });
  const headerRow = add({ kind: "header", cells: [...doc.columns] });

  for (const r of doc.rows) {
    if (r.kind === "scene") {
      const sc = r as CbScene;
      const desc = [
        [sc.ie, sc.slug].filter(Boolean).join("   "),
        sc.desc,
        sc.cast,
      ]
        .filter(Boolean)
        .join("\n");
      const dayCell = [
        [sc.tod, sc.scriptDay].filter(Boolean).join(" "),
        sc.pages,
      ]
        .filter(Boolean)
        .join("\n");
      const sceneCell = [sc.num, sc.loc].filter(Boolean).join("\n");
      const n = Math.max(1, sc.crowd.length, sc.other.length);
      const first = rows.length + 1;
      for (let i = 0; i < n; i++) {
        const c = sc.crowd[i];
        const o = sc.other[i];
        const blank = i === 0 && !sc.crowd.length;
        add({
          kind: "scene",
          fromAbove: !!(c && c.fromAbove),
          pending: blank && sc.pending,
          cells: [
            i === 0 ? sceneCell : null,
            i === 0 ? desc : null,
            i === 0 ? dayCell : null,
            c ? (c.fromAbove ? null : (c.no ?? null)) : null,
            c ? c.name : blank ? (sc.na ? "N/A" : "Not yet assessed") : null,
            c ? c.notes || null : null,
            o ? (o.fromAbove ? null : (o.no ?? null)) : null,
            o ? o.name : null,
          ],
        });
      }
      const last = rows.length;
      if (last > first) {
        // the scene, description and day cells span their whole block, exactly
        // as the printed grid reads
        for (const col of [0, 1, 2]) merges.push({ col, from: first, to: last });
      }
      continue;
    }
    if (r.kind === "dayTotal" || r.kind === "weekTotal" || r.kind === "grandTotal") {
      const t = r as CbTotalRow;
      add({
        kind: r.kind,
        cells: [null, null, t.label, t.no, null, t.otherLabel || null, w > 6 ? t.otherNo : null, null],
      });
      continue;
    }
    const b = r as CbBandRow;
    add({
      kind: b.kind,
      full: true,
      cells: [b.sub ? `${b.label}     ${b.sub}` : b.label],
    });
  }

  return { name: "Crowd Breakdown", columns: [...doc.columns], widths, rows, merges, headerRow };
}

/**
 * Flatten the document to spreadsheet rows — the SAME rows the screen shows.
 * A scene with N requirement lines occupies max(1, N) rows, with the scene's
 * own cells printed on the first of them, exactly as the printed grid reads.
 */
export function cbToSheet(doc: CbDoc): { name: string; rows: string[][] } {
  const w = doc.columns.length;
  const pad = (cells: (string | number)[]): string[] => {
    const out = cells.map((c) => (c === null || c === undefined ? "" : String(c)));
    while (out.length < w) out.push("");
    return out.slice(0, w);
  };
  const rows: string[][] = [];
  rows.push(pad([doc.title]));
  rows.push(pad([doc.subtitle]));
  rows.push(pad([]));
  rows.push(pad([...doc.columns]));

  for (const r of doc.rows) {
    if (r.kind === "scene") {
      const sc = r as CbScene;
      const descLines = [
        [sc.ie, sc.slug].filter(Boolean).join("  "),
        sc.desc,
        sc.cast,
      ].filter(Boolean);
      // matches the grid: "NIGHT 7" on one line, eighths under it
      const dayLines = [
        [sc.tod, sc.scriptDay].filter(Boolean).join(" "),
        sc.pages,
      ].filter(Boolean);
      const n = Math.max(1, sc.crowd.length, sc.other.length);
      for (let i = 0; i < n; i++) {
        const c = sc.crowd[i];
        const o = sc.other[i];
        const emptyLabel = sc.na ? "N/A" : sc.pending ? "" : "";
        rows.push(
          pad([
            i === 0 ? sc.num : "",
            i === 0 ? descLines.join(" | ") : "",
            i === 0 ? dayLines.join(" | ") : "",
            c ? (c.fromAbove ? "" : (c.no ?? "")) : "",
            c ? c.name : i === 0 ? emptyLabel : "",
            c ? c.notes : "",
            o ? (o.fromAbove ? "" : (o.no ?? "")) : "",
            o ? o.name + (o.notes ? ` — ${o.notes}` : "") : "",
          ])
        );
      }
      // scene location prints under the number in the grid; keep it addressable
      if (sc.loc) rows[rows.length - Math.max(1, n)][0] = `${sc.num}  ${sc.loc}`;
      continue;
    }
    if (r.kind === "dayTotal" || r.kind === "weekTotal" || r.kind === "grandTotal") {
      const t = r as CbTotalRow;
      rows.push(pad(["", "", t.label, t.no, "", t.otherLabel, t.otherNo, ""]));
      continue;
    }
    const b = r as CbBandRow;
    rows.push(pad([b.label, b.sub || ""]));
  }
  return { name: "Crowd Breakdown", rows };
}
