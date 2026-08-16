// Money: quantisation, footing, and the rate-card fields that used to be
// frozen at 2026 whatever the user typed.

import { describe, it, expect } from "vitest";
import {
  round2, money, sumMoney,
  cdPerHead, cdDayCost, computeCrowdCosts, CROWD_DEFAULTS, PACT_DEFAULTS, SPACT_DEFAULTS,
  prepModel, parseAny, mergeModels,
  type CrowdDayConfig, type ScheduleModel,
} from "../lib/engine";
import { DEMO_FULLFAT } from "../lib/engine/demo/demo-fullfat";
import { DEMO_2NDUNIT } from "../lib/engine/demo/demo-2ndunit";

const day = (over: Partial<CrowdDayConfig> = {}): CrowdDayConfig => ({
  shift: "Day", fw: "std", ph: false, call: "07:00", wrap: "18:00",
  travel: "A", chars: [], ...over,
});

describe("round2 / money / sumMoney", () => {
  it("settles to the penny, half-up, without binary surprises", () => {
    expect(round2(111.21 * 1.1207)).toBe(124.63);
    expect(round2(1.005)).toBe(1.01); //  the classic float trap
    expect(round2(2.675)).toBe(2.68);
    expect(round2(-1.005)).toBe(-1.01);
    expect(round2(0)).toBe(0);
    expect(round2(NaN)).toBe(0);
  });

  it("money() pays a settled per-head figure to a whole number of people", () => {
    expect(money(124.6329, 200)).toBe(24926); // 200 × £124.63, not £24,926.58
    expect(money(17.09, 0)).toBe(0);
  });

  it("sumMoney adds settled parts without accumulating drift", () => {
    expect(sumMoney(0.1, 0.2)).toBe(0.3);
    expect(sumMoney(...Array(1000).fill(0.01))).toBe(10);
  });
});

describe("per-head figures are settled before any headcount multiplies them", () => {
  it("every component of a per-head breakdown is a whole number of pence", () => {
    for (const c of [
      day(),
      day({ call: "06:00" }),
      day({ shift: "Night", call: "18:00", wrap: "05:30" }),
      day({ ph: true, fw: "cwd", travel: "B" }),
    ]) {
      for (const tier of ["SA", "Featured", "SPACT"] as const) {
        const p = cdPerHead(c, tier);
        for (const [k, v] of Object.entries(p)) {
          if (typeof v !== "number" || k.includes("Blocks")) continue;
          expect(round2(v), `${tier} ${k}`).toBe(v);
        }
      }
    }
  });

  it("the printed breakdown adds up to the printed per-head total", () => {
    const p = cdPerHead(day({ call: "06:00", travel: "B" }), "SA");
    expect(sumMoney(p.base, p.hol, p.ot, p.earlyPay, p.travel, p.earlyTravel)).toBe(p.per);
  });

  it("a day's cost is its per-head chit times the headcount, exactly", () => {
    const c = day({ chars: [{ name: "Crowd", count: 200, tier: "SA" }] });
    expect(cdDayCost(c).cost).toBe(money(cdPerHead(c, "SA").per, 200));
  });

  it("the RATE-ENGINE-NOTES validation numbers are unchanged", () => {
    expect(cdPerHead(day({ call: "07:05" }), "SA").per).toBe(188.48);
    expect(cdPerHead(day(), "SPACT").per).toBe(310.97);
    expect(cdPerHead(day({ call: "06:00" }), "SA").per).toBe(244.47);
  });
});

describe("the per-day column foots to the grand total", () => {
  const mMain = prepModel(parseAny(DEMO_FULLFAT), "Main");
  const m2U = prepModel(parseAny(DEMO_2NDUNIT), "2nd");
  m2U.castMap = Object.assign({}, mMain.castMap, m2U.castMap);
  const mAll = mergeModels(mMain, m2U);

  it("sum of the rounded day costs === the rounded grand total", () => {
    const costs = computeCrowdCosts(mAll);
    const summed = Object.values(costs.perDay).reduce((a, e) => sumMoney(a, +e.cost.toFixed(2)), 0);
    expect(summed).toBe(round2(costs.grand));
  });

  it("…and so do the weeks, plus whatever falls outside a week", () => {
    const costs = computeCrowdCosts(mAll);
    const weeks = costs.weeks.reduce((a, w) => sumMoney(a, w.cost), 0);
    expect(weeks).toBe(round2(costs.grand));
  });

  it("holds for an edited day too", () => {
    const model: ScheduleModel = prepModel({
      days: [{
        num: 1, date: "Monday 6th July 2026", sr: "", ss: "", loc: "Barbican",
        hours: "", type: "", cams: "", pages: "", scenes: [],
      }],
      castMap: {}, notes: [],
    }, "Main");
    const cfg: CrowdDayConfig = day({
      call: "05:30", wrap: "20:15",
      chars: [
        { name: "Crowd", count: 137, tier: "SA" },
        { name: "Drivers", count: 13, tier: "SPACT", sup: 37.22 },
        { name: "Busker", count: 1, tier: "Featured", sup: 61.62 },
      ],
    });
    const costs = computeCrowdCosts(model, { "Main|1": cfg });
    const e = costs.perDay["M1"];
    expect(round2(e.cost)).toBe(e.cost);
    expect(sumMoney(e.saCost, e.featCost, e.spactCost)).toBe(e.cost);
    expect(costs.grand).toBe(e.cost);
  });
});

// ---------------------------------------------------------------------------
// D2 — night and public-holiday money came off frozen constants, so a user who
// typed next year's card in still paid 2026 money on every night shoot and
// every bank holiday: silently, and only on the most expensive days.
// ---------------------------------------------------------------------------
describe("the rate card the user edits is the rate card that gets paid", () => {
  const nightCfg = day({ shift: "Night", call: "18:00", wrap: "04:00" });
  const phCfg = day({ ph: true });
  const phNightCfg = day({ ph: true, shift: "Night", call: "18:00", wrap: "04:00" });

  it("PACT: an edited night base is honoured", () => {
    const s = { ...CROWD_DEFAULTS, pact: { ...PACT_DEFAULTS, night: 180 } };
    expect(cdPerHead(nightCfg, "SA", s).base).toBe(180);
    expect(cdPerHead(nightCfg, "SA").base).toBe(166.82); // default unchanged
  });

  it("PACT: edited public-holiday bases are honoured, day and night", () => {
    const s = { ...CROWD_DEFAULTS, pact: { ...PACT_DEFAULTS, phDay: 175, phNight: 260 } };
    expect(cdPerHead(phCfg, "SA", s).base).toBe(175);
    expect(cdPerHead(phNightCfg, "SA", s).base).toBe(260);
  });

  it("PACT: edited public-holiday OT is honoured", () => {
    const s = { ...CROWD_DEFAULTS, pact: { ...PACT_DEFAULTS, otPhDay: 20 } };
    // 07:00 → 18:00 on a 9h framework = 4 blocks
    expect(cdPerHead(phCfg, "SA", s).ot).toBe(80);
    expect(cdPerHead(phCfg, "SA").ot).toBe(70.16); // 4 × £17.54, the card default
  });

  it("SPACT: edited public-holiday bases and OT are honoured", () => {
    const s = {
      ...CROWD_DEFAULTS,
      spact: { ...SPACT_DEFAULTS, phDay: 400, phNight: 450, otPhDay: 20 },
    };
    expect(cdPerHead(phCfg, "SPACT", s).base).toBe(400);
    expect(cdPerHead(phNightCfg, "SPACT", s).base).toBe(450);
    expect(cdPerHead(phCfg, "SPACT").base).toBe(387.5); // default unchanged
  });

  it("Featured tracks the edited SA night/PH bases too", () => {
    const s = { ...CROWD_DEFAULTS, pact: { ...PACT_DEFAULTS, night: 180, phNight: 260 } };
    expect(cdPerHead(nightCfg, "Featured", s).base).toBe(180);
    expect(cdPerHead(phNightCfg, "Featured", s).base).toBe(260);
  });

  it("a settings object saved before these fields existed behaves exactly as it did", () => {
    // the shape a stored settings blob has: no night / PH keys at all
    const legacy = {
      sa: 111.21, hol: 0.1207, otDay: 11.69, otNight: 17.54,
      earlyTravel: 20.91, travelA: 17.09, travelB: 23.89,
    };
    const s = { ...CROWD_DEFAULTS, pact: legacy };
    expect(cdPerHead(nightCfg, "SA", s).base).toBe(166.82);
    expect(cdPerHead(phNightCfg, "SA", s).base).toBe(250.22);
    expect(cdPerHead(phCfg, "SA", s).per).toBe(cdPerHead(phCfg, "SA").per);
  });
});
