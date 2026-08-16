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
import { weekKey } from "./model";
import { money, sumMoney } from "./money";

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

// Optional money columns, appended only when the breakdown is asked to show
// costs. They are OFF by default: the document's normal audience (ADs,
// costume, make-up, locations) must never receive rate information.
export const CB_COST_COLUMNS = ["FEES", "COST"] as const;

// ---------------------------------------------------------------------------
// Column layout — the single source of truth for column ORDER and visibility.
//
// The breakdown's columns come in fixed *segments* (a count never leaves the
// group it counts, FEES never leaves COST). An AD can reorder the segments —
// e.g. put SCENE DESCRIPTION first — but the guardrail is that the paired
// columns always travel together, so merged scene blocks and the running
// totals can never be torn apart. Every projection below (screen, .xlsx, .csv)
// is driven by the array this produces, so the printed page, the emailed sheet
// and the Google-Sheets import can never disagree about where a column sits.
// ---------------------------------------------------------------------------

/** A reorderable block of columns. */
export type CbSegKey = "scene" | "desc" | "day" | "crowd" | "other" | "cost";

/** One physical column, identified by the role its cell values play. */
export type CbColRole =
  | "sceneNum"
  | "desc"
  | "day"
  | "crowdNo"
  | "crowdName"
  | "crowdCombo"
  | "crowdNotes"
  | "otherNo"
  | "otherName"
  | "fees"
  | "cost";

export interface CbColDef {
  role: CbColRole;
  /** the reorderable segment this column belongs to */
  seg: CbSegKey;
  /** column heading, verbatim from the reference documents */
  header: string;
  /** a scene-block cell that spans its whole requirement block (vertical merge) */
  block: boolean;
  /** a head count — printed as a real number so a spreadsheet can total it */
  count: boolean;
  /** a money column (FEES / COST) */
  money: boolean;
  /** Excel column width, in characters (proportional to the on-screen widths) */
  width: number;
}

/** The canonical, reference-document order of the segments. */
export const CB_SEG_ORDER: CbSegKey[] = [
  "scene",
  "desc",
  "day",
  "crowd",
  "other",
  "cost",
];

/** Human labels for the builder UI. */
export const CB_SEG_LABELS: Record<CbSegKey, string> = {
  scene: "Scene",
  desc: "Scene description",
  day: "Day",
  crowd: "Crowd",
  other: "Stunts / other",
  cost: "Fees & costs",
};

const CB_COL_META: Record<
  CbColRole,
  { header: string; block: boolean; count: boolean; money: boolean; width: number; seg: CbSegKey }
> = {
  sceneNum: { header: "SCENE", block: true, count: false, money: false, width: 14, seg: "scene" },
  desc: { header: "SCENE DESCRIPTION", block: true, count: false, money: false, width: 46, seg: "desc" },
  day: { header: "DAY", block: true, count: false, money: false, width: 11, seg: "day" },
  crowdNo: { header: "NO.", block: false, count: true, money: false, width: 6, seg: "crowd" },
  crowdName: { header: "CROWD CHARACTER", block: false, count: false, money: false, width: 32, seg: "crowd" },
  // the merged column: count + name in one cell (count-then-name). Marked as
  // the count-bearing column so the total rows still show the number here.
  crowdCombo: { header: "CROWD CHARACTER", block: false, count: true, money: false, width: 38, seg: "crowd" },
  crowdNotes: { header: "NOTES/CONTINUITY", block: false, count: false, money: false, width: 22, seg: "crowd" },
  otherNo: { header: "NO.", block: false, count: true, money: false, width: 6, seg: "other" },
  otherName: { header: "STUNTS/OTHER", block: false, count: false, money: false, width: 28, seg: "other" },
  fees: { header: "FEES", block: false, count: false, money: true, width: 11, seg: "cost" },
  cost: { header: "COST", block: false, count: false, money: true, width: 13, seg: "cost" },
};

// Which physical columns each segment contains, in their own fixed order.
const CB_SEG_ROLES: Record<CbSegKey, CbColRole[]> = {
  scene: ["sceneNum"],
  desc: ["desc"],
  day: ["day"],
  crowd: ["crowdNo", "crowdName", "crowdNotes"],
  other: ["otherNo", "otherName"],
  cost: ["cost"],
};

export interface CbLayoutOpts {
  /** desired segment order; unknown/duplicate keys are ignored, missing ones appended */
  order?: CbSegKey[];
  /** show the NOTES/CONTINUITY column (default true) */
  notes?: boolean;
  /** include the STUNTS/OTHER segment */
  includeOther?: boolean;
  /** include the FEES & COST segment */
  costs?: boolean;
  /** merge the crowd NO. and CROWD CHARACTER columns into one (count-then-name) */
  mergeCrowd?: boolean;
}

/**
 * Resolve a requested segment order into the flat, validated list of columns.
 * Always returns a usable layout: unknown keys are dropped, duplicates ignored,
 * and any segment the caller forgot is appended in canonical order — so a saved
 * order from an older/newer build can never produce a broken document.
 */
export function cbColumnLayout(opts: CbLayoutOpts = {}): CbColDef[] {
  const showNotes = opts.notes !== false;
  const seen = new Set<CbSegKey>();
  const order: CbSegKey[] = [];
  for (const k of opts.order || []) {
    if (CB_SEG_ROLES[k] && !seen.has(k)) {
      seen.add(k);
      order.push(k);
    }
  }
  for (const k of CB_SEG_ORDER) if (!seen.has(k)) order.push(k);

  const defs: CbColDef[] = [];
  for (const seg of order) {
    if (seg === "other" && !opts.includeOther) continue;
    if (seg === "cost" && !opts.costs) continue;
    // the crowd segment collapses to one combined column when merge is on
    const roles =
      seg === "crowd"
        ? opts.mergeCrowd
          ? (["crowdCombo", "crowdNotes"] as CbColRole[])
          : (["crowdNo", "crowdName", "crowdNotes"] as CbColRole[])
        : CB_SEG_ROLES[seg];
    for (const role of roles) {
      if (role === "crowdNotes" && !showNotes) continue;
      const m = CB_COL_META[role];
      defs.push({
        role,
        seg,
        header: m.header,
        block: m.block,
        count: m.count,
        money: m.money,
        width: m.width,
      });
    }
  }
  return defs;
}

/** Column-letter for a 0-based spreadsheet column index (A, B, … Z, AA …). */
export function cbColLetter(index: number): string {
  let n = index;
  let s = "";
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

/** One requirement line inside a scene block. */
export interface CbLine {
  /**
   * What THIS scene needs — printed for every line, carried or not, because it
   * is what the floor reads off the page and it changes scene by scene. It is
   * null only where the source gives no number at all (a whole-scene "AS SCENE
   * 12" pointer). Whether the day BOOKS these people is a separate question,
   * answered by `fromAbove` and by the "(FROM …)" label on the name.
   */
  no: number | null;
  name: string;
  notes: string;
  tier: ReqTier;
  fromAbove: boolean;
  /** explicitly marked in the schedule editor, rather than inferred from a repeat */
  explicitFromAbove: boolean;
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
  /**
   * WHICH scene array the row came from — the other half of the write-back
   * address for the STUNTS/OTHER column, whose three sources (stunt extras,
   * children, action vehicles) are printed as one merged list.
   */
  src?: "extras" | "children" | "avs";
  /**
   * The line is a pure pointer at another scene ("AS SCENE 12"), not a group
   * of its own — it never books and never gets re-labelled.
   */
  pointer?: boolean;
  /** supplementary fee per head on this line (Featured = SA + sups) */
  sup: number;
  /**
   * The custom role this group is paid on, carried straight off the source row
   * (`NamedCount.roleId`). Absent on every line of a production with no roles,
   * which is why such a document is byte-identical to one built before roles
   * existed.
   *
   * It is on the LINE, and the line is priced through it, because this
   * document is what a producer signs off: matching a printed line back to its
   * group by NAME afterwards is a money path resting on a string, and two
   * same-named groups on different scenes break it silently.
   */
  roleId?: string;
  /** What that role is called, resolved by the caller (`CbOpts.roleLabel`). */
  roleLabel?: string;
  /**
   * The role this line names no longer exists. The line falls back to its TIER
   * rate — never dropped, never costed at nothing — and its id is listed in
   * `CbDoc.missingRoles` so the UI says so rather than printing a wrong number
   * quietly. Same rule the cost engine applies (`CrowdCosts.missingRoles`).
   */
  roleMissing?: boolean;
  /**
   * Indicative cost of this line: heads × (per-head day rate for its role, or
   * for its tier + supplementary fee). Zero unless the caller supplied a
   * per-head resolver.
   * NEVER summed into a day figure — a day's people are pooled across its
   * scenes, so the day's cost comes from the cost engine, not from these.
   */
  cost: number;
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
  /** supplementary fees on this scene's crowd lines (heads × fee) */
  fees: number;
  /** indicative cost of this scene's crowd lines — see CbLine.cost */
  cost: number;
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
  /** supplementary fees booked in this band */
  fees: number;
  /** what this band costs — days from the cost engine, weeks/total summed */
  cost: number;
}

export type CbRow = CbBandRow | CbScene | CbTotalRow;

export interface CbDoc {
  title: string;
  subtitle: string;
  /** column headings in display order (derived from `layout`) */
  columns: string[];
  /** the ordered, resolved column layout every projection is driven by */
  layout: CbColDef[];
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
    /** supplementary fees across the whole breakdown */
    fees: number;
    /** whole-breakdown cost — the sum of the day costs */
    cost: number;
  };
  /** money columns are present on this projection */
  costs: boolean;
  /**
   * Role ids named by lines in this document whose role no longer exists,
   * de-duplicated and in the order they were met. Those lines are priced on
   * their own tier, which is a safe number but not the one the user asked for
   * — so the UI reports it instead of printing it quietly.
   */
  missingRoles: string[];
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
  /** show the NOTES/CONTINUITY column (default true) */
  notes?: boolean;
  /** merge the crowd NO. and CROWD CHARACTER columns into one (count-then-name) */
  mergeCrowd?: boolean;
  /** desired column-segment order (see cbColumnLayout); invalid entries ignored */
  order?: CbSegKey[];
  /** print week banners and week totals */
  weeks?: boolean;
  /**
   * Append the FEES and COST columns. Off by default — the circulated
   * document carries no money.
   */
  costs?: boolean;
  /**
   * Per-head day rate on a given day, holiday/OT/travel included. Supplied by
   * the caller (the cost engine owns the rate maths; this file never
   * duplicates it). Only consulted when `costs` is on.
   *
   * `roleId` is passed whenever the line names a custom role that still
   * exists, and the caller must answer with THAT ROLE's per-head figure — a
   * stand-in printed at the SA rate is a wrong number on a document that goes
   * out of the building. It is passed as undefined for a plain tier line and
   * for a line whose role has been deleted (which falls back to its tier and
   * is reported on `CbDoc.missingRoles`).
   */
  perHead?: (dayId: string, tier: ReqTier, roleId?: string) => number;
  /**
   * What a custom role is called. Returning undefined means the role no longer
   * exists: the line falls back to its tier rate and its id is collected into
   * `CbDoc.missingRoles`. A caller that supplies no resolver at all is saying
   * it has no roles, so every role line falls back — which is exactly the
   * behaviour before roles existed.
   */
  roleLabel?: (roleId: string) => string | undefined;
  /**
   * What a whole shoot day costs, from the cost engine. Used for the day
   * total rows — a day's people are a pooled peak, never a sum of its scene
   * lines, so this must not be derived from the lines above it.
   */
  dayCost?: (dayId: string) => number;
}

const clean = (v: unknown): string => String(v ?? "").replace(/\s+/g, " ").trim();
/** Same words ignoring case, spacing and punctuation — used to spot a set line
 *  and an action sentence that are really the one text stored twice. */
const sameText = (a: unknown, b: unknown): boolean => {
  const k = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const x = k(a);
  return !!x && x === k(b);
};

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

/** The same identity re-bucketed onto a live custom role — `role:<id>|name`,
 *  the bucket the cost engine pools that group in (crowd.ts). */
export function keyOnRole(key: string, roleId: string): string {
  return `role:${roleId}|${key.slice(key.indexOf("|") + 1)}`;
}

function toLine(
  r: NamedCount,
  tier: ReqTier,
  reference: boolean,
  slot: number,
  src?: "extras" | "children" | "avs"
): CbLine {
  const fromAbove = isFromAbove(r);
  const raw = clean(r.name);
  const name = raw || (tier === "SA" ? "SA's" : tier);
  return {
    // the day pass (markDayBookings) decides which lines actually book people
    // and blanks the rest, so every line starts out with its own figure
    no: +r.count || 0,
    name,
    src,
    notes: lineNotes(r),
    tier,
    fromAbove,
    explicitFromAbove: fromAbove,
    reference,
    tbc: !!r.tierTbc,
    // Pool on the group's own name, with any carried-from decoration stripped
    // ("(48 FROM ABOVE)", "(FROM SC 12)") — a label the document itself wrote
    // must never split a group away from the people it is pointing at.
    key: cbKey(tier, raw.replace(/\s*\(\s*(?:\d+\s+)?from\s+(?:above|below|sc\b)[^)]*\)/i, "")),
    slot,
    sup: +(r.sup ?? 0) || 0,
    // carried, never inferred: the row itself says which role it is paid on
    ...(clean(r.roleId) ? { roleId: clean(r.roleId) } : {}),
    cost: 0,
  };
}

function push(
  into: CbLine[],
  arr: NamedCount[] | undefined,
  tier: ReqTier,
  reference: boolean,
  src?: "extras" | "children" | "avs"
): void {
  (arr || []).forEach((r, i) => {
    if (!clean(r.name) && !(+r.count || 0)) return;
    into.push(toLine(r, r.tier ?? tier, reference, i, src));
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
      // The anonymous bucket carries its continuity flag on the scene, not on a
      // row (there is no row — `sa` is a bare integer). The day board reads it,
      // so this document must too: otherwise ticking "from above" on unnamed
      // background moves one view and not the other, and this page would count
      // people the day board says are already booked.
      fromAbove: !!sc.saAbove,
      explicitFromAbove: !!sc.saAbove,
      reference: false,
      tbc: false,
      // all anonymous background on a day is one pool — that is precisely the
      // "150 SA in three scenes is 150 people" case
      key: cbKey("SA", ""),
      slot: -1,
      sup: 0,
      cost: 0,
    });
  }
  push(crowd, sc.saChars, "SA", false);
  push(crowd, sc.featured, "Featured", false);
  push(crowd, sc.spacts, "SPACT", false);
  push(other, sc.extras, "Stunt", true, "extras");
  push(other, sc.children, "Child", true, "children");
  push(other, sc.avs, "AV", true, "avs");
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
      explicitFromAbove: true,
      reference: false,
      tbc: false,
      key: cbKey("SA", ""),
      slot: -1,
      pointer: true,
      sup: 0,
      cost: 0,
    });
  }
  return { crowd, other };
}

/**
 * Decide, once per DAY, which lines actually book people.
 *
 * A shoot day calls each group ONCE. "150 SA" in six scenes of the same day is
 * 150 people, not 900, and where a group is called at different strengths
 * through the day (150, then 40, then 130) the day books the biggest call,
 * because every smaller one is part of it. So exactly ONE line per group is the
 * day's booking — the largest — and every other line of that group is labelled
 * as the same people: "(FROM ABOVE)", or "(FROM SC 9/50)" when the scene that
 * books them comes later in the day.
 *
 * Every line KEEPS its own number. What each scene needs is what the AD on the
 * floor reads off the page, and it changes scene by scene, so it must never be
 * hidden. The label is what tells the total which lines to leave out — see
 * cbToStyledSheet, where the day total adds column NO. and skips any line whose
 * CROWD CHARACTER says it is carried.
 */
/**
 * How every carried line is labelled, and the one string the exported day
 * total keys off ("SA (FROM ABOVE)", "SA (FROM SC 9/50)"). Kept in one place
 * because the label and the formula are two halves of the same promise: change
 * the wording without changing this and days silently start double-counting.
 */
export const CB_CARRIED_MARK = "(FROM ";

function markDayBookings(scenes: { num: string; lines: CbLine[] }[]): void {
  // Pass 1 — the biggest call for each identity anywhere in the day. A line the
  // source explicitly marks "as above" can never be the booking: it is a
  // pointer at other people by definition.
  const best = new Map<string, { count: number; line: CbLine; at: number; num: string }>();
  scenes.forEach((sc, at) => {
    for (const line of sc.lines) {
      if (line.explicitFromAbove || line.pointer) continue;
      const count = line.no || 0;
      if (count <= 0) continue;
      const cur = best.get(line.key);
      if (!cur || count > cur.count) best.set(line.key, { count, line, at, num: sc.num });
    }
  });

  // Pass 2 — everything else of that identity is the same people.
  scenes.forEach((sc, at) => {
    for (const line of sc.lines) {
      if (line.pointer) continue; // already says what it points at
      const booking = best.get(line.key);
      if (booking && booking.line === line) continue; // this line IS the booking
      const count = line.no || 0;
      if (!line.fromAbove && count <= 0) continue; // an empty line carries nothing
      line.fromAbove = true;
      line.cost = 0;
      // the line KEEPS line.no — what this scene needs is not the same thing as
      // who the day is booking, and the page has to show both
      // A fee belongs to the GROUP (a wig, a costume, a uniform), so it has to
      // travel to whichever line books them, or it disappears from the day
      // the moment the booking sits in another scene.
      if (booking && line.sup > booking.line.sup) booking.line.sup = line.sup;
      // Where the people on this line are actually booked. Every carried label
      // is written "(FROM …)" without exception — that exact opening is what
      // the exported day total looks for, so a label that drifted out of this
      // shape would quietly start double-counting.
      const where = !booking || booking.at < at
        ? "FROM ABOVE"
        : booking.num
          ? `FROM SC ${clean(booking.num).toUpperCase()}`
          : "FROM BELOW";
      const base = line.name.replace(/\s*\((?:\d+\s+)?from (?:above|below|sc[^)]*)\)\s*$/i, "");
      line.name = `${base} ${CB_CARRIED_MARK}${where.replace(/^FROM /, "")})`;
    }
  });
}

/**
 * What the projection needs to price a line and to name its role. One object
 * so the resolution happens in exactly one place — a role line is priced
 * through its role HERE, at the source, rather than being re-priced afterwards
 * by matching printed names back to schedule groups.
 */
interface CbPricer {
  perHead?: (dayId: string, tier: ReqTier, roleId?: string) => number;
  roleLabel?: (roleId: string) => string | undefined;
  /** role ids met on a line whose role no longer exists, in first-seen order */
  missing: Set<string>;
}

/**
 * Resolve a line's role once. A live role labels the line and becomes what it
 * is priced through; a deleted one is flagged, collected, and the line reverts
 * to its tier.
 */
function resolveLineRole(line: CbLine, px: CbPricer): void {
  if (!line.roleId) return;
  const label = px.roleLabel ? clean(px.roleLabel(line.roleId)) : "";
  if (label) {
    line.roleLabel = label;
    line.roleMissing = false;
    // A live role is its own POOL, exactly as it is in the cost engine, which
    // buckets a row by role-or-tier and then by name. "Guards" as stand-ins and
    // "Guards" as SAs on one day are two groups of people paid two ways: pooling
    // them on the name alone would label one "(FROM ABOVE)" and print it at
    // nothing, and the document would stop agreeing with the day's cost.
    line.key = keyOnRole(line.key, line.roleId);
    return;
  }
  line.roleLabel = undefined;
  line.roleMissing = true;
  px.missing.add(line.roleId);
}

/** Heads this line actually books — a carried line is the same people as an
 *  earlier scene, so it can never be charged twice. */
const bookedHeads = (line: CbLine): number => (line.fromAbove ? 0 : line.no || 0);

/**
 * Indicative cost of one line. Settled the way a payroll chit settles: the
 * per-head figure to the penny first, then paid that many times (money.ts) —
 * never a raw float multiplication.
 */
function lineCost(dayId: string, line: CbLine, px: CbPricer): number {
  if (!px.perHead) return 0;
  const rate = px.perHead(
    dayId,
    line.tier,
    line.roleId && !line.roleMissing ? line.roleId : undefined
  );
  return money(sumMoney(rate, line.sup), bookedHeads(line));
}

function refreshSceneFigures(row: CbScene, px: CbPricer): void {
  row.heads = headsOf(row.crowd);
  row.otherHeads = headsOf(row.other);
  let fees = 0;
  let cost = 0;
  for (const line of row.crowd) {
    line.cost = lineCost(row.dayId, line, px);
    fees = sumMoney(fees, money(line.sup, bookedHeads(line)));
    cost = sumMoney(cost, line.cost);
  }
  row.fees = fees;
  row.cost = cost;
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

/**
 * A day's supplementary fees, pooled on the same identity as its heads. A
 * group appearing in four scenes is one booking, so its fee is paid once —
 * summing the scene lines would charge the same wig four times over.
 */
export function poolDayFees(scenes: { crowd: CbLine[] }[]): number {
  const heads = new Map<string, number>();
  const sup = new Map<string, number>();
  for (const sc of scenes) {
    for (const l of sc.crowd) {
      // a group's fee already travels to the line that books it
      // (markDayBookings), so the printed FEES column and this total agree
      if (l.fromAbove) continue;
      heads.set(l.key, Math.max(heads.get(l.key) || 0, l.no || 0));
      sup.set(l.key, Math.max(sup.get(l.key) || 0, l.sup || 0));
    }
  }
  let total = 0;
  for (const [k, n] of heads) total = sumMoney(total, money(sup.get(k) || 0, n));
  return total;
}

function buildScene(d: ShootDay, sc: Scene, idx: number, px: CbPricer): CbScene {
  const { crowd, other } = cbSceneLines(sc);
  const hasAny = crowd.length > 0 || other.length > 0;
  const dayId = d.id || `M${d.num}`;
  let fees = 0;
  let cost = 0;
  for (const l of crowd) {
    // the role is settled before any money is worked out — a deleted one falls
    // back to the tier here, once, rather than at each place that prices it
    resolveLineRole(l, px);
    l.cost = lineCost(dayId, l, px);
    fees = sumMoney(fees, money(l.sup, bookedHeads(l)));
    cost = sumMoney(cost, l.cost);
  }
  // the stunts/other column is reference-only and roles are crowd-only (the
  // stunt agreement has its own mechanics), so nothing there names a role
  return {
    kind: "scene",
    dayId,
    sceneNum: sc.num,
    sceneIdx: idx,
    num: clean(sc.num) + (clean(sc.part) ? ` PT ${clean(sc.part)}` : ""),
    loc: clean(d.loc).toUpperCase(),
    ie: clean(sc.ie).toUpperCase(),
    slug: clean(sc.slug || sc.desc).toUpperCase(),
    // Older schedules stored the SAME text as both the set line and the action
    // sentence, which printed it twice in the one cell. Only print the action
    // line when it genuinely says something different.
    desc: clean(sc.slug && !sameText(sc.slug, sc.desc) ? sc.desc : ""),
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
    fees,
    cost,
  };
}

/**
 * Project a schedule model into the printable Crowd Breakdown document.
 * Nothing here reads the clock or the DOM — same model in, same document out.
 */
export function projectCrowdDoc(model: ScheduleModel, opts: CbOpts = {}): CbDoc {
  const includeOther = opts.includeOther !== false;
  const useWeeks = opts.weeks !== false;
  const showCosts = !!opts.costs;
  const px: CbPricer = {
    perHead: showCosts ? opts.perHead : undefined,
    roleLabel: opts.roleLabel,
    missing: new Set<string>(),
  };
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
  let feesTotal = 0;
  let costTotal = 0;
  let sceneCount = 0;
  let crowded = 0;
  let confirmedNone = 0;
  let unassessed = 0;

  const days = model.days || [];
  // Week numbers run in schedule order from the first dated day.
  const weekIndex = new Map<string, number>();
  // Same Monday-of-the-week key the cost engine uses. This used to be a local
  // copy that finished with toISOString(), which converts to UTC and so
  // labelled every BST week a day early; sharing weekKey keeps the printed
  // document and the costed weeks describing the same weeks.
  const keyOf = (d: ShootDay): string => (d._date ? weekKey(d._date) : "");
  for (const d of days) {
    const k = keyOf(d);
    if (k && !weekIndex.has(k)) weekIndex.set(k, weekIndex.size + 1);
  }

  let curWeek = "";
  let weekCrowd = 0;
  let weekOther = 0;
  let weekFees = 0;
  let weekCost = 0;

  // The accumulators are ALWAYS reset, whether or not a week total was
  // printed. They used to be reset only inside the early return's happy path,
  // so an undated day (no week key, so it never opens a week of its own)
  // banked its crowd into the running totals and the next real week absorbed
  // it — a week total that counted people who were never in that week.
  const closeWeek = () => {
    if (useWeeks && curWeek) {
      const n = weekIndex.get(curWeek);
      rows.push({
        kind: "weekTotal",
        label: `WEEK ${n} TOTAL`,
        no: weekCrowd,
        otherLabel: includeOther ? `WEEK ${n} STUNTS/OTHER TOTAL` : "",
        otherNo: includeOther ? weekOther : 0,
        fees: weekFees,
        cost: weekCost,
      });
    }
    weekCrowd = 0;
    weekOther = 0;
    weekFees = 0;
    weekCost = 0;
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

    // A banner announces the scene rows beneath it. It used to be pushed
    // before the hideEmpty test, so location and SET MOVE headings printed
    // with nothing under them — in the PDF and in Excel — whenever every
    // scene they introduced was empty. A banner now waits for a scene that
    // actually prints, and carries forward if the first scene of its block is
    // hidden (the block is still starting, just a scene later).
    let pendingBanner: string | null = null;
    (d.scenes || []).forEach((sc, i) => {
      const banner = blocks.get(i);
      if (banner) pendingBanner = banner;
      const moves = (sc.tags || []).filter((t) =>
        /^(SET MOVE|IF TIME ALLOWS|COMPANY MOVE|UNIT MOVE|MOVE)$/i.test(t)
      );

      const row = buildScene(d, sc, i, px);
      const empty = !row.crowd.length && !row.other.length;
      if (opts.hideEmpty && empty) return;

      if (pendingBanner) {
        rows.push({ kind: "banner", label: pendingBanner });
        pendingBanner = null;
      }
      for (const t of moves) rows.push({ kind: "banner", label: clean(t).toUpperCase() });

      sceneCount++;
      if (!empty) crowded++;
      else if (row.na) confirmedNone++;
      else unassessed++;

      dayScenes.push(row);
      rows.push(row);
    });

    // Which lines book people is a decision about the WHOLE day (a group's
    // biggest call can sit in its last scene), so it is taken once the day's
    // scenes are all built — never scene by scene.
    markDayBookings(dayScenes.map((s) => ({ num: s.sceneNum, lines: s.crowd })));
    markDayBookings(dayScenes.map((s) => ({ num: s.sceneNum, lines: s.other })));
    for (const s of dayScenes) {
      refreshSceneFigures(s, px);
      if (!includeOther) s.other = [];
    }

    // peak-per-identity across the day, NOT the sum of the scene figures
    const pooled = poolDayHeads(dayScenes);
    const dayCrowd = pooled.crowd;
    const dayOther = includeOther ? pooled.other : 0;
    const dayFees = showCosts ? poolDayFees(dayScenes) : 0;
    // The day's money comes from the cost engine, which prices the day's
    // pooled requirement with holiday, overtime, early calls and travel. It is
    // deliberately NOT the sum of the scene lines above.
    const dayMoney = showCosts && opts.dayCost ? opts.dayCost(d.id || `M${d.num}`) || 0 : 0;

    rows.push({
      kind: "dayTotal",
      label: unitTotalLabel(d),
      no: dayCrowd,
      otherLabel: includeOther ? "STUNTS/OTHER TOTAL" : "",
      otherNo: dayOther,
      fees: dayFees,
      cost: dayMoney,
    });

    crowdTotal += dayCrowd;
    otherTotal += dayOther;
    weekCrowd += dayCrowd;
    weekOther += dayOther;
    feesTotal = sumMoney(feesTotal, dayFees);
    costTotal = sumMoney(costTotal, dayMoney);
    weekFees = sumMoney(weekFees, dayFees);
    weekCost = sumMoney(weekCost, dayMoney);
  }

  closeWeek();

  if (days.length) {
    rows.push({
      kind: "grandTotal",
      label: "BREAKDOWN TOTAL",
      no: crowdTotal,
      otherLabel: includeOther ? "STUNTS/OTHER TOTAL" : "",
      otherNo: includeOther ? otherTotal : 0,
      fees: feesTotal,
      cost: costTotal,
    });
  }

  const assessed = crowded + confirmedNone + unassessed;
  const layout = cbColumnLayout({
    order: opts.order,
    notes: opts.notes,
    includeOther,
    costs: showCosts,
    mergeCrowd: opts.mergeCrowd,
  });
  return {
    title: clean(opts.production) || "CROWD BREAKDOWN",
    subtitle,
    columns: layout.map((c) => c.header),
    layout,
    costs: showCosts,
    missingRoles: [...px.missing],
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
      fees: feesTotal,
      cost: costTotal,
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

/**
 * A live spreadsheet formula (e.g. week/overall totals). `result` is the value
 * the app already computed, so the cell reads correctly before the spreadsheet
 * recalculates and matches what the app prints.
 */
export interface CbFormulaCell {
  formula: string;
  result: number;
}

export type CbCell = string | number | null | CbFormulaCell;

export interface CbSheetRow {
  kind: CbSheetRowKind;
  cells: CbCell[];
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
  /** the resolved column layout, so the writer can style each cell by its role */
  layout: CbColDef[];
  /** Excel column widths, in characters */
  widths: number[];
  rows: CbSheetRow[];
  /** vertical merges for scene blocks (scene / description / day cells) */
  merges: CbVMerge[];
  /** 1-based row the column headings sit on — frozen and repeated when printed */
  headerRow: number;
}

// Find the physical index of a role in the layout, or -1 when it is not shown.
const roleIndex = (layout: CbColDef[], role: CbColRole): number =>
  layout.findIndex((c) => c.role === role);

// The crowd count lives in NO. normally, or in the merged CROWD CHARACTER column
// when the two are combined — either way it is where the total number prints.
const crowdCountIndex = (layout: CbColDef[]): number => {
  const i = roleIndex(layout, "crowdNo");
  return i >= 0 ? i : roleIndex(layout, "crowdCombo");
};

// "38 SA" — count then name, in a single merged cell. A carried line keeps its
// count too; it is the "(FROM ABOVE)" label on the name that keeps it out of
// the totals.
export function cbComboText(c: CbLine | undefined, blank: boolean, na: boolean): string {
  if (!c) return blank && na ? "N/A" : "";
  const no = c.no != null ? String(c.no) : "";
  return [no, c.name].filter(Boolean).join(" ");
}

export function cbToStyledSheet(doc: CbDoc): CbStyledSheet {
  const layout = doc.layout;
  const w = layout.length;
  const widths = layout.map((c) => c.width);
  const rows: CbSheetRow[] = [];
  const merges: CbVMerge[] = [];

  // Cells are placed by role into the layout's order — reorder the columns and
  // every value follows automatically, so screen, .xlsx and .csv stay in step.
  const build = (get: (role: CbColRole, def: CbColDef, idx: number) => CbCell): CbCell[] =>
    layout.map((def, idx) => get(def.role, def, idx));
  const add = (r: Omit<CbSheetRow, "cells"> & { cells: CbCell[] }): number => {
    rows.push(r);
    return rows.length; // 1-based
  };
  const full = (kind: CbSheetRowKind, text: string): number =>
    add({ kind, full: true, cells: [text, ...Array(Math.max(0, w - 1)).fill(null)] });

  full("title", doc.title);
  full("subtitle", doc.subtitle);
  add({ kind: "blank", cells: Array(w).fill(null) });
  const headerRow = add({ kind: "header", cells: layout.map((c) => c.header) });

  // Live totals. A day adds up its NO. column between its unit band and its
  // total row, SKIPPING any line whose CROWD CHARACTER says it is carried —
  // "SA (FROM ABOVE)", "SA (FROM SC 9/50)". Every line keeps its own number,
  // because what a scene needs changes scene by scene and the floor reads it
  // off this page; the label is what stops the same people being booked twice.
  // Weeks then add their day totals, and the breakdown adds the weeks.
  //
  // The exclusion is written with SUMPRODUCT + SEARCH deliberately. The obvious
  // alternatives are traps: SUMIFS with a "<>*FROM*" wildcard behaves
  // differently between Excel and Google Sheets, and MAXIFS (which this
  // document used to lean on) refuses to take a range as its criteria in Google
  // Sheets at all — that is the "#VALUE! mismatched range sizes" error that
  // arrived in real productions' inboxes. SUMPRODUCT with a SEARCH test is
  // array-native in both applications, and is one line a recipient can read.
  //
  // The formula columns are resolved from wherever each count/money column
  // actually lands in the layout, so reordering never breaks the totals.
  const crowdIdx = crowdCountIndex(layout);
  const otherIdx = roleIndex(layout, "otherNo");
  const feesIdx = roleIndex(layout, "fees");
  const costIdx = roleIndex(layout, "cost");
  const CROWD_COL = cbColLetter(crowdIdx);
  const OTHER_COL = otherIdx >= 0 ? cbColLetter(otherIdx) : "";
  const FEES_COL = feesIdx >= 0 ? cbColLetter(feesIdx) : "";
  const COST_COL = costIdx >= 0 ? cbColLetter(costIdx) : "";
  const sumOf = (rowNums: number[], col: string): string =>
    rowNums.map((n) => `${col}${n}`).join("+");
  // A day's people: add its scene lines, less the carried ones. Needs both a
  // numeric count column and the name column that labels it — when the count
  // and the name are merged into one column the entries are text ("20
  // GUARDS"), which no formula can safely add, so that layout keeps the figure
  // the app worked out.
  //
  // CB_CARRIED_MARK is the opening of every carried label the document writes
  // (markDayBookings); nothing else in a crowd character name looks like it.
  const dayCount = (
    countIdx: number,
    nameIdx: number,
    from: number,
    to: number
  ): string | null => {
    if (countIdx < 0 || nameIdx < 0 || from > to) return null;
    const counts = `${cbColLetter(countIdx)}${from}:${cbColLetter(countIdx)}${to}`;
    const names = `${cbColLetter(nameIdx)}${from}:${cbColLetter(nameIdx)}${to}`;
    return `SUMPRODUCT(${counts},--ISERROR(SEARCH("${CB_CARRIED_MARK}",${names})))`;
  };
  let dayTotalRows: number[] = []; // day-total rows since the last week total
  const weekTotalRows: number[] = []; // week-total rows, for the breakdown total
  let dayFirstDetailRow = 0;

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
        const heads = c && !c.fromAbove ? c.no || 0 : 0;
        add({
          kind: "scene",
          fromAbove: !!(c && c.fromAbove),
          pending: blank && sc.pending,
          cells: build((role) => {
            switch (role) {
              case "sceneNum": return i === 0 ? sceneCell : null;
              case "desc": return i === 0 ? desc : null;
              case "day": return i === 0 ? dayCell : null;
              case "crowdNo": return c ? (c.no ?? null) : null;
              case "crowdName": return c ? c.name : blank && sc.na ? "N/A" : null;
              case "crowdCombo": return cbComboText(c, blank, sc.na) || null;
              case "crowdNotes": return c ? c.notes || null : null;
              case "otherNo": return o ? (o.no ?? null) : null;
              case "otherName": return o ? o.name : null;
              case "fees": return c && c.sup ? heads * c.sup : null;
              case "cost": return c && c.cost ? c.cost : null;
              default: return null;
            }
          }),
        });
      }
      const last = rows.length;
      if (last > first) {
        // the scene, description and day cells span their whole block, exactly
        // as the printed grid reads — merge each wherever it now sits
        layout.forEach((def, col) => {
          if (def.block) merges.push({ col, from: first, to: last });
        });
      }
      continue;
    }
    if (r.kind === "dayTotal" || r.kind === "weekTotal" || r.kind === "grandTotal") {
      const t = r as CbTotalRow;

      // The rows this total sums: a week sums its day totals; the breakdown
      // total sums the week totals, or every day total when weeks are off.
      const src =
        r.kind === "dayTotal"
          ? []
          : r.kind === "weekTotal"
          ? dayTotalRows
          : weekTotalRows.length
          ? weekTotalRows
          : dayTotalRows;
      const live = src.length > 0;

      const dayCrowdFormula =
        r.kind === "dayTotal"
          ? dayCount(
              roleIndex(layout, "crowdNo"),
              roleIndex(layout, "crowdName"),
              dayFirstDetailRow,
              rows.length
            )
          : null;
      const dayOtherFormula =
        r.kind === "dayTotal"
          ? dayCount(otherIdx, roleIndex(layout, "otherName"), dayFirstDetailRow, rows.length)
          : null;

      let crowdCell: CbCell = dayCrowdFormula
        ? { formula: dayCrowdFormula, result: Number(t.no) || 0 }
        : live
        ? { formula: sumOf(src, CROWD_COL), result: Number(t.no) || 0 }
        : t.no;
      let otherCell: CbCell =
        otherIdx < 0
          ? null
          : dayOtherFormula
          ? { formula: dayOtherFormula, result: Number(t.otherNo) || 0 }
          : live
          ? { formula: sumOf(src, OTHER_COL), result: Number(t.otherNo) || 0 }
          : t.otherNo;
      let feesCell: CbCell =
        feesIdx < 0
          ? null
          : live
          ? { formula: sumOf(src, FEES_COL), result: Number(t.fees) || 0 }
          : t.fees || null;
      let costCell: CbCell =
        costIdx < 0
          ? null
          : live
          ? { formula: sumOf(src, COST_COL), result: Number(t.cost) || 0 }
          : t.cost || null;

      // Labels sit in the column immediately before their count, matching the
      // reference grid (the main label just left of the crowd NO., the
      // STUNTS/OTHER TOTAL label just left of the stunts NO.). Placed by index
      // so they follow the columns when reordered; dropped only in the
      // degenerate case where a count column is the very first column.
      const mainLabelIdx = crowdIdx - 1;
      const otherLabelIdx = otherIdx - 1;
      const rowNum = add({
        kind: r.kind,
        cells: build((role, def, idx) => {
          if (idx === crowdIdx) return crowdCell; // crowdNo, or the merged column
          if (role === "otherNo") return otherCell;
          if (role === "fees") return feesCell;
          if (role === "cost") return costCell;
          if (idx === mainLabelIdx && !def.count && !def.money) return t.label;
          if (idx === otherLabelIdx && otherIdx >= 0 && t.otherLabel && !def.count && !def.money)
            return t.otherLabel;
          return null;
        }),
      });

      if (r.kind === "dayTotal") {
        dayTotalRows.push(rowNum);
      } else if (r.kind === "weekTotal") {
        weekTotalRows.push(rowNum);
        dayTotalRows = []; // next week starts a fresh run of day totals
      }
      continue;
    }
    const b = r as CbBandRow;
    const bandRow = full(b.kind as CbSheetRowKind, b.sub ? `${b.label}     ${b.sub}` : b.label);
    if (b.kind === "unit") dayFirstDetailRow = bandRow + 1;
  }

  return { name: "Crowd Breakdown", columns: [...doc.columns], layout, widths, rows, merges, headerRow };
}

/**
 * Flatten the document to spreadsheet rows — the SAME rows the screen shows.
 * A scene with N requirement lines occupies max(1, N) rows, with the scene's
 * own cells printed on the first of them, exactly as the printed grid reads.
 */
export function cbToSheet(doc: CbDoc): { name: string; rows: string[][] } {
  const layout = doc.layout;
  const w = layout.length;
  const money2 = (n: number): string => (n ? n.toFixed(2) : "");
  const str = (v: string | number | null | undefined): string =>
    v === null || v === undefined ? "" : String(v);
  const build = (get: (role: CbColRole, def: CbColDef, idx: number) => string | number | null): string[] =>
    layout.map((def, idx) => str(get(def.role, def, idx)));
  const bandRow = (label: string): string[] => {
    const out = Array(w).fill("");
    out[0] = label;
    return out;
  };

  const crowdIdx = crowdCountIndex(layout);
  const otherIdx = roleIndex(layout, "otherNo");

  const rows: string[][] = [];
  rows.push(bandRow(doc.title));
  rows.push(bandRow(doc.subtitle));
  rows.push(Array(w).fill(""));
  rows.push(layout.map((c) => c.header));

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
      // scene number prints once, with the shooting location under it
      const sceneCell = sc.loc ? `${sc.num}  ${sc.loc}` : sc.num;
      for (let i = 0; i < n; i++) {
        const c = sc.crowd[i];
        const o = sc.other[i];
        // A scene nobody has looked at yet is left BLANK — there is nothing to
        // say about it yet, and inventing a label ("not yet assessed") just
        // puts words in the recipient's document that no one asked for. A
        // scene confirmed as needing nobody still says "N/A", because that is
        // a real answer rather than an empty space.
        const emptyLabel = sc.na ? "N/A" : "";
        const heads = c && !c.fromAbove ? c.no || 0 : 0;
        rows.push(
          build((role) => {
            switch (role) {
              case "sceneNum": return i === 0 ? sceneCell : "";
              case "desc": return i === 0 ? descLines.join(" | ") : "";
              case "day": return i === 0 ? dayLines.join(" | ") : "";
              case "crowdNo": return c ? (c.no ?? "") : "";
              case "crowdName": return c ? c.name : i === 0 ? emptyLabel : "";
              case "crowdCombo": return cbComboText(c, i === 0 && !sc.crowd.length, sc.na);
              case "crowdNotes": return c ? c.notes : "";
              case "otherNo": return o ? (o.no ?? "") : "";
              case "otherName": return o ? o.name + (o.notes ? ` — ${o.notes}` : "") : "";
              case "fees": return c && c.sup ? money2(heads * c.sup) : "";
              case "cost": return c ? money2(c.cost) : "";
              default: return "";
            }
          })
        );
      }
      continue;
    }
    if (r.kind === "dayTotal" || r.kind === "weekTotal" || r.kind === "grandTotal") {
      const t = r as CbTotalRow;
      const mainLabelIdx = crowdIdx - 1;
      const otherLabelIdx = otherIdx - 1;
      rows.push(
        build((role, def, idx) => {
          if (idx === crowdIdx) return t.no; // crowdNo, or the merged column
          if (role === "otherNo") return otherIdx >= 0 ? t.otherNo : "";
          if (role === "fees") return money2(t.fees);
          if (role === "cost") return money2(t.cost);
          if (idx === mainLabelIdx && !def.count && !def.money) return t.label;
          if (idx === otherLabelIdx && otherIdx >= 0 && t.otherLabel && !def.count && !def.money)
            return t.otherLabel;
          return "";
        })
      );
      continue;
    }
    const b = r as CbBandRow;
    const line = bandRow(b.label);
    if (b.sub && w > 1) line[1] = b.sub;
    rows.push(line);
  }
  return { name: "Crowd Breakdown", rows };
}
