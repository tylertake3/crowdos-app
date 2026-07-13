// StuntOS engine (separate from the crowd rate cards).
// Performer £600/day, coordinator £1,000/day; + £17.50 holiday flat;
// + 55.5% usage on the day rate; insurance £17.50 charged on the first 2
// working days per person per week (shared across units); per-day stunt
// adjustments (fire burns, high falls, …) added per event.

import type { ScheduleModel, ShootDay } from "./types";
import { isStuntTok, weekKey } from "./model";

export interface StuntSettings {
  perf: number; //    performer day rate
  coord: number; //   coordinator day rate
  hol: number; //     holiday pay / day (flat)
  ins: number; //     insurance / day
  insDays: number; // insured days / week
  usePct: number; //  usage as a fraction of the day rate (0.555)
  sdOn: boolean; //   include stunt dept coordinator (weekly flat)
  sdRate: number; //  stunt dept coordinator day rate
  sdDays: number; //  stunt dept coordinator days / week
}

export const STUNT_DEFAULTS: StuntSettings = {
  perf: 600,
  coord: 1000,
  hol: 17.5,
  ins: 17.5,
  insDays: 2,
  usePct: 0.555,
  sdOn: false, // prototype checkbox defaults unticked
  sdRate: 350,
  sdDays: 4,
};

export interface StuntAdjustment {
  label: string;
  amt: number;
}

export interface StuntPersonDay {
  code: string;
  type: string;
  count: number;
  insured: boolean;
  rate: number;
  hol: number;
  ins: number;
  usage: number;
  cost: number;
}

export interface StuntPerDay {
  cost: number;
  people: StuntPersonDay[];
  adjItems?: StuntAdjustment[];
  adjTotal?: number;
}

export interface StuntPerson {
  code: string;
  type: string;
  dayCounts: Map<string, number>;
  scenes: number;
  days: number;
  heads: number;
  rate: number;
  hol: number;
  ins: number;
  usage: number;
  total: number;
}

export interface StuntWeek {
  key: string;
  days: number;
  perfDays: number;
  coordDays: number;
  ins: number;
  cost: number;
  sdCoord: number;
  dayIds: string[];
}

export interface StuntAdjRow {
  dayId: string;
  label: string;
  amt: number;
}

export interface StuntCosts {
  R: StuntSettings;
  perfBase: number;
  coordBase: number;
  perDay: Record<string, StuntPerDay>;
  perPerson: Record<string, StuntPerson>;
  dayById: Record<string, ShootDay>;
  weeks: StuntWeek[];
  adjRows: StuntAdjRow[];
  adjGrand: number;
  sdTotal: number;
  // stunt dept coordinator summary, shaped exactly as the prototype's COST.sd
  sd: {
    on: boolean;
    rate: number;
    daysPerWk: number;
    weekly: number;
    total: number;
    weekCount: number;
  };
  grand: number;
}

// `adjustments` holds per-day stunt adjustments keyed by `${unit}|${num}`
// (the prototype's ADJ store; defaults empty).
export function computeStuntCosts(
  model: ScheduleModel,
  adjustments: Record<string, StuntAdjustment[]> = {},
  R: StuntSettings = STUNT_DEFAULTS
): StuntCosts {
  const perfUsage = R.perf * R.usePct;
  const coordUsage = R.coord * R.usePct;
  const perfBase = R.perf + R.hol + perfUsage;
  const coordBase = R.coord + R.hol + coordUsage;

  // Collect every stunt person (cast tokens) and named stunt extra, with the
  // days they work. Extras take the day's PEAK count across scenes.
  interface Tracked {
    code: string;
    type: string;
    dayCounts: Map<string, number>;
    scenes: number;
  }
  const people: Record<string, Tracked> = {};
  for (const d of model.days) {
    const extrasDay: Record<string, number> = {};
    for (const s of d.scenes) {
      for (const c of s.cast) {
        if (!isStuntTok(c)) continue;
        const p = (people[c.code] ||= { code: c.code, type: c.type, dayCounts: new Map(), scenes: 0 });
        p.dayCounts.set(d.id!, 1);
        p.scenes++;
      }
      for (const x of s.extras || [])
        extrasDay[x.name] = Math.max(extrasDay[x.name] || 0, x.count);
    }
    for (const [name, count] of Object.entries(extrasDay)) {
      const p = (people["x:" + name] ||= { code: name, type: "stuntExtra", dayCounts: new Map(), scenes: 0 });
      p.dayCounts.set(d.id!, count);
    }
  }

  const dayById: Record<string, ShootDay> = {};
  model.days.forEach((d) => (dayById[d.id!] = d));

  const perDay: Record<string, StuntPerDay> = {};
  const perPerson: Record<string, StuntPerson> = {};
  for (const [pk, p] of Object.entries(people)) {
    const days = [...p.dayCounts.keys()]
      .map((id) => dayById[id])
      .sort(
        (a, b) =>
          (a._date?.getTime() || 0) - (b._date?.getTime() || 0) || a.num - b.num
      );
    const weekCount: Record<string, number> = {};
    const tot = { days: days.length, heads: 0, rate: 0, hol: 0, ins: 0, usage: 0, total: 0 };
    for (const d of days) {
      const count = p.dayCounts.get(d.id!) || 1;
      const wk = d._date ? weekKey(d._date) : "w?";
      weekCount[wk] = (weekCount[wk] || 0) + 1;
      const insured = weekCount[wk] <= R.insDays;
      const isCo = p.type === "stuntCoord";
      const rate = isCo ? R.coord : R.perf;
      const usage = isCo ? coordUsage : perfUsage;
      const perHead = (isCo ? coordBase : perfBase) + (insured ? R.ins : 0);
      const cost = perHead * count;
      tot.heads += count;
      tot.rate += rate * count;
      tot.hol += R.hol * count;
      tot.ins += (insured ? R.ins : 0) * count;
      tot.usage += usage * count;
      tot.total += cost;
      const pd = (perDay[d.id!] ||= { cost: 0, people: [] });
      pd.cost += cost;
      pd.people.push({
        code: p.code, type: p.type, count, insured,
        rate: rate * count, hol: R.hol * count,
        ins: (insured ? R.ins : 0) * count, usage: usage * count, cost,
      });
    }
    perPerson[pk] = { ...p, ...tot };
  }

  const weeks: Record<string, StuntWeek> = {};
  for (const d of model.days) {
    if (!perDay[d.id!]) continue;
    const wk = d._date ? weekKey(d._date) : "w?";
    const w = (weeks[wk] ||= { key: wk, days: 0, perfDays: 0, coordDays: 0, ins: 0, cost: 0, sdCoord: 0, dayIds: [] });
    w.days++;
    w.dayIds.push(d.id!);
    for (const pp of perDay[d.id!].people) {
      if (pp.type === "stuntCoord") w.coordDays += pp.count;
      else w.perfDays += pp.count;
      w.ins += pp.ins;
    }
    w.cost += perDay[d.id!].cost;
  }

  // per-day stunt adjustments (fire burns, high falls, etc.)
  let adjGrand = 0;
  const adjRows: StuntAdjRow[] = [];
  for (const d of model.days) {
    const items = adjustments[adjKey(d)] || [];
    if (!items.length) continue;
    const pd = (perDay[d.id!] ||= { cost: 0, people: [] });
    const sum = items.reduce((a, x) => a + (+x.amt || 0), 0);
    pd.adjItems = items;
    pd.adjTotal = sum;
    pd.cost += sum;
    adjGrand += sum;
    items.forEach((x) => adjRows.push({ dayId: d.id!, label: x.label, amt: +x.amt || 0 }));
    const wk = d._date ? weekKey(d._date) : "w?";
    const w = (weeks[wk] ||= { key: wk, days: 0, perfDays: 0, coordDays: 0, ins: 0, cost: 0, sdCoord: 0, dayIds: [] });
    if (!w.dayIds.includes(d.id!)) {
      w.days++;
      w.dayIds.push(d.id!);
    }
    w.cost += sum;
  }

  // stunt department coordinator: flat weekly amount in every week with stunt work
  const sdWeekly = R.sdRate * Math.max(0, R.sdDays);
  let sdTotal = 0;
  for (const w of Object.values(weeks)) {
    w.sdCoord = R.sdOn ? sdWeekly : 0;
    w.cost += w.sdCoord;
    sdTotal += w.sdCoord;
  }

  const grand =
    Object.values(perPerson).reduce((a, p) => a + p.total, 0) + sdTotal + adjGrand;

  return {
    R, perfBase, coordBase, perDay, perPerson, dayById,
    weeks: Object.values(weeks).sort((a, b) => a.key.localeCompare(b.key)),
    adjRows, adjGrand, sdTotal,
    sd: {
      on: R.sdOn,
      rate: R.sdRate,
      daysPerWk: R.sdDays,
      weekly: sdWeekly,
      total: sdTotal,
      weekCount: Object.keys(weeks).length,
    },
    grand,
  };
}

export function adjKey(d: Pick<ShootDay, "unit" | "num">): string {
  return (d.unit || "Main") + "|" + d.num;
}
