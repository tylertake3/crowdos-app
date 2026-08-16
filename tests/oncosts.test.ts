// The on-cost layer: agency commission, user-named on-costs, contingency,
// meal penalties, UK bank holidays and cancellation charges on cut days.
//
// The single most important property in here is the LAST one: with default
// settings every number is byte-identical to what the engine produced before
// any of this existed. Nobody's budget moves until they opt in.

import { describe, it, expect } from "vitest";
import {
  cdDayCost,
  computeCrowdCosts,
  cutDayCancellations,
  crowdProvenanceLines,
  crowdUpliftsInForce,
  computeUplift,
  upliftProvenanceLines,
  upliftInForce,
  mealPenaltyPerHead,
  cancellationCharge,
  cancellationForCutDays,
  cancellationProvenanceLines,
  bankHolidayName,
  isBankHoliday,
  bankHolidayYearKnown,
  resolveDayPh,
  parseAny,
  prepModel,
  mergeModels,
  CROWD_DEFAULTS,
  MEAL_PENALTY_DEFAULTS,
  type CrowdDayConfig,
  type CrowdSettings,
  type ScheduleModel,
  type ShootDay,
} from "../lib/engine";
import { DEMO_FULLFAT } from "../lib/engine/demo/demo-fullfat";
import { DEMO_2NDUNIT } from "../lib/engine/demo/demo-2ndunit";

const r2 = (n: number) => Math.round(n * 100) / 100;
const addCol = (xs: number[]) => xs.reduce((a, x) => Math.round(a * 100 + x * 100) / 100, 0);

const day = (over: Partial<CrowdDayConfig> = {}): CrowdDayConfig => ({
  shift: "Day",
  fw: "std",
  ph: false,
  call: "07:00",
  wrap: "18:00",
  travel: "A",
  chars: [{ name: "Crowd", count: 200, tier: "SA" }],
  ...over,
});

// A one-day model on a known date, with 10 anonymous background.
const oneDay = (date: string, sa = 10, loc = "Barbican"): ScheduleModel =>
  prepModel(
    {
      days: [
        {
          num: 1, date, sr: "", ss: "", loc, hours: "", type: "", cams: "", pages: "",
          scenes: [{
            num: "1", part: "", ie: "EXT", slug: "", tod: "Day", scriptDay: "", pages: "1",
            unit: "Main", desc: "", sa, veh: 0, pod: false, cast: [], tags: [],
          }],
        },
      ],
      castMap: {},
      notes: [],
    } as any,
    "Main"
  );

// ===========================================================================
// 1. Uplift stack
// ===========================================================================

describe("Uplift stack — order of application", () => {
  it("commission on the artist cost, contingency on the subtotal", () => {
    const u = computeUplift(1000, { agencyPct: 17.5, contingencyPct: 10 });
    expect(u.base).toBe(1000);
    expect(u.agency).toBe(175); //           17.5% of the artist cost
    expect(u.subtotal).toBe(1175); //        artist + agency
    expect(u.contingency).toBe(117.5); //    10% of the SUBTOTAL, not of 1000
    expect(u.total).toBe(292.5);
    expect(u.grand).toBe(1292.5);
  });

  it("additional lines charge on the artist cost, never on the agency fee", () => {
    const u = computeUplift(1000, {
      agencyPct: 20,
      additional: [{ label: "Employer NI", pct: 13.8 }],
      contingencyPct: 5,
    });
    expect(u.agency).toBe(200);
    expect(u.additional).toEqual([{ label: "Employer NI", pct: 13.8, amt: 138 }]);
    expect(u.additionalTotal).toBe(138);
    expect(u.subtotal).toBe(1338); //           1000 + 200 + 138
    expect(u.contingency).toBe(66.9); //        5% of 1338
    expect(u.grand).toBe(1404.9);
  });

  it("the order of the user's additional lines cannot change the total", () => {
    const a = computeUplift(1234.56, {
      agencyPct: 15,
      additional: [{ label: "NI", pct: 13.8 }, { label: "Pension", pct: 3 }],
      contingencyPct: 7.5,
    });
    const b = computeUplift(1234.56, {
      agencyPct: 15,
      additional: [{ label: "Pension", pct: 3 }, { label: "NI", pct: 13.8 }],
      contingencyPct: 7.5,
    });
    expect(b.grand).toBe(a.grand);
  });

  it("every component is settled to the penny and the parts foot to the whole", () => {
    const u = computeUplift(3333.33, {
      agencyPct: 17.5,
      additional: [{ label: "On-cost", pct: 4.25 }],
      contingencyPct: 6,
    });
    for (const n of [u.agency, u.additionalTotal, u.contingency, u.total, u.grand])
      expect(n).toBe(r2(n));
    expect(r2(u.agency + u.additionalTotal + u.contingency)).toBe(u.total);
    expect(r2(u.base + u.total)).toBe(u.grand);
  });

  it("zero / absent settings add nothing at all", () => {
    for (const u of [undefined, {}, { agencyPct: 0, contingencyPct: 0, additional: [] }]) {
      const x = computeUplift(999.99, u);
      expect(x.total).toBe(0);
      expect(x.grand).toBe(999.99);
    }
    expect(upliftInForce(undefined)).toBe(false);
    expect(upliftInForce({ additional: [{ label: "x", pct: 0 }] })).toBe(false);
    expect(upliftInForce({ agencyPct: 15 })).toBe(true);
  });

  it("a garbage percentage is ignored rather than poisoning the total", () => {
    const u = computeUplift(100, {
      agencyPct: NaN as unknown as number,
      contingencyPct: undefined,
      additional: [{ label: "junk", pct: Infinity as unknown as number }],
    });
    expect(u.grand).toBe(100);
  });
});

describe("Uplifts inside the schedule totals", () => {
  const m = oneDay("Monday 6th July 2026");

  it("the day column still foots exactly to the grand total", () => {
    const s: CrowdSettings = {
      ...CROWD_DEFAULTS,
      uplift: {
        agencyPct: 17.5,
        additional: [{ label: "Employer NI", pct: 13.8 }],
        contingencyPct: 7.5,
      },
    };
    const mAll = mergeModels(
      prepModel(parseAny(DEMO_FULLFAT), "Main"),
      prepModel(parseAny(DEMO_2NDUNIT), "2nd")
    );
    const costs = computeCrowdCosts(mAll, {}, s);
    expect(addCol(Object.values(costs.perDay).map((e) => e.cost))).toBe(costs.grand);
    // and the split totals foot to the same figure
    expect(
      r2(
        costs.artistGrand +
          costs.upliftGrand.agency +
          costs.upliftGrand.additional +
          costs.upliftGrand.contingency
      )
    ).toBe(costs.grand);
    expect(costs.upliftGrand.total).toBe(
      r2(
        costs.upliftGrand.agency +
          costs.upliftGrand.additional +
          costs.upliftGrand.contingency
      )
    );
  });

  it("a 20% agency fee raises the total by ~20%, and it is broken out separately", () => {
    const plain = computeCrowdCosts(m);
    const withFee = computeCrowdCosts(m, {}, { ...CROWD_DEFAULTS, uplift: { agencyPct: 20 } });
    expect(withFee.artistGrand).toBe(plain.grand);
    expect(withFee.upliftGrand.agency).toBe(r2(plain.grand * 0.2));
    expect(withFee.grand).toBe(r2(plain.grand * 1.2));
    const e = Object.values(withFee.perDay)[0];
    expect(e.artistCost).toBe(plain.grand);
    expect(e.uplift.agency).toBeGreaterThan(0);
    expect(e.cost).toBe(r2(e.artistCost + e.uplift.total));
  });

  it("applies to edited days too, on top of everything the artist is paid", () => {
    const cfg = day({ chars: [{ name: "Crowd", count: 10, tier: "SA", sup: 23 }] });
    const s = { ...CROWD_DEFAULTS, uplift: { agencyPct: 15, contingencyPct: 5 } };
    const d = cdDayCost(cfg, s);
    expect(d.artistCost).toBe(r2(d.saCost));
    expect(d.uplift.agency).toBe(r2(d.artistCost * 0.15));
    expect(d.uplift.contingency).toBe(r2((d.artistCost + d.uplift.agency) * 0.05));
    expect(d.cost).toBe(r2(d.artistCost + d.uplift.total));
    // the supplementary fee is inside the base the commission is charged on
    expect(d.supCost).toBeGreaterThan(0);
  });

  it("provenance states, in plain English, exactly what is in force", () => {
    expect(upliftProvenanceLines(undefined)[0]).toMatch(/No uplifts applied/);
    const lines = upliftProvenanceLines({
      agencyPct: 17.5,
      additional: [{ label: "Employer NI", pct: 13.8 }],
      contingencyPct: 7.5,
    });
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/Agency commission 17\.5%.*artist cost/);
    expect(lines[1]).toMatch(/Employer NI 13\.8%.*artist cost/);
    expect(lines[2]).toMatch(/Contingency 7\.5%.*subtotal/);
    // the settings-level helper folds in holidays and cancellation too
    const all = crowdProvenanceLines({ ...CROWD_DEFAULTS, uplift: { agencyPct: 15 } });
    expect(all.some((l) => /Agency commission 15%/.test(l))).toBe(true);
    expect(all.some((l) => /bank holidays are not flagged automatically/.test(l))).toBe(true);
    expect(all.some((l) => /No cancellation terms set/.test(l))).toBe(true);
    expect(crowdUpliftsInForce(CROWD_DEFAULTS)).toBe(false);
  });
});

// ===========================================================================
// 2. Meal penalties
// ===========================================================================

describe("Meal penalties attached to a shoot day", () => {
  it("per head, at the day rate, inside the day total and broken out", () => {
    const plain = cdDayCost(day());
    const late = cdDayCost(day({ meals: { late: true } }));
    expect(late.meals.lines).toHaveLength(1);
    expect(late.meals.per).toBe(23.38);
    expect(late.mealCost).toBe(r2(23.38 * 200)); //  £4,676 on a 200-head day
    expect(late.cost).toBe(r2(plain.cost + 4676));
    expect(late.artistCost).toBe(late.cost); //      no uplifts set
  });

  it("night shoots pay the night rate, and both penalties stack", () => {
    const d = cdDayCost(day({ shift: "Night", meals: { short: true, late: true } }));
    expect(d.meals.per).toBe(r2(35.08 * 2));
    expect(d.mealCost).toBe(r2(35.08 * 2 * 200));
  });

  it("meal penalties are artist money — agency commission is charged on them", () => {
    const s = { ...CROWD_DEFAULTS, uplift: { agencyPct: 10 } };
    const plain = cdDayCost(day(), s);
    const late = cdDayCost(day({ meals: { late: true } }), s);
    expect(r2(late.uplift.base - plain.uplift.base)).toBe(4676);
    expect(r2(late.uplift.agency - plain.uplift.agency)).toBe(467.6);
  });

  it("no meals set changes nothing", () => {
    const base = cdDayCost(day());
    for (const meals of [undefined, {}, { short: false, late: false }]) {
      const d = cdDayCost(day({ meals }));
      expect(d.cost).toBe(base.cost);
      expect(d.mealCost).toBe(0);
    }
  });

  it("the rates are editable and default to the 2026 card", () => {
    expect(MEAL_PENALTY_DEFAULTS.short.day).toBe(23.38);
    expect(MEAL_PENALTY_DEFAULTS.late.night).toBe(35.08);
    const custom = { ...CROWD_DEFAULTS, meals: {
      short: { label: "Short lunch", day: 30, night: 40 },
      late: { label: "Late lunch", day: 30, night: 40 },
    } };
    expect(mealPenaltyPerHead({ short: true }, "Day", custom.meals).per).toBe(30);
    expect(cdDayCost(day({ meals: { short: true } }), custom).mealCost).toBe(6000);
  });

  it("reaches the schedule total through an edited day", () => {
    const m = oneDay("Monday 6th July 2026");
    const cfg = day({ chars: [{ name: "Crowd", count: 10, tier: "SA" }] });
    const plain = computeCrowdCosts(m, { "Main|1": cfg }).grand;
    const withMeal = computeCrowdCosts(m, {
      "Main|1": { ...cfg, meals: { late: true } },
    }).grand;
    expect(r2(withMeal - plain)).toBe(r2(23.38 * 10));
  });
});

// ===========================================================================
// 3. UK bank holidays
// ===========================================================================

describe("UK bank-holiday table (England & Wales)", () => {
  it("knows the substitute days across 2026–2028", () => {
    expect(bankHolidayName("2026-12-25")).toBe("Christmas Day");
    // Boxing Day 2026 is a Saturday — the holiday is Monday 28 December
    expect(bankHolidayName("2026-12-26")).toBe(null);
    expect(bankHolidayName("2026-12-28")).toMatch(/Boxing Day/);
    expect(bankHolidayName("2027-03-26")).toBe("Good Friday");
    expect(bankHolidayName("2028-01-01")).toBe(null);
    expect(bankHolidayName("2028-01-03")).toMatch(/New Year/);
    expect(isBankHoliday(new Date(2026, 4, 4))).toBe(true); // 4 May 2026
    expect(isBankHoliday(new Date(2026, 4, 5))).toBe(false);
  });

  it("dates outside the table's years are unknown, not 'no holiday'", () => {
    expect(bankHolidayYearKnown("2026-01-01")).toBe(true);
    expect(bankHolidayYearKnown("2031-01-01")).toBe(false);
    expect(isBankHoliday("2031-12-25")).toBe(false);
  });

  it("a London-BST date is read on the local calendar, not UTC", () => {
    // 25 May 2026 00:00 local is 24 May 23:00Z — toISOString() would miss it
    expect(isBankHoliday(new Date(2026, 4, 25))).toBe(true);
  });
});

describe("Auto public holidays", () => {
  const bh = "Monday 25th May 2026"; // Spring bank holiday
  const cfg = day({ chars: [{ name: "Crowd", count: 10, tier: "SA" }] });

  it("is OFF by default — a bank holiday costs exactly as it did", () => {
    const m = oneDay(bh);
    const off = computeCrowdCosts(m).grand;
    const other = computeCrowdCosts(oneDay("Tuesday 26th May 2026")).grand;
    expect(off).toBe(other);
    expect(Object.keys(computeCrowdCosts(m).autoPhDays)).toHaveLength(0);
  });

  it("when ON, an unedited bank holiday prices on the PH base and is flagged", () => {
    const s = { ...CROWD_DEFAULTS, autoPublicHolidays: true };
    const m = oneDay(bh);
    const on = computeCrowdCosts(m, {}, s);
    const off = computeCrowdCosts(m);
    expect(on.grand).toBeGreaterThan(off.grand * 1.4); // PH base £166.82 vs £111.21
    const e = Object.values(on.perDay)[0];
    expect(e.ph).toEqual({ applied: true, auto: true, user: false, name: "Spring bank holiday" });
    expect(on.autoPhDays["M1"]).toBe("Spring bank holiday");
    // a normal day is untouched
    const normal = computeCrowdCosts(oneDay("Tuesday 26th May 2026"), {}, s);
    expect(normal.grand).toBe(off.grand);
    expect(Object.values(normal.perDay)[0].ph.applied).toBe(false);
  });

  it("an edited day on a bank holiday is lifted too", () => {
    const s = { ...CROWD_DEFAULTS, autoPublicHolidays: true };
    const m = oneDay(bh);
    const on = computeCrowdCosts(m, { "Main|1": cfg }, s).grand;
    const off = computeCrowdCosts(m, { "Main|1": cfg }).grand;
    expect(on).toBeGreaterThan(off);
  });

  it("NEVER overrides a user who explicitly said this is not a PH", () => {
    const s = { ...CROWD_DEFAULTS, autoPublicHolidays: true };
    const m = oneDay(bh);
    const stated: CrowdDayConfig = { ...cfg, ph: false, phSet: true };
    const auto = computeCrowdCosts(m, { "Main|1": cfg }, s).grand;
    const user = computeCrowdCosts(m, { "Main|1": stated }, s).grand;
    expect(user).toBe(computeCrowdCosts(m, { "Main|1": stated }).grand);
    expect(user).toBeLessThan(auto);
    const e = Object.values(computeCrowdCosts(m, { "Main|1": stated }, s).perDay)[0];
    expect(e.ph).toEqual({ applied: false, auto: false, user: true, name: null });
    expect(Object.keys(computeCrowdCosts(m, { "Main|1": stated }, s).autoPhDays)).toHaveLength(0);
  });

  it("a user's PH tick on a NON-holiday still stands, flagged as theirs", () => {
    const s = { ...CROWD_DEFAULTS, autoPublicHolidays: true };
    const m = oneDay("Tuesday 26th May 2026");
    const ticked: CrowdDayConfig = { ...cfg, ph: true };
    const e = Object.values(computeCrowdCosts(m, { "Main|1": ticked }, s).perDay)[0];
    expect(e.ph).toEqual({ applied: true, auto: false, user: true, name: null });
  });

  it("resolveDayPh states the precedence directly", () => {
    const s = { ...CROWD_DEFAULTS, autoPublicHolidays: true };
    const d = { _date: new Date(2026, 4, 25) } as ShootDay;
    expect(resolveDayPh(d, undefined, s).auto).toBe(true);
    // legacy config (no phSet) with ph:true is treated as the user's tick
    expect(resolveDayPh(d, { ...cfg, ph: true }, s).user).toBe(true);
    // legacy config with ph:false is a blank the engine may fill
    expect(resolveDayPh(d, { ...cfg, ph: false }, s).auto).toBe(true);
    // …unless the user said so
    expect(resolveDayPh(d, { ...cfg, ph: false, phSet: true }, s).applied).toBe(false);
    // auto off = nothing happens
    expect(resolveDayPh(d, undefined, CROWD_DEFAULTS).applied).toBe(false);
  });
});

// ===========================================================================
// 4. Cancellation on cut days
// ===========================================================================

describe("Cancellation charges on a cut day", () => {
  const terms = { noticeDays: 7, pct: 75 };

  it("inside the notice window the production still owes the stated share", () => {
    const c = cancellationCharge(38000, 3, terms);
    expect(c.withinNotice).toBe(true);
    expect(c.charge).toBe(28500);
    expect(c.saved).toBe(9500); //  NOT £38,000
  });

  it("outside the window the day is a clean saving", () => {
    const c = cancellationCharge(38000, 30, terms);
    expect(c.withinNotice).toBe(false);
    expect(c.charge).toBe(0);
    expect(c.saved).toBe(38000);
  });

  it("the boundary day is inside the window, and a past day always is", () => {
    expect(cancellationCharge(1000, 7, terms).withinNotice).toBe(true);
    expect(cancellationCharge(1000, 8, terms).withinNotice).toBe(false);
    expect(cancellationCharge(1000, -2, terms).charge).toBe(750);
  });

  it("an undated day is never charged, and says so", () => {
    const c = cancellationCharge(1000, null, terms);
    expect(c.daysNotice).toBe(null);
    expect(c.withinNotice).toBe(false);
    expect(c.charge).toBe(0);
  });

  it("defaults are OFF — a cut day reads exactly as it did before", () => {
    for (const s of [undefined, {}, { noticeDays: 0, pct: 0 }, { noticeDays: 7, pct: 0 }]) {
      const c = cancellationCharge(38000, 1, s);
      expect(c.charge).toBe(0);
      expect(c.saved).toBe(38000);
    }
    expect(cancellationProvenanceLines(undefined)[0]).toMatch(/No cancellation terms/);
    expect(cancellationProvenanceLines(terms)[0]).toMatch(/7 days or fewer.*75%/);
  });

  it("summarises a set of cut days for the revision diff", () => {
    const asOf = new Date(2026, 6, 1);
    const cut = [
      { id: "M10", num: 10, unit: "Main", _date: new Date(2026, 6, 4) }, //  3 days' notice
      { id: "M20", num: 20, unit: "Main", _date: new Date(2026, 7, 1) }, // 31 days' notice
    ];
    const costs: Record<string, number> = { M10: 38000, M20: 10000 };
    const sum = cancellationForCutDays(cut, (d) => costs[d.id!] || 0, terms, asOf);
    expect(sum.days.map((x) => x.daysNotice)).toEqual([3, 31]);
    expect(sum.fullCost).toBe(48000);
    expect(sum.charge).toBe(28500);
    expect(sum.saved).toBe(19500);
    expect(sum.inForce).toBe(true);
  });

  it("prices real cut days off the old revision's costs", () => {
    const m = oneDay("Saturday 4th July 2026", 100);
    const costs = computeCrowdCosts(m);
    const cutDay = m.days[0];
    const dayCost = costs.perDay[cutDay.id!].cost;
    const s = { ...CROWD_DEFAULTS, cancellation: terms };
    const sum = cutDayCancellations([cutDay], costs, s, new Date(2026, 6, 1));
    expect(sum.fullCost).toBe(dayCost);
    expect(sum.charge).toBe(r2(dayCost * 0.75));
    expect(sum.saved).toBe(r2(dayCost - r2(dayCost * 0.75)));
    // default settings: the full saving, exactly as the diff reported before
    const off = cutDayCancellations([cutDay], costs, CROWD_DEFAULTS, new Date(2026, 6, 1));
    expect(off.charge).toBe(0);
    expect(off.saved).toBe(dayCost);
  });
});

// ===========================================================================
// 5. THE GUARANTEE: defaults change nothing
// ===========================================================================

describe("Zero-default guarantee", () => {
  const mAll = mergeModels(
    prepModel(parseAny(DEMO_FULLFAT), "Main"),
    prepModel(parseAny(DEMO_2NDUNIT), "2nd")
  );

  it("the demo schedule still totals £604,837 with the new settings present", () => {
    expect(Math.round(computeCrowdCosts(mAll).grand)).toBe(604837);
    expect(Math.round(computeCrowdCosts(mAll, {}, CROWD_DEFAULTS).grand)).toBe(604837);
  });

  it("every per-day figure is identical with defaults, explicit zeros, or nothing set", () => {
    const bare: CrowdSettings = { pact: CROWD_DEFAULTS.pact, spact: CROWD_DEFAULTS.spact };
    const zeros: CrowdSettings = {
      ...CROWD_DEFAULTS,
      uplift: { agencyPct: 0, contingencyPct: 0, additional: [] },
      cancellation: { noticeDays: 0, pct: 0 },
      autoPublicHolidays: false,
    };
    const a = computeCrowdCosts(mAll, {}, bare);
    const b = computeCrowdCosts(mAll, {}, CROWD_DEFAULTS);
    const c = computeCrowdCosts(mAll, {}, zeros);
    expect(b.grand).toBe(a.grand);
    expect(c.grand).toBe(a.grand);
    for (const id of Object.keys(a.perDay)) {
      expect(b.perDay[id].cost).toBe(a.perDay[id].cost);
      expect(c.perDay[id].cost).toBe(a.perDay[id].cost);
      // the all-in figure IS the artist cost when nothing is uplifted
      expect(a.perDay[id].artistCost).toBe(a.perDay[id].cost);
      expect(a.perDay[id].uplift.total).toBe(0);
      expect(a.perDay[id].mealCost).toBe(0);
    }
    expect(a.artistGrand).toBe(a.grand);
    expect(a.mealGrand).toBe(0);
    expect(a.upliftGrand.total).toBe(0);
  });
});
