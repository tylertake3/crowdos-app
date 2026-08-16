// DocModel — the single projection behind the table view AND the spreadsheet.
//
// The whole point: `projectBreakdown()` turns a ScheduleModel into an ordered
// row/column document. The table view renders it to DOM; the .xlsx writer
// writes the identical rows. Screen and export can never disagree, and every
// future view gets export for free by adding one projection function.
//
// This module is deliberately pure: no DOM, no dates from the clock, no
// formatting decisions beyond cell TYPE. Anything time-dependent (the export
// timestamp) is injected, so the same input always yields the same document
// and golden-file tests are stable.

import type {
  NamedCount,
  ReqFlag,
  ReqTier,
  ScheduleModel,
  Scene,
  ShootDay,
  CrowdDayConfig,
} from "./types";
import { costableReq, effectiveTier, computeCrowdCosts, CROWD_DEFAULTS, type CrowdSettings } from "./crowd";

export type DocCellType = "text" | "number" | "currency";

export interface DocCell {
  v: string | number | null;
  t?: DocCellType;
  // A real spreadsheet SUM over a contiguous, 1-based inclusive row range in
  // this sheet — so an AD can change a count and watch the total move.
  // Rate logic is NEVER exported as a formula: costs are values. Rebuilding the
  // rate engine in Excel is exactly the error class CrowdOS exists to kill.
  sum?: { fromRow: number; toRow: number };
  meta?: DocCellMeta;
}

export interface DocCellMeta {
  tier?: ReqTier;
  flags?: ReqFlag[];
  fromAbove?: boolean;
  tbc?: boolean;
  reference?: boolean; // outside the crowd budget — excluded from SUM ranges
  delta?: number; //     declared vs derived difference
}

export type DocRowKind =
  | "stamp"
  | "dayHeader"
  | "unitHeader"
  | "columnHeader"
  | "banner"
  | "scene"
  | "requirement"
  | "totals"
  | "note";

export interface DocRow {
  kind: DocRowKind;
  /** 1-based row number within the sheet — what SUM ranges refer to. */
  row: number;
  cells: DocCell[];
  meta?: {
    dayId?: string;
    sceneNum?: string;
    /** crowded | none (confirmed N/A) | pending (unassessed) */
    assessed?: "crowded" | "none" | "pending";
    reference?: boolean;
    fromAbove?: boolean;
  };
}

export interface DocSheet {
  name: string;
  columns: string[];
  rows: DocRow[];
  /** rows above this are frozen when written to .xlsx */
  freezeAfterRow?: number;
}

export interface DocStamp {
  production: string;
  view: string;
  /** injected, never read from the clock — see module header */
  exportedAt: string;
  breakdownVersion?: string;
  /** "as per shooting schedule dated X" — the convention the real documents use */
  sourceScheduleDate?: string;
  rateCard?: string;
  appVersion?: string;
  /** current view filters, so a stale sheet in an inbox is identifiable */
  filters?: string;
}

export interface Completeness {
  crowded: number;
  confirmedNone: number;
  unassessed: number;
  /** whole percent of scenes that have been assessed either way */
  pctAssessed: number;
}

export interface DocModelDoc {
  view: string;
  stamp: DocStamp;
  sheets: DocSheet[];
  completeness: Completeness;
}

// Column set is design-locked (see the build brief §1.1) and is shared by the
// table view, the schedule-import review screen and the breakdown-import
// review screen, so all three read as one surface.
export const BREAKDOWN_COLUMNS = [
  "Scene",
  "Set / Synopsis",
  "Script Day",
  "No.",
  "Crowd Character",
  "Notes / Continuity",
  "Stunts / Other",
] as const;

const text = (v: string | number | null, meta?: DocCellMeta): DocCell => ({ v, t: "text", meta });
const numCell = (v: number | null, meta?: DocCellMeta): DocCell => ({ v, t: "number", meta });

// Every requirement row on a scene, tagged with how it must be treated.
// A "from above" line is the same people as another scene — it is shown, but it
// is never a new booking, so it is excluded from the scene's No. and from every
// derived sum.
interface ReqRow {
  r: NamedCount;
  tier: ReqTier;
  fromAbove: boolean;
  reference: boolean;
}

function reqRowsFor(sc: Scene, s: CrowdSettings): ReqRow[] {
  const out: ReqRow[] = [];
  const push = (arr: NamedCount[] | undefined, fallback: ReqTier) => {
    for (const r of arr || []) {
      const costable = costableReq(r);
      const tier: ReqTier = costable
        ? effectiveTier(r, fallback === "Featured" ? "Featured" : fallback === "SPACT" ? "SPACT" : "SA", s)
        : r.tier ?? fallback;
      out.push({
        r,
        tier,
        fromAbove: !!(r.cont || r.contRef) && !r.count,
        reference: !costable,
      });
    }
  };
  push(sc.saChars, "SA");
  push(sc.featured, "Featured");
  push(sc.spacts, "SPACT");
  // reference-only tiers still export — dropping them would make the sheet
  // irreconcilable with the AD's own document
  push(sc.extras, "Stunt");
  push(sc.children, "Child");
  push(sc.avs, "AV");
  return out;
}

/** Heads a scene actually books: costable, not carried from another scene. */
export function sceneHeadCount(sc: Scene, s: CrowdSettings = CROWD_DEFAULTS): number {
  return reqRowsFor(sc, s)
    .filter((x) => !x.reference && !x.fromAbove)
    .reduce((a, x) => a + (+x.r.count || 0), 0);
}

/** crowded / confirmed-N/A / unassessed — the three first-class scene states. */
export function sceneAssessment(sc: Scene): "crowded" | "none" | "pending" {
  if (sceneHasAnyReq(sc)) return "crowded";
  if (sc.reqStatus === "none") return "none";
  return "pending";
}

function sceneHasAnyReq(sc: Scene): boolean {
  return !!(
    sc.sa ||
    (sc.saChars || []).length ||
    (sc.featured || []).length ||
    (sc.spacts || []).length ||
    sc.contFrom ||
    sc.contFromRef
  );
}

function dayLabel(d: ShootDay): string {
  return `${d.date}${d.num ? `  ·  SD ${d.num}` : ""}`;
}

function unitLabel(d: ShootDay): string {
  const bits = [d.unit || "Main"];
  if (d.unitKind && d.unitKind !== "main" && d.unitKind !== "second") bits.push(d.unitKind);
  if (d.loc) bits.push(d.loc);
  if (d.hours) bits.push(d.hours);
  if (d.type) bits.push(d.type);
  return bits.join("  ·  ");
}

export interface ProjectOpts {
  stamp: DocStamp;
  /** one sheet per week instead of a single day-banded sheet */
  perWeek?: boolean;
  dayConfigs?: Record<string, CrowdDayConfig>;
  settings?: CrowdSettings;
  /** include a money column derived from the cost engine */
  withCost?: boolean;
}

export function projectBreakdown(model: ScheduleModel, opts: ProjectOpts): DocModelDoc {
  const s = opts.settings ?? CROWD_DEFAULTS;
  const cost = opts.withCost
    ? computeCrowdCosts(model, opts.dayConfigs ?? {}, s)
    : null;

  const columns = [...BREAKDOWN_COLUMNS] as string[];
  if (opts.withCost) columns.push("Day cost");

  const rows: DocRow[] = [];
  let n = 0;
  const add = (r: Omit<DocRow, "row">): DocRow => {
    const row = { ...r, row: ++n } as DocRow;
    rows.push(row);
    return row;
  };

  // ---- stamp block. An exported sheet is a snapshot fork; the stamp is what
  // makes a stale one identifiable in an inbox six weeks later.
  const st = opts.stamp;
  add({ kind: "stamp", cells: [text(st.production), text(st.view)] });
  add({
    kind: "stamp",
    cells: [
      text(`Exported ${st.exportedAt}`),
      text(st.breakdownVersion ? `Breakdown version ${st.breakdownVersion}` : ""),
      text(st.sourceScheduleDate ? `As per shooting schedule dated ${st.sourceScheduleDate}` : ""),
      text(st.filters ? `Filters: ${st.filters}` : ""),
    ],
  });
  if (opts.withCost) {
    // Rule: costs are values, not formulas. Say so in the sheet itself.
    add({
      kind: "note",
      cells: [
        text(
          `Costs computed by CrowdOS${st.appVersion ? " " + st.appVersion : ""}${
            st.rateCard ? ` from ${st.rateCard}` : ""
          } — edit counts freely; re-import for recosted figures.`
        ),
      ],
    });
  }

  const header = add({ kind: "columnHeader", cells: columns.map((c) => text(c)) });

  let crowded = 0;
  let confirmedNone = 0;
  let unassessed = 0;

  for (const d of model.days) {
    add({ kind: "dayHeader", cells: [text(dayLabel(d))], meta: { dayId: d.id } });
    add({ kind: "unitHeader", cells: [text(unitLabel(d))], meta: { dayId: d.id } });

    const firstDataRow = n + 1;
    let derived = 0;

    for (const sc of d.scenes) {
      const assessed = sceneAssessment(sc);
      if (assessed === "crowded") crowded++;
      else if (assessed === "none") confirmedNone++;
      else unassessed++;

      // section banners (SET MOVE, IF TIME ALLOWS, location groupings) render
      // as full-width muted rows
      for (const t of sc.tags || []) {
        if (/^(SET MOVE|IF TIME ALLOWS|COMPANY MOVE|UNIT MOVE)$/i.test(t)) {
          add({ kind: "banner", cells: [text(t.toUpperCase())], meta: { dayId: d.id } });
        }
      }

      const heads = sceneHeadCount(sc, s);
      if (assessed !== "crowded") {
        add({
          kind: "scene",
          cells: [
            text(sc.num + (sc.part ? ` Pt${sc.part}` : "")),
            text([sc.ie, sc.slug || sc.desc].filter(Boolean).join(" ")),
            text(sc.scriptDay),
            numCell(assessed === "none" ? 0 : null),
            text(assessed === "none" ? "N/A — confirmed no crowd" : "Unassessed"),
            text(sc.unparsed?.join(" | ") || ""),
            text(""),
          ],
          meta: { dayId: d.id, sceneNum: sc.num, assessed },
        });
        continue;
      }

      add({
        kind: "scene",
        cells: [
          text(sc.num + (sc.part ? ` Pt${sc.part}` : "")),
          text([sc.ie, sc.slug || sc.desc].filter(Boolean).join(" ")),
          text(sc.scriptDay),
          numCell(heads),
          text(""),
          text(sc.contFromRef || (sc.contFrom ? `⛓ from ${sc.contFrom}` : "")),
          text(""),
        ],
        meta: { dayId: d.id, sceneNum: sc.num, assessed, fromAbove: !!sc.contFrom },
      });
      derived += heads;

      // anonymous background carries no name in the source — still a real line
      if (sc.sa) {
        add({
          kind: "requirement",
          cells: [
            text(""),
            text(""),
            text(""),
            numCell(sc.sa),
            text("SA's", { tier: "SA" }),
            text(""),
            text(""),
          ],
          meta: { dayId: d.id, sceneNum: sc.num },
        });
      }

      for (const x of reqRowsFor(sc, s)) {
        const meta: DocCellMeta = {
          tier: x.tier,
          flags: x.r.flags,
          fromAbove: x.fromAbove,
          tbc: !!x.r.tierTbc,
          reference: x.reference,
        };
        const notes = [
          x.r.note,
          x.r.contRef,
          x.r.cont ? `⛓ ${x.r.cont}` : "",
          (x.r.flags || []).map((f) => f.toUpperCase()).join(" "),
          x.r.tierTbc ? "TBC TIER" : "",
        ]
          .filter(Boolean)
          .join("  ·  ");
        add({
          kind: "requirement",
          cells: [
            text(""),
            text(""),
            text(""),
            // a from-above line is the same people — never a new count
            numCell(x.fromAbove ? null : +x.r.count || 0, meta),
            text(x.r.name, meta),
            text(notes, meta),
            // reference-scope rows live in their own column, visibly tagged
            text(x.reference ? `${x.tier} ${x.r.count}` : "", meta),
          ],
          meta: {
            dayId: d.id,
            sceneNum: sc.num,
            reference: x.reference,
            fromAbove: x.fromAbove,
          },
        });
      }
    }

    // ---- day totals. Derived always wins; a declared figure from an import is
    // shown beside it, never used to pad and never blocking.
    const lastDataRow = n;
    const declaredCrowd =
      d.declaredTotals
        ? (["SA", "Featured", "SPACT"] as ReqTier[]).reduce(
            (a, t) => a + (d.declaredTotals![t] ?? 0),
            0
          )
        : undefined;
    const totalCells: DocCell[] = [
      text("Day total"),
      text(""),
      text(""),
      {
        v: derived,
        t: "number",
        // structural SUM over exactly this day's non-reference requirement rows
        sum: lastDataRow >= firstDataRow ? { fromRow: firstDataRow, toRow: lastDataRow } : undefined,
      },
      text(
        declaredCrowd === undefined
          ? ""
          : declaredCrowd === derived
            ? `= declared ${declaredCrowd}`
            : `declared ${declaredCrowd} · Δ ${derived - declaredCrowd > 0 ? "+" : ""}${derived - declaredCrowd}`,
        declaredCrowd === undefined ? undefined : { delta: derived - declaredCrowd }
      ),
      text(""),
      text(""),
    ];
    if (opts.withCost) {
      const c = cost?.perDay[d.id!];
      totalCells.push({ v: c ? Math.round(c.cost) : 0, t: "currency" });
    }
    add({ kind: "totals", cells: totalCells, meta: { dayId: d.id } });
  }

  const assessedTotal = crowded + confirmedNone + unassessed;
  const completeness: Completeness = {
    crowded,
    confirmedNone,
    unassessed,
    pctAssessed: assessedTotal
      ? Math.round(((crowded + confirmedNone) / assessedTotal) * 100)
      : 0,
  };

  const sheet: DocSheet = {
    name: "Crowd Breakdown",
    columns,
    rows,
    freezeAfterRow: header.row,
  };

  return { view: "Crowd Breakdown", stamp: st, sheets: [sheet], completeness };
}
