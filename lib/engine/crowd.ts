// Crowd engine: per-head dispatch, per-day cost, and whole-schedule totals.
// All totals derive from the single per-head functions in pact.ts / spact.ts —
// rate maths is never duplicated in views (RATE-ENGINE-NOTES.md).

import type {
  CrowdDayConfig,
  CrowdTier,
  ScheduleModel,
  ShootDay,
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
}

export const CROWD_DEFAULTS: CrowdSettings = {
  pact: PACT_DEFAULTS,
  spact: SPACT_DEFAULTS,
};

export function tierFwHours(c: CrowdDayConfig, tier: CrowdTier): number {
  if (tier === "SPACT") return spactFrameworkHours(c.fw);
  return pactFrameworkHours(c.fw);
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
}

// Cost of one configured day across all its character rows.
// Supplementary fees are per head (Featured = SA + sups).
export function cdDayCost(
  c: CrowdDayConfig,
  s: CrowdSettings = CROWD_DEFAULTS
): DayCost {
  let cost = 0, sa = 0, featPD = 0, spactPD = 0;
  let saCost = 0, featCost = 0, spactCost = 0;
  const feats: Record<string, number> = {};
  const spacts: Record<string, number> = {};
  for (const ch of c.chars) {
    const n = +ch.count || 0;
    const rowPer = cdPerHead(c, ch.tier, s).per + (+(ch.sup ?? 0) || 0);
    cost += rowPer * n;
    if (ch.tier === "SA") {
      sa += n; saCost += rowPer * n;
    } else if (ch.tier === "Featured") {
      featPD += n; featCost += rowPer * n;
      feats[ch.name] = (feats[ch.name] || 0) + n;
    } else {
      spactPD += n; spactCost += rowPer * n;
      spacts[ch.name] = (spacts[ch.name] || 0) + n;
    }
  }
  return { cost, sa, featPD, spactPD, feats, spacts, saCost, featCost, spactCost };
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
    for (const sc of d.scenes) {
      for (const f of sc.saChars || [])
        saChars[f.name] = Math.max(saChars[f.name] || 0, f.count);
      for (const f of sc.featured || [])
        feats[f.name] = Math.max(feats[f.name] || 0, f.count);
      for (const f of sc.spacts || [])
        spacts[f.name] = Math.max(spacts[f.name] || 0, f.count);
    }
    // named SAs count in the SA bucket at the SA rate (a character name does
    // not make someone Featured — Featured is a rare SA + supplementary fees)
    const saNamedPD = Object.values(saChars).reduce((a, n) => a + n, 0);
    const sa = saAnon + saNamedPD;
    const featPD = Object.values(feats).reduce((a, n) => a + n, 0);
    const spactPD = Object.values(spacts).reduce((a, n) => a + n, 0);

    const c = dayConfigs[cdayKey(d)];
    if (!c && !sa && !featPD && !spactPD) continue;

    let entry: CrowdDayEntry;
    if (c) {
      const r = cdDayCost(c, s);
      if (!r.sa && !r.featPD && !r.spactPD) continue;
      const tAmt =
        c.travel === "A" ? s.pact.travelA : c.travel === "B" ? s.pact.travelB : 0;
      const headsE = r.sa + r.featPD + r.spactPD;
      const p = cdPerHead(c, "SA", s);
      entry = {
        ...r,
        saComp: {
          rates: r.sa * p.base,
          hol: r.sa * p.hol,
          ot: r.sa * p.ot,
          early: r.sa * (p.earlyPay + p.earlyTravel),
          otPer: p.ot,
          earlyPer: p.earlyPay + p.earlyTravel,
          otDayB: p.otDayB,
          otNightB: p.otNightB,
          earlyBlocks: p.earlyBlocks,
          earlyTravel: p.earlyTravel > 0,
        },
        saChars: {},
        chars: c.chars
          .map((x) => x.name + (x.count > 1 ? " ×" + x.count : ""))
          .join(", "),
        travel: { band: c.travel, known: true, amt: tAmt, total: headsE * tAmt },
        edited: true,
      };
    } else {
      const lb = locationBand(d.loc);
      const tAmt = lb.band === "B" ? s.pact.travelB : s.pact.travelA;
      const heads = sa + featPD + spactPD;
      const saCost = sa * s.pact.sa * hp;
      const featCost = featPD * s.pact.sa * hp; // Featured = SA rate
      const spactCost = spactPD * (s.spact.basic + s.spact.hol);
      entry = {
        sa, feats, spacts, featPD, spactPD,
        cost: saCost + featCost + spactCost + heads * tAmt,
        saCost, featCost, spactCost,
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
