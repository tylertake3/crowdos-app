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
  hol: number; //     holiday pay / day (flat, per attendance)
  ins: number; //     insurance / day (applies to performers AND coordinators)
  insDays: number; // insured days / week
  usePct: number; //  usage as a fraction of the day-rate/weekly-derived base
  sdOn: boolean; //   include stunt dept coordinator (weekly flat)
  sdRate: number; //  stunt dept coordinator day rate
  sdDays: number; //  stunt dept coordinator days / week
  // Agreement rules (BSR/Equity). Defaults are NEUTRAL — they reproduce the
  // flat day-rate-every-day behaviour exactly, so budgets only change when a
  // real agreement card sets these:
  perfWk?: number; //   performer weekly fee, covers 5 days in one week
  coordWk?: number; //  coordinator weekly fee (both default to 5× daily = neutral)
  nightPct?: number; // night-shoot uplift, % of daily on top (BSR: 50)
  day6Mult?: number; // 6th day worked in a week, × daily (BSR: 1)
  day7Mult?: number; // 7th day worked in a week, × daily (BSR: 1.5)
  otFrac?: number; //  OT per hour (or part) = daily ÷ this (CFA 7, TV/SVOD 6, ITV 5; 0 = no OT modelling)
}

// Per-day hours config from the stunt day calculator (the stunt twin of the
// crowd CDAY config). Keyed by adjKey (`unit|num`) alongside adjustments.
export interface StuntDayCfg {
  call?: string; // "HH:MM"
  wrap?: string;
  fw?: "swd" | "cwd"; // Standard Working Day 10h (incl 1h lunch) | Continuous 8h
  night?: boolean; //   overrides the day-type CWN detection when a cfg exists
}

const t2min = (t?: string) => {
  const [a, b] = (t || "").split(":").map(Number);
  return (a || 0) * 60 + (b || 0);
};

// Hours-driven extras for one head on a configured day (BSR/Equity rules,
// per Tyler + the BSR Combined Rate Card v2.7 definitions):
// · OT after the framework (SWD 10h incl lunch / CWD 8h), per hour OR PART,
//   at daily ÷ otFrac. otFrac 0 = no OT modelling (the neutral default).
// · Dawn call (call at or before 05:00): the day becomes a 5-HOUR day — no
//   early-call payment, OT (daily÷otFrac per hour) for everything past 5h.
// · Pre-dawn call (after 05:00, before 07:00): hours before 07:00 pay OT
//   capped at 2 hours; the working day itself commences at 07:00.
export function stuntDayExtras(
  cfg: StuntDayCfg,
  daily: number,
  R: StuntSettings
): { ot: number; early: number; otH: number; earlyH: number; dawn: boolean; perHr: number } {
  const otFrac = R.otFrac || 0;
  const perHr = otFrac ? daily / otFrac : 0;
  const call = t2min(cfg.call || "07:00");
  const wrapRaw = t2min(cfg.wrap || "18:00");
  const wrap = wrapRaw <= call ? wrapRaw + 1440 : wrapRaw; // wrap past midnight
  const workedH = (wrap - call) / 60;
  const fwH = cfg.fw === "cwd" ? 8 : 10;
  let otH = 0, earlyH = 0, dawn = false;
  if (call <= 300) {
    dawn = true;
    otH = Math.max(0, workedH - 5);
  } else if (call < 420) {
    earlyH = Math.min(2, (420 - call) / 60);
    otH = Math.max(0, (wrap - 420) / 60 - fwH);
  } else {
    otH = Math.max(0, workedH - fwH);
  }
  return {
    ot: Math.ceil(otH) * perHr,
    early: Math.ceil(earlyH) * perHr,
    otH, earlyH, dawn, perHr,
  };
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
  nightPct: 0,
  day6Mult: 1,
  day7Mult: 1,
};

// A night shoot day: the manual day-type dropdown sets 'CWN'; parsed
// schedules may carry 'night' in the type text.
const isNightDay = (d: ShootDay) => /CWN|SWN|night/i.test(d.type || "");

export interface StuntAdjustment {
  label: string;
  amt: number;
}

export interface StuntPersonDay {
  code: string;
  type: string;
  count: number;
  insured: boolean;
  rate: number; // the day's base pay: daily, weekly÷5, or 6th/7th-day multiple
  hol: number;
  ins: number;
  usage: number;
  night: number; // night-shoot uplift (nightPct % of daily, on top)
  ot: number; //    hours-driven overtime (from the day's calculator config)
  early: number; // pre-dawn early-call payment (from the config)
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
  R: StuntSettings = STUNT_DEFAULTS,
  dayCfgs: Record<string, StuntDayCfg> = {} // per-day hours configs, keyed like adjustments
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
    // Group this person's days by week. BSR/Equity agreements pay a WEEKLY
    // fee covering 5 days worked in one week (days 1-5 each cost weekly÷5),
    // a 6th day at day6Mult × daily and a 7th at day7Mult × daily. With the
    // neutral defaults (weekly = 5× daily, both multipliers 1) every day
    // costs exactly the daily rate — byte-identical to the old behaviour.
    const byWeek = new Map<string, ShootDay[]>();
    for (const d of days) {
      const wk = d._date ? weekKey(d._date) : "w?";
      (byWeek.get(wk) || byWeek.set(wk, []).get(wk)!).push(d);
    }
    const isCo = p.type === "stuntCoord";
    const daily = isCo ? R.coord : R.perf;
    const weekly = (isCo ? R.coordWk : R.perfWk) || daily * 5;
    const nightPct = R.nightPct ?? 0;
    const day6Mult = R.day6Mult ?? 1;
    const day7Mult = R.day7Mult ?? 1;
    const tot = { days: days.length, heads: 0, rate: 0, hol: 0, ins: 0, usage: 0, total: 0 };
    for (const wdays of byWeek.values()) {
      const n = wdays.length;
      wdays.forEach((d, idx) => {
        const k = idx + 1; // this person's k-th day worked this week
        const count = p.dayCounts.get(d.id!) || 1;
        const insured = k <= R.insDays;
        const base =
          n >= 5
            ? k <= 5 ? weekly / 5 : k === 6 ? daily * day6Mult : daily * day7Mult
            : daily;
        // a day-calculator config (hours/shift) overrides the schedule's
        // day-type for night detection and adds hours-driven OT/early pay
        const cfg = dayCfgs[adjKey(d)];
        const isNight = cfg ? !!cfg.night : isNightDay(d);
        const night = isNight ? (daily * nightPct) / 100 : 0;
        const ex = cfg ? stuntDayExtras(cfg, daily, R) : { ot: 0, early: 0 };
        // usage applies to the day-rate / weekly-fee base only — never to the
        // night uplift, OT, early pay, holiday, insurance, or day adjustments
        const usage = base * R.usePct;
        const perHead = base + R.hol + usage + night + ex.ot + ex.early + (insured ? R.ins : 0);
        const cost = perHead * count;
        tot.heads += count;
        tot.rate += base * count;
        tot.hol += R.hol * count;
        tot.ins += (insured ? R.ins : 0) * count;
        tot.usage += usage * count;
        tot.total += cost;
        const pd = (perDay[d.id!] ||= { cost: 0, people: [] });
        pd.cost += cost;
        pd.people.push({
          code: p.code, type: p.type, count, insured,
          rate: base * count, hol: R.hol * count,
          ins: (insured ? R.ins : 0) * count, usage: usage * count,
          night: night * count, ot: ex.ot * count, early: ex.early * count, cost,
        });
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
