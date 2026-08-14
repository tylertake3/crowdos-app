// Crowd engine: per-head dispatch, per-day cost, and whole-schedule totals.
// All totals derive from the single per-head functions in pact.ts / spact.ts —
// rate maths is never duplicated in views (RATE-ENGINE-NOTES.md).

import type {
  CharacterRow,
  CrowdDayConfig,
  CrowdTier,
  NamedCount,
  ReqTier,
  ScheduleModel,
  ShootDay,
  TravelBand,
} from "./types";
import {
  pactPerHead,
  pactFrameworkHours,
  PACT_DEFAULTS,
  type PactSettings,
  type PerHeadBreakdown,
} from "./pact";
import {
  spactPerHead,
  spactFrameworkHours,
  SPACT_DEFAULTS,
  type SpactSettings,
} from "./spact";
import { locationBand } from "./location";
import { dayPeakSA, weekKey } from "./model";

export interface CrowdSettings {
  pact: PactSettings;
  spact: SpactSettings;
  // Per-production travel-band overrides from Production Settings → Locations:
  // location name → forced band. Matched case-insensitively as a substring of
  // the day's location text (day locations often list several places).
  bands?: Record<string, TravelBand>;
  // Budget assumptions for UNEDITED days ("assume everyone's on CWD doing
  // 2h over"): days without their own calculator config are costed per-head
  // at these hours instead of the flat day rate. The wrap time anchors on the
  // SA framework, so SPACT (longer framework) correctly accrues less OT for
  // the same unit day. Absent = the old flat-rate default, unchanged.
  baseDay?: { fw: "std" | "cwd"; otHours: number };
}

// The band for a day's location: an override wins over the gazetteer.
export function bandFor(loc: string, s: CrowdSettings): { band: TravelBand; known: boolean } {
  const l = (loc || "").toLowerCase();
  if (s.bands && l) {
    for (const [name, band] of Object.entries(s.bands)) {
      if (name && l.includes(name.toLowerCase())) return { band, known: true };
    }
  }
  const lb = locationBand(loc);
  return { band: lb.band, known: lb.known };
}

export const CROWD_DEFAULTS: CrowdSettings = {
  pact: PACT_DEFAULTS,
  spact: SPACT_DEFAULTS,
};

export function tierFwHours(c: CrowdDayConfig, tier: CrowdTier): number {
  if (tier === "SPACT") return spactFrameworkHours(c.fw);
  return pactFrameworkHours(c.fw);
}

// ---------------------------------------------------------------------------
// Breakdown-import tolerance.
//
// An imported Crowd Breakdown puts things in the crowd columns that must not
// be priced by the crowd engine: dummies and dogs (not people), action
// vehicles, children, and stunts (explicitly "NOT A PART OF THE CROWD
// BUDGET"). They are imported so that the document's own totals reconcile and
// nothing is silently dropped — dropping them would make an imported
// breakdown irreconcilable — but they never reach a rate card.
//
// A row with no metadata is costable, which is why every pre-existing
// schedule-parsed row behaves exactly as before.
// ---------------------------------------------------------------------------
const COSTING_TIERS: readonly ReqTier[] = ["SA", "Featured", "SPACT"];

export function costableReq(r: NamedCount): boolean {
  if ((r.unitType ?? "person") !== "person") return false; // dummies, dogs, cars
  if (r.budgetScope === "reference") return false; //          out of crowd budget
  if (r.tier && !COSTING_TIERS.includes(r.tier)) return false; // Stunt/Child/AV
  return true;
}

// The tier a row is actually priced on.
//
// "TBC whether Spact or SA" is real and common. Locked decision: cost at the
// HIGHER candidate rate, so resolving the tier can only ever move the budget
// DOWN. The winner is computed from the live rate card rather than assumed,
// because the cards are editable — we compare each candidate's flat per-head
// on a neutral day and take the max.
export function effectiveTier(
  r: NamedCount,
  fallback: CrowdTier,
  s: CrowdSettings = CROWD_DEFAULTS
): CrowdTier {
  const declared = (r.tier && COSTING_TIERS.includes(r.tier) ? r.tier : fallback) as CrowdTier;
  if (!r.tierTbc) return declared;
  const cands = (r.tierCandidates ?? [declared, "SPACT"]).filter((t): t is CrowdTier =>
    COSTING_TIERS.includes(t)
  );
  if (!cands.length) return declared;
  const neutral: CrowdDayConfig = {
    shift: "Day",
    fw: "cwd",
    ph: false,
    call: "07:00",
    wrap: "18:00",
    travel: "A",
    chars: [],
  };
  let best = cands[0];
  let bestPer = -Infinity;
  for (const t of cands) {
    // supplementary fees are added by the caller's per-head path, not here
    const per = cdPerHead(neutral, t, s).per;
    if (per > bestPer) {
      bestPer = per;
      best = t;
    }
  }
  return best;
}

// The single per-head entry point — dispatches to the right rate card.
export function cdPerHead(
  c: CrowdDayConfig,
  tier: CrowdTier,
  s: CrowdSettings = CROWD_DEFAULTS
): PerHeadBreakdown {
  if (tier === "SPACT") {
    // SPACT travel bands mirror the PACT card's editable A/B values
    return spactPerHead(c, {
      ...s.spact,
      travelA: s.pact.travelA,
      travelB: s.pact.travelB,
    });
  }
  return pactPerHead(c, tier, s.pact);
}

export interface DayCost {
  cost: number;
  sa: number;
  featPD: number;
  spactPD: number;
  feats: Record<string, number>;
  spacts: Record<string, number>;
  saCost: number;
  featCost: number;
  spactCost: number;
  /** supplementary fees inside the day's cost (heads × per-head fee) */
  supCost: number;
  /** the same fees split by tier, so each card can show what it charged */
  supSA: number;
  supFeat: number;
  supSpact: number;
}

// The effective day config for one character row — a row with a call and/or
// wrap override is priced against those times instead of the day default
// (e.g. zombies called 04:00 for makeup while the rest of the crowd is
// called 08:00). Overriding only one of the pair leaves the other inherited.
export function cdRowConfig(c: CrowdDayConfig, ch: CharacterRow): CrowdDayConfig {
  if (!ch.call && !ch.wrap) return c;
  return { ...c, call: ch.call || c.call, wrap: ch.wrap || c.wrap };
}

// Cost of one configured day across all its character rows.
// Supplementary fees are per head (Featured = SA + sups).
export function cdDayCost(
  c: CrowdDayConfig,
  s: CrowdSettings = CROWD_DEFAULTS
): DayCost {
  let cost = 0, sa = 0, featPD = 0, spactPD = 0;
  let saCost = 0, featCost = 0, spactCost = 0, supCost = 0;
  let supSA = 0, supFeat = 0, supSpact = 0;
  const feats: Record<string, number> = {};
  const spacts: Record<string, number> = {};
  for (const ch of c.chars) {
    const n = +ch.count || 0;
    const sup = +(ch.sup ?? 0) || 0;
    const rowPer = cdPerHead(cdRowConfig(c, ch), ch.tier, s).per + sup;
    cost += rowPer * n;
    supCost += sup * n;
    if (ch.tier === "SA") {
      sa += n; saCost += rowPer * n; supSA += sup * n;
    } else if (ch.tier === "Featured") {
      featPD += n; featCost += rowPer * n; supFeat += sup * n;
      feats[ch.name] = (feats[ch.name] || 0) + n;
    } else {
      spactPD += n; spactCost += rowPer * n; supSpact += sup * n;
      spacts[ch.name] = (spacts[ch.name] || 0) + n;
    }
  }
  return {
    cost, sa, featPD, spactPD, feats, spacts,
    saCost, featCost, spactCost, supCost, supSA, supFeat, supSpact,
  };
}

// OT & early-call quantities for the day's SA rows, summed per row. Unlike
// base/holiday (which only depend on day-level shift/PH and so are uniform
// across every SA head), OT and early-call depend on call/wrap — and a row
// with its own override prices differently from the day default. So these
// must be summed row-by-row rather than computed once and multiplied by the
// day's total SA headcount.
function cdSaOtEarly(c: CrowdDayConfig, s: CrowdSettings) {
  let heads = 0, ot = 0, early = 0, otDayB = 0, otNightB = 0, earlyBlocks = 0, earlyTravelHeads = 0;
  for (const ch of c.chars) {
    if (ch.tier !== "SA") continue;
    const n = +ch.count || 0;
    if (!n) continue;
    const p = cdPerHead(cdRowConfig(c, ch), "SA", s);
    heads += n;
    ot += p.ot * n;
    early += (p.earlyPay + p.earlyTravel) * n;
    otDayB += p.otDayB * n;
    otNightB += p.otNightB * n;
    earlyBlocks += p.earlyBlocks * n;
    if (p.earlyTravel > 0) earlyTravelHeads += n;
  }
  return { heads, ot, early, otDayB, otNightB, earlyBlocks, earlyTravel: earlyTravelHeads > 0 };
}

// SA cost composition for a day — used by the views' hover tooltips.
export interface SaComp {
  rates: number;
  hol: number;
  ot: number;
  early: number;
  otPer: number;
  earlyPer: number;
  otDayB: number;
  otNightB: number;
  earlyBlocks: number;
  earlyTravel: boolean;
}

export interface CrowdDayEntry extends DayCost {
  saComp: SaComp;
  saChars: Record<string, number>; // named SA groups this day (name → peak count)
  /** supplementary fee per head, by group name — carried into the calculator */
  supBy: Record<string, number>;
  /**
   * What one head of each tier costs on this day BEFORE supplementary fees —
   * exactly the figure this day's branch priced with, so anything showing a
   * per-line cost agrees with the day total instead of re-deriving rates.
   */
  perHeadBy: { SA: number; Featured: number; SPACT: number };
  travel: { band: string; known: boolean; amt: number; total: number };
  chars: string;
  edited: boolean;
}

export interface CrowdWeek {
  key: string;
  days: number;
  saDays: number;
  featDays: number;
  spactDays: number;
  cost: number;
}

export interface PeopleAgg {
  code: string;
  dayCounts: Map<string, number>;
  heads: number;
  max: number;
}

export interface CrowdCosts {
  perDay: Record<string, CrowdDayEntry>;
  featPeople: Record<string, PeopleAgg>;
  spactPeople: Record<string, PeopleAgg>;
  weeks: CrowdWeek[];
  grand: number;
}

// Whole-schedule crowd totals. `dayConfigs` holds per-day overrides keyed by
// `${unit}|${num}` (the prototype's CDAY); days without one use schedule
// defaults: peak SA / featured / SPACT counts costed at flat day rates plus
// holiday and auto-detected travel.
export function computeCrowdCosts(
  model: ScheduleModel,
  dayConfigs: Record<string, CrowdDayConfig> = {},
  s: CrowdSettings = CROWD_DEFAULTS
): CrowdCosts {
  const hp = 1 + s.pact.hol;
  const perDay: Record<string, CrowdDayEntry> = {};
  const featPeople: Record<string, PeopleAgg> = {};
  const spactPeople: Record<string, PeopleAgg> = {};
  const weeks: Record<string, CrowdWeek> = {};
  let grand = 0;

  for (const d of model.days) {
    const saAnon = dayPeakSA(d); // anonymous "N x C" background, peak across scenes
    const feats: Record<string, number> = {};
    const spacts: Record<string, number> = {};
    const saChars: Record<string, number> = {}; // named SA groups
    // Supplementary fees ride with the group, not the scene: a wig or a
    // uniform is paid once for the day however many scenes the group is in,
    // so the fee pools on the same identity the head count does.
    const supBy: Record<string, number> = {};
    const supByTier: Record<string, number> = {};
    for (const sc of d.scenes) {
      // weather-cover scenes are deliberately double-scheduled by some
      // productions — they must not add to the day's requirement
      if (sc.status === "weatherCover") continue;
      // An imported row can be a dummy, a dog, a child or a stunt sitting in a
      // crowd column; costableReq keeps those out of every bucket. A row whose
      // tier is TBC is bucketed on its effective (higher-rate) tier, so the
      // budget can only fall when the AD resolves it.
      const bucket = (f: NamedCount, fallback: CrowdTier) => {
        if (!costableReq(f)) return;
        const t = effectiveTier(f, fallback, s);
        const into = t === "SPACT" ? spacts : t === "Featured" ? feats : saChars;
        into[f.name] = Math.max(into[f.name] || 0, f.count);
        const sup = +(f.sup ?? 0) || 0;
        if (sup) {
          supBy[f.name] = Math.max(supBy[f.name] || 0, sup);
          // costing is keyed by tier AND name: the same character name can
          // appear on two tiers, and a fee set on one must not charge the other
          const sk = t + "|" + f.name;
          supByTier[sk] = Math.max(supByTier[sk] || 0, sup);
        }
      };
      for (const f of sc.saChars || []) bucket(f, "SA");
      for (const f of sc.featured || []) bucket(f, "Featured");
      for (const f of sc.spacts || []) bucket(f, "SPACT");
      // children and action vehicles are reference-only by construction and
      // never enter any costing bucket (see types.ts)
    }
    // named SAs count in the SA bucket at the SA rate (a character name does
    // not make someone Featured — Featured is a rare SA + supplementary fees)
    const saNamedPD = Object.values(saChars).reduce((a, n) => a + n, 0);
    const sa = saAnon + saNamedPD;
    const featPD = Object.values(feats).reduce((a, n) => a + n, 0);
    const spactPD = Object.values(spacts).reduce((a, n) => a + n, 0);
    // fees the day owes, per bucket, on the pooled counts
    const supOf = (m: Record<string, number>, tier: string): number =>
      Object.entries(m).reduce(
        (a, [n, ct]) => a + ct * (supByTier[tier + "|" + n] || 0),
        0
      );
    const saSup = supOf(saChars, "SA");
    const featSup = supOf(feats, "Featured");
    const spactSup = supOf(spacts, "SPACT");
    const supTotal = saSup + featSup + spactSup;

    const c = dayConfigs[cdayKey(d)];
    if (!c && !sa && !featPD && !spactPD) continue;

    let entry: CrowdDayEntry;
    // A merely-seeded config (calculator opened, nothing changed) is ignored for
    // costing — see CrowdDayConfig.seeded. Legacy configs have no flag and so
    // still take this branch.
    if (c && !c.seeded) {
      const r = cdDayCost(c, s);
      if (!r.sa && !r.featPD && !r.spactPD) continue;
      const tAmt =
        c.travel === "A" ? s.pact.travelA : c.travel === "B" ? s.pact.travelB : 0;
      const headsE = r.sa + r.featPD + r.spactPD;
      const p = cdPerHead(c, "SA", s);
      const agg = cdSaOtEarly(c, s);
      entry = {
        ...r,
        saComp: {
          rates: r.sa * p.base,
          hol: r.sa * p.hol,
          ot: agg.ot,
          early: agg.early,
          otPer: agg.heads ? agg.ot / agg.heads : p.ot,
          earlyPer: agg.heads ? agg.early / agg.heads : p.earlyPay + p.earlyTravel,
          otDayB: agg.otDayB,
          otNightB: agg.otNightB,
          earlyBlocks: agg.earlyBlocks,
          earlyTravel: agg.earlyTravel,
        },
        saChars: {},
        perHeadBy: {
          SA: p.per,
          Featured: p.per, // Featured = SA rate + fees
          SPACT: cdPerHead(c, "SPACT", s).per,
        },
        // an edited day carries its fees on its own character rows
        supBy: Object.fromEntries(
          c.chars.filter((x) => +(x.sup ?? 0) > 0).map((x) => [x.name, +(x.sup ?? 0)])
        ),
        chars: c.chars
          .map((x) => x.name + (x.count > 1 ? " ×" + x.count : ""))
          .join(", "),
        travel: { band: c.travel, known: true, amt: tAmt, total: headsE * tAmt },
        edited: true,
      };
    } else if (s.baseDay) {
      // production-level budget assumption: cost unedited days per-head at
      // the assumed hours (07:00 start; wrap = SA framework + OT hours)
      const lb = bandFor(d.loc, s);
      const fwH = pactFrameworkHours(s.baseDay.fw);
      const wrapH = 7 + fwH + Math.max(0, s.baseDay.otHours || 0);
      const cfg: CrowdDayConfig = {
        shift: "Day", fw: s.baseDay.fw, ph: false,
        call: "07:00",
        wrap: `${String(Math.floor(wrapH) % 24).padStart(2, "0")}:${String(Math.round((wrapH % 1) * 60)).padStart(2, "0")}`,
        travel: lb.band, chars: [],
      };
      const saP = cdPerHead(cfg, "SA", s);
      const spP = cdPerHead(cfg, "SPACT", s);
      const heads = sa + featPD + spactPD;
      // Featured = SA rate + the supplementary fees set on the group
      const saCost = sa * saP.per + saSup;
      const featCost = featPD * saP.per + featSup;
      const spactCost = spactPD * spP.per + spactSup;
      entry = {
        sa, feats, spacts, featPD, spactPD,
        cost: saCost + featCost + spactCost,
        saCost, featCost, spactCost,
        supCost: supTotal, supSA: saSup, supFeat: featSup, supSpact: spactSup, supBy,
        perHeadBy: { SA: saP.per, Featured: saP.per, SPACT: spP.per },
        saComp: {
          rates: sa * saP.base,
          hol: sa * saP.hol,
          ot: sa * saP.ot,
          early: sa * (saP.earlyPay + saP.earlyTravel),
          otPer: saP.ot,
          earlyPer: saP.earlyPay + saP.earlyTravel,
          otDayB: saP.otDayB,
          otNightB: saP.otNightB,
          earlyBlocks: saP.earlyBlocks,
          earlyTravel: saP.earlyTravel > 0,
        },
        saChars,
        chars: "",
        travel: { band: lb.band, known: lb.known, amt: saP.travel, total: heads * saP.travel },
        edited: false,
      };
    } else {
      const lb = bandFor(d.loc, s);
      const tAmt = lb.band === "B" ? s.pact.travelB : s.pact.travelA;
      const heads = sa + featPD + spactPD;
      const saCost = sa * s.pact.sa * hp + saSup;
      const featCost = featPD * s.pact.sa * hp + featSup; // Featured = SA rate + fees
      const spactCost = spactPD * (s.spact.basic + s.spact.hol) + spactSup;
      entry = {
        sa, feats, spacts, featPD, spactPD,
        cost: saCost + featCost + spactCost + heads * tAmt,
        saCost, featCost, spactCost,
        supCost: supTotal, supSA: saSup, supFeat: featSup, supSpact: spactSup, supBy,
        perHeadBy: {
          SA: s.pact.sa * hp + tAmt,
          Featured: s.pact.sa * hp + tAmt,
          SPACT: s.spact.basic + s.spact.hol + tAmt,
        },
        saComp: {
          rates: sa * s.pact.sa,
          hol: sa * s.pact.sa * s.pact.hol,
          ot: 0,
          early: 0,
          otPer: 0,
          earlyPer: 0,
          otDayB: 0,
          otNightB: 0,
          earlyBlocks: 0,
          earlyTravel: false,
        },
        saChars,
        chars: "",
        travel: { band: lb.band, known: lb.known, amt: tAmt, total: heads * tAmt },
        edited: false,
      };
    }

    perDay[d.id!] = entry;
    grand += entry.cost;

    for (const [name, count] of Object.entries(entry.feats)) {
      const p = (featPeople[name] ||= { code: name, dayCounts: new Map(), heads: 0, max: 0 });
      p.dayCounts.set(d.id!, count);
      p.heads += count;
      p.max = Math.max(p.max, count);
    }
    for (const [name, count] of Object.entries(entry.spacts)) {
      const p = (spactPeople[name] ||= { code: name, dayCounts: new Map(), heads: 0, max: 0 });
      p.dayCounts.set(d.id!, count);
      p.heads += count;
      p.max = Math.max(p.max, count);
    }

    const wk = d._date ? weekKey(d._date) : "w?";
    const w = (weeks[wk] ||= { key: wk, days: 0, saDays: 0, featDays: 0, spactDays: 0, cost: 0 });
    w.days++;
    w.saDays += entry.sa;
    w.featDays += entry.featPD;
    w.spactDays += entry.spactPD;
    w.cost += entry.cost;
  }

  return {
    perDay,
    featPeople,
    spactPeople,
    weeks: Object.values(weeks).sort((a, b) => a.key.localeCompare(b.key)),
    grand,
  };
}

export function cdayKey(d: Pick<ShootDay, "unit" | "num">): string {
  return (d.unit || "Main") + "|" + d.num;
}
