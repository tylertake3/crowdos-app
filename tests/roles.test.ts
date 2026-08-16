// Custom crowd roles — a named role with its own rate card ("Stand-in",
// "Picture double"). See lib/engine/roles.ts and RATE-ENGINE-NOTES.md.
//
// The first describe block is the one that matters most: with no roles
// defined, every existing number must be byte-identical.

import { describe, it, expect } from "vitest";
import {
  cdDayCost,
  cdPerHead,
  computeCrowdCosts,
  costableReq,
  crowdProvenanceLines,
  findRole,
  mergeModels,
  parseAny,
  prepModel,
  rolePerHead,
  roleFlatPerHead,
  roleFrameworkHours,
  rolePactSettings,
  roleSpactSettings,
  CROWD_DEFAULTS,
  type CrowdDayConfig,
  type CrowdSettings,
  type CustomRole,
  type Scene,
  type ScheduleModel,
  type ShootDay,
} from "../lib/engine";
import { DEMO_FULLFAT } from "../lib/engine/demo/demo-fullfat";
import { DEMO_2NDUNIT } from "../lib/engine/demo/demo-2ndunit";

const day = (over: Partial<CrowdDayConfig> = {}): CrowdDayConfig => ({
  shift: "Day",
  fw: "std",
  ph: false,
  call: "07:00",
  wrap: "18:00",
  travel: "A",
  chars: [],
  ...over,
});

// A stand-in on the SA-shaped day (9h standard / 7h CWD) at £180.
const STANDIN: CustomRole = { id: "standin", label: "Stand-in", base: "sa", day: 180 };
// A picture double on the SPACT-shaped day (10h standard / 8h CWD) at £180 —
// deliberately the same money as STANDIN so the framework difference is the
// only thing that can move the number.
const PICDBL: CustomRole = { id: "picdbl", label: "Picture double", base: "spact", day: 180 };

const withRoles = (roles: CustomRole[], over: Partial<CrowdSettings> = {}): CrowdSettings => ({
  ...CROWD_DEFAULTS,
  roles,
  ...over,
});

// ---------------------------------------------------------------------------
// Nothing may change by default
// ---------------------------------------------------------------------------

const mMain = prepModel(parseAny(DEMO_FULLFAT), "Main");
const m2U = prepModel(parseAny(DEMO_2NDUNIT), "2nd");
m2U.castMap = Object.assign({}, mMain.castMap, m2U.castMap);
const mAll = mergeModels(mMain, m2U);

describe("zero roles changes nothing", () => {
  // The live baseline for the merged demo schedule on default settings. If
  // this moves, something priced differently — which is the whole point of
  // pinning it here.
  const BASELINE = 604836.66;

  it("the demo schedule still totals exactly what it did", () => {
    expect(computeCrowdCosts(mAll).grand).toBe(BASELINE);
    expect(computeCrowdCosts(mAll, {}, CROWD_DEFAULTS).grand).toBe(BASELINE);
  });

  it("an empty roles list and an unused role are both inert", () => {
    expect(computeCrowdCosts(mAll, {}, withRoles([])).grand).toBe(BASELINE);
    // A role can be defined, sit in Production Settings, and cost nothing
    // until a row actually names it.
    expect(computeCrowdCosts(mAll, {}, withRoles([STANDIN, PICDBL])).grand).toBe(BASELINE);
  });

  it("every day figure is identical, penny for penny, with roles defined", () => {
    const before = computeCrowdCosts(mAll);
    const after = computeCrowdCosts(mAll, {}, withRoles([STANDIN, PICDBL]));
    expect(Object.keys(after.perDay)).toEqual(Object.keys(before.perDay));
    for (const [id, e] of Object.entries(before.perDay)) {
      expect(after.perDay[id].cost).toBe(e.cost);
      expect(after.perDay[id].artistCost).toBe(e.artistCost);
      expect(after.perDay[id].sa).toBe(e.sa);
    }
    expect(after.roleGrand).toEqual({});
    expect(after.missingRoles).toEqual({});
  });

  it("the day column still foots exactly to the grand total", () => {
    const costs = computeCrowdCosts(mAll, {}, withRoles([STANDIN]));
    const summed = Object.values(costs.perDay).reduce(
      (a, e) => Math.round(a * 100 + e.cost * 100) / 100,
      0
    );
    expect(summed).toBe(costs.grand);
  });

  it("no roles means no extra provenance lines", () => {
    expect(crowdProvenanceLines(CROWD_DEFAULTS).some((l) => /Stand-in/.test(l))).toBe(false);
    expect(crowdProvenanceLines(withRoles([STANDIN])).some((l) => /Stand-in/.test(l))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The base shape is STRUCTURAL — framework hours and OT, never the money
// ---------------------------------------------------------------------------

describe("base shape decides the framework, not the money", () => {
  it("an SA-based role works the SA day: 9h standard / 7h CWD", () => {
    expect(roleFrameworkHours("std", "sa")).toBe(9);
    expect(roleFrameworkHours("cwd", "sa")).toBe(7);
  });

  it("a SPACT-based role works the SPACT day: 10h standard / 8h CWD", () => {
    expect(roleFrameworkHours("std", "spact")).toBe(10);
    expect(roleFrameworkHours("cwd", "spact")).toBe(8);
  });

  it("same money, different base = different overtime on the same day", () => {
    // 07:00 → 18:00 is 11 worked hours. SA framework 9h → 2h OT (4 blocks);
    // SPACT framework 10h → 1h OT (2 blocks).
    const sa = rolePerHead(day(), STANDIN, CROWD_DEFAULTS);
    const sp = rolePerHead(day(), PICDBL, CROWD_DEFAULTS);
    expect(sa.otBlocks).toBe(4);
    expect(sp.otBlocks).toBe(2);
    expect(sa.base).toBe(180);
    expect(sp.base).toBe(180);
  });

  it("CWD shortens the framework on both bases", () => {
    expect(rolePerHead(day({ fw: "cwd" }), STANDIN, CROWD_DEFAULTS).otBlocks).toBe(8); // 11 − 7
    expect(rolePerHead(day({ fw: "cwd" }), PICDBL, CROWD_DEFAULTS).otBlocks).toBe(6); // 11 − 8
  });
});

describe("holiday follows the base's own convention", () => {
  it("an SA-based role pays holiday as a PERCENTAGE of its day rate", () => {
    const p = rolePerHead(day(), STANDIN, CROWD_DEFAULTS);
    expect(p.hol).toBe(21.73); // 180 × 12.07%
    // and a role may state its own percentage
    const own = rolePerHead(day(), { ...STANDIN, hol: 0.1 }, CROWD_DEFAULTS);
    expect(own.hol).toBe(18);
  });

  it("a SPACT-based role pays a FLAT payment in lieu of holiday", () => {
    const p = rolePerHead(day(), PICDBL, CROWD_DEFAULTS);
    expect(p.hol).toBe(15.5); // the card's flat figure, NOT 12.07% of £180
    const own = rolePerHead(day(), { ...PICDBL, hol: 25 }, CROWD_DEFAULTS);
    expect(own.hol).toBe(25);
  });

  it("the inherited convention is visible on the resolved card", () => {
    expect(rolePactSettings(STANDIN, CROWD_DEFAULTS).hol).toBe(0.1207);
    expect(roleSpactSettings(PICDBL, CROWD_DEFAULTS).hol).toBe(15.5);
  });
});

// ---------------------------------------------------------------------------
// A role's per-head day, component by component
// ---------------------------------------------------------------------------

describe("a role's per-head day", () => {
  it("SA base, 07:00 → 18:00 standard, Cat A = £265.58", () => {
    const p = rolePerHead(day(), STANDIN, CROWD_DEFAULTS);
    expect(p.base).toBe(180);
    expect(p.hol).toBe(21.73);
    expect(p.otDayB).toBe(4);
    expect(p.otNightB).toBe(0);
    expect(p.ot).toBe(46.76); // 4 × £11.69
    expect(p.earlyPay).toBe(0);
    expect(p.travel).toBe(17.09);
    expect(p.per).toBe(265.58);
  });

  it("SPACT base, same day and money = £235.97 (one hour less OT)", () => {
    const p = rolePerHead(day(), PICDBL, CROWD_DEFAULTS);
    expect(p.hol).toBe(15.5);
    expect(p.ot).toBe(23.38); // 2 × £11.69
    expect(p.per).toBe(235.97);
  });

  it("early call pays early blocks AND early-call travel", () => {
    // Called 06:00: the day still counts from 07:00 (the framework rule), so
    // OT is unchanged at 4 blocks; 2 early blocks and the £20.91 travel are on
    // top.
    const p = rolePerHead(day({ call: "06:00" }), STANDIN, CROWD_DEFAULTS);
    expect(p.otBlocks).toBe(4);
    expect(p.earlyBlocks).toBe(2);
    expect(p.earlyPay).toBe(35.08); // 2 × £17.54
    expect(p.earlyTravel).toBe(20.91);
    expect(p.per).toBe(321.57);
  });

  it("a role may state its own early-call travel and OT", () => {
    const r: CustomRole = { ...STANDIN, earlyTravel: 30, otDay: 20, otNight: 25 };
    const p = rolePerHead(day({ call: "06:00" }), r, CROWD_DEFAULTS);
    expect(p.ot).toBe(80); // 4 × £20
    expect(p.earlyPay).toBe(50); // 2 × £25
    expect(p.earlyTravel).toBe(30);
  });

  it("travel bands A and B come off the role, defaulting to the PACT card", () => {
    expect(rolePerHead(day({ travel: "A" }), STANDIN, CROWD_DEFAULTS).travel).toBe(17.09);
    expect(rolePerHead(day({ travel: "B" }), STANDIN, CROWD_DEFAULTS).travel).toBe(23.89);
    expect(rolePerHead(day({ travel: "B" }), PICDBL, CROWD_DEFAULTS).travel).toBe(23.89);
    const own = { ...STANDIN, travelA: 5, travelB: 9 };
    expect(rolePerHead(day({ travel: "A" }), own, CROWD_DEFAULTS).travel).toBe(5);
    expect(rolePerHead(day({ travel: "B" }), own, CROWD_DEFAULTS).travel).toBe(9);
  });
});

describe("night and public-holiday bases", () => {
  it("an unstated night rate scales off the base card's night:day ratio", () => {
    // £166.82 / £111.21 × £180 = £270.01. A role that stated £180/day must
    // never inherit the SA card's £166.82 night and so price a NIGHT BELOW ITS
    // DAY — the one direction that would be indefensible.
    expect(rolePactSettings(STANDIN, CROWD_DEFAULTS).night).toBe(270.01);
    expect(rolePactSettings(STANDIN, CROWD_DEFAULTS).night!).toBeGreaterThan(180);
    expect(roleSpactSettings(PICDBL, CROWD_DEFAULTS).night).toBeGreaterThan(180);
  });

  it("a role on a night day prices on the night base", () => {
    // Night shoot 18:00 → 05:00 = 11h, framework 9h → 4 OT blocks, all after
    // 22:00 and so all at the night OT rate.
    const p = rolePerHead(
      day({ shift: "Night", call: "18:00", wrap: "05:00" }),
      STANDIN,
      CROWD_DEFAULTS
    );
    expect(p.base).toBe(270.01);
    expect(p.otNightB).toBe(4);
    expect(p.otDayB).toBe(0);
    expect(p.ot).toBe(70.16); // 4 × £17.54
    expect(p.per).toBe(389.85);
  });

  it("a stated night rate wins over the scaled default", () => {
    const r: CustomRole = { ...STANDIN, night: 300 };
    const p = rolePerHead(day({ shift: "Night", call: "18:00", wrap: "05:00" }), r, CROWD_DEFAULTS);
    expect(p.base).toBe(300);
  });

  it("public holidays swap the base and the OT rate", () => {
    const p = rolePerHead(day({ ph: true }), STANDIN, CROWD_DEFAULTS);
    expect(p.base).toBe(270.01); // scaled PH day base
    expect(p.ot).toBe(70.16); //    4 × £17.54 PH day OT
    const stated = rolePerHead(day({ ph: true }), { ...STANDIN, phDay: 250 }, CROWD_DEFAULTS);
    expect(stated.base).toBe(250);
    const spPh = rolePerHead(day({ ph: true }), PICDBL, CROWD_DEFAULTS);
    expect(spPh.base).toBeGreaterThan(180);
    expect(spPh.hol).toBe(15.5);
  });

  it("the flat (un-priced day) figure is basic + holiday, per convention", () => {
    expect(roleFlatPerHead(STANDIN, false, CROWD_DEFAULTS)).toBe(201.73); // 180 + 21.73
    expect(roleFlatPerHead(PICDBL, false, CROWD_DEFAULTS)).toBe(195.5); //  180 + 15.50
    expect(roleFlatPerHead(STANDIN, true, CROWD_DEFAULTS)).toBeGreaterThan(201.73);
  });
});

// ---------------------------------------------------------------------------
// Day costing
// ---------------------------------------------------------------------------

describe("cdDayCost with role rows", () => {
  const s = withRoles([STANDIN, PICDBL]);

  it("prices a role row through its role, and reports it on its own line", () => {
    const c = day({
      chars: [
        { name: "Crowd", count: 10, tier: "SA" },
        { name: "Stand-ins", count: 4, tier: "SA", roleId: "standin" },
      ],
    });
    const r = cdDayCost(c, s);
    expect(r.sa).toBe(10);
    expect(r.roleHeads).toBe(4);
    expect(r.heads).toBe(14);
    const line = r.roles.standin;
    expect(line.label).toBe("Stand-in");
    expect(line.base).toBe("sa");
    expect(line.heads).toBe(4);
    expect(line.perHead).toBe(265.58);
    expect(line.cost).toBe(1062.32); // 4 × £265.58
    expect(line.groups).toEqual({ "Stand-ins": 4 });
    // the SA line is only the 10 anonymous heads — the stand-ins left it
    expect(r.saCost).toBe(cdDayCost(day({ chars: [{ name: "Crowd", count: 10, tier: "SA" }] }), s).saCost);
    expect(r.artistCost).toBe(Math.round((r.saCost + r.roleCost) * 100) / 100);
  });

  it("a role line always foots: cost = heads × perHead + fees", () => {
    const c = day({
      chars: [{ name: "Stand-ins", count: 3, tier: "SA", roleId: "standin", sup: 23 }],
    });
    const r = cdDayCost(c, s);
    const line = r.roles.standin;
    expect(line.sup).toBe(69); // 3 × £23
    expect(line.cost).toBe(Math.round((line.perHead * 3 + 69) * 100) / 100);
    expect(r.supRole).toBe(69);
    expect(r.supCost).toBe(69);
    expect(r.artistCost).toBe(line.cost);
  });

  it("two roles on one day keep separate lines", () => {
    const c = day({
      chars: [
        { name: "Stand-ins", count: 2, tier: "SA", roleId: "standin" },
        { name: "Doubles", count: 3, tier: "SPACT", roleId: "picdbl" },
      ],
    });
    const r = cdDayCost(c, s);
    expect(Object.keys(r.roles).sort()).toEqual(["picdbl", "standin"]);
    expect(r.roles.picdbl.base).toBe("spact");
    expect(r.roles.picdbl.perHead).toBe(235.97);
    expect(r.spactPD).toBe(0); // the SPACT tier bucket is untouched
    expect(r.roleHeads).toBe(5);
  });

  it("a per-row call override still applies to a role row", () => {
    const c = day({
      chars: [{ name: "Stand-ins", count: 1, tier: "SA", roleId: "standin", call: "06:00" }],
    });
    const r = cdDayCost(c, s);
    expect(r.roles.standin.perHead).toBe(321.57); // the early-call figure
  });

  it("meal penalties are charged on role heads too", () => {
    const chars = [
      { name: "Crowd", count: 10, tier: "SA" as const },
      { name: "Stand-ins", count: 4, tier: "SA" as const, roleId: "standin" },
    ];
    const r = cdDayCost(day({ chars, meals: { late: true } }), s);
    expect(r.mealCost).toBe(Math.round(23.38 * 14 * 100) / 100); // 14 heads, not 10
    expect(r.artistCost).toBe(Math.round((r.saCost + r.roleCost + r.mealCost) * 100) / 100);
  });

  it("role money sits INSIDE the base agency commission and contingency charge", () => {
    const up = withRoles([STANDIN], { uplift: { agencyPct: 20, contingencyPct: 10 } });
    const c = day({ chars: [{ name: "Stand-ins", count: 4, tier: "SA", roleId: "standin" }] });
    const r = cdDayCost(c, up);
    expect(r.artistCost).toBe(1062.32);
    expect(r.uplift.base).toBe(1062.32);
    expect(r.uplift.agency).toBe(212.46); // 20% of the stand-ins' fees
    expect(r.uplift.contingency).toBe(127.48); // 10% of 1274.78
    expect(r.cost).toBe(1402.26);
  });
});

// ---------------------------------------------------------------------------
// A deleted / unknown role
// ---------------------------------------------------------------------------

describe("a role that no longer exists", () => {
  it("falls back to the row's tier — never dropped, never zero", () => {
    const c = day({
      chars: [{ name: "Stand-ins", count: 4, tier: "SPACT", roleId: "deleted-role" }],
    });
    const noRoles = withRoles([]);
    const r = cdDayCost(c, noRoles);
    // priced exactly as the same row without any roleId at all
    const plain = cdDayCost(
      day({ chars: [{ name: "Stand-ins", count: 4, tier: "SPACT" }] }),
      noRoles
    );
    expect(r.cost).toBe(plain.cost);
    expect(r.cost).toBeGreaterThan(0);
    expect(r.spactPD).toBe(4);
    expect(r.roleHeads).toBe(0);
    expect(r.heads).toBe(4);
  });

  it("is reported so the UI can say so", () => {
    const c = day({
      chars: [{ name: "Stand-ins", count: 4, tier: "SA", roleId: "deleted-role" }],
    });
    expect(cdDayCost(c, withRoles([STANDIN])).missingRoles).toEqual(["deleted-role"]);
  });

  it("findRole is safe on blank and unknown ids", () => {
    expect(findRole([STANDIN], "standin")).toBe(STANDIN);
    expect(findRole([STANDIN], "nope")).toBeUndefined();
    expect(findRole([STANDIN], "")).toBeUndefined();
    expect(findRole(undefined, "standin")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// costableReq / the imported taxonomy
// ---------------------------------------------------------------------------

describe("costableReq and the breakdown taxonomy", () => {
  it("a role makes a row a costing person, whatever tier it was imported on", () => {
    expect(costableReq({ name: "Doubles", count: 2, tier: "Stunt" })).toBe(false);
    expect(costableReq({ name: "Doubles", count: 2, tier: "Stunt", roleId: "standin" })).toBe(true);
    expect(costableReq({ name: "Cars", count: 2, unitType: "vehicle" })).toBe(false);
    expect(costableReq({ name: "Doubles", count: 2, unitType: "vehicle", roleId: "standin" })).toBe(true);
  });

  it("an explicit 'reference' budget scope still wins — a role cannot pull a stunt into the crowd budget", () => {
    expect(
      costableReq({ name: "Stunt doubles", count: 2, budgetScope: "reference", roleId: "standin" })
    ).toBe(false);
  });

  it("rows with no role behave exactly as before", () => {
    expect(costableReq({ name: "Crowd", count: 10 })).toBe(true);
    expect(costableReq({ name: "Kids", count: 3, tier: "Child" })).toBe(false);
    expect(costableReq({ name: "AV", count: 3, tier: "AV" })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Whole-schedule costing
// ---------------------------------------------------------------------------

const scene = (num: string, sa: number, over: Partial<Scene> = {}): Scene => ({
  num, part: "", ie: "EXT", slug: "SOMEWHERE", tod: "Day", scriptDay: "", pages: "1/8",
  unit: "Main", desc: "", sa, veh: 0, pod: false, cast: [], tags: [], ...over,
});

const shootDay = (num: number, date: string, scenes: Scene[]): ShootDay => ({
  num, date, sr: "", ss: "", loc: "Barbican", hours: "", type: "", cams: "", scenes, pages: "",
});

const model = (days: ShootDay[]): ScheduleModel =>
  prepModel({ days, castMap: {}, notes: [] }, "Main");

// Pin the travel band so the assertions are about roles, not the gazetteer.
const bandA = { bands: { Barbican: "A" as const } };

describe("roles across a whole schedule", () => {
  const m = model([
    shootDay(1, "Monday 6th July 2026", [
      scene("1/1", 10, {
        saChars: [{ name: "Stand-ins", count: 4, roleId: "standin" }],
      }),
    ]),
  ]);

  it("a role group adds to the day's headcount without double-counting anonymous SA", () => {
    const costs = computeCrowdCosts(m, {}, withRoles([STANDIN], bandA));
    const e = costs.perDay.M1;
    expect(e.sa).toBe(10); //        the anonymous "N x C" peak, untouched
    expect(e.roleHeads).toBe(4); //  the named group, on its role
    expect(e.heads).toBe(14);
    // and the same group with NO role would have been 14 SA — a role MOVES a
    // group between buckets, it never duplicates it
    const asSa = computeCrowdCosts(
      model([
        shootDay(1, "Monday 6th July 2026", [
          scene("1/1", 10, { saChars: [{ name: "Stand-ins", count: 4 }] }),
        ]),
      ]),
      {},
      withRoles([STANDIN], bandA)
    );
    expect(asSa.perDay.M1.sa).toBe(14);
    expect(asSa.perDay.M1.roleHeads).toBe(0);
    expect(asSa.perDay.M1.heads).toBe(14);
  });

  it("the flat (un-priced) branch prices the role at basic + holiday, plus travel per head", () => {
    const costs = computeCrowdCosts(m, {}, withRoles([STANDIN], bandA));
    const e = costs.perDay.M1;
    expect(e.roles.standin.perHead).toBe(201.73); // travel is a day-level line here
    expect(e.roles.standin.cost).toBe(806.92); //   4 × £201.73
    expect(e.travel.total).toBe(Math.round(17.09 * 14 * 100) / 100); // 14 heads
    expect(e.artistCost).toBe(
      Math.round((124.63 * 10 + 806.92 + 17.09 * 14) * 100) / 100
    );
    expect(e.cost).toBe(e.artistCost);
  });

  it("reports the day-level travel beside the flat per-head, so a role line can be shown against a tier line", () => {
    const e = computeCrowdCosts(m, {}, withRoles([STANDIN], bandA)).perDay.M1;
    // the tier figures always carry travel; the role's does not on this branch
    expect(e.travel.amt).toBe(17.09);
    expect(e.roles.standin.travelPer).toBe(17.09);
    expect(e.perHeadBy.SA).toBe(Math.round((124.63 + 17.09) * 100) / 100);
    // comparable per-head figures, and the day still charges travel once
    expect(e.roles.standin.perHead + e.roles.standin.travelPer).toBe(218.82);
    expect(e.roles.standin.cost).toBe(806.92);
  });

  it("carries no separate travel on a priced day — it is already in the per-head day", () => {
    const s = withRoles([STANDIN], { ...bandA, baseDay: { fw: "std", otHours: 2 } });
    expect(computeCrowdCosts(m, {}, s).perDay.M1.roles.standin.travelPer).toBe(0);
    const priced = cdDayCost(
      day({ chars: [{ name: "Stand-ins", count: 4, tier: "SA", roleId: "standin" }] }),
      withRoles([STANDIN])
    );
    expect(priced.roles.standin.travelPer).toBe(0);
  });

  it("the budget-assumption branch prices the role on the assumed day, through its own framework", () => {
    const s = withRoles([STANDIN, PICDBL], { ...bandA, baseDay: { fw: "std", otHours: 2 } });
    const costs = computeCrowdCosts(m, {}, s);
    // assumed day is 07:00 → 18:00, which is the £265.58 figure asserted above
    expect(costs.perDay.M1.roles.standin.perHead).toBe(265.58);
  });

  it("per-role totals are exposed for the whole schedule and are a breakdown of artistGrand", () => {
    const m2 = model([
      shootDay(1, "Monday 6th July 2026", [
        scene("1/1", 0, { saChars: [{ name: "Stand-ins", count: 4, roleId: "standin" }] }),
      ]),
      shootDay(2, "Tuesday 7th July 2026", [
        scene("2/1", 0, { saChars: [{ name: "Stand-ins", count: 6, roleId: "standin" }] }),
      ]),
    ]);
    const costs = computeCrowdCosts(m2, {}, withRoles([STANDIN], bandA));
    const g = costs.roleGrand.standin;
    expect(g.label).toBe("Stand-in");
    expect(g.base).toBe("sa");
    expect(g.days).toBe(2);
    expect(g.heads).toBe(10); //      head-days
    expect(g.maxPerDay).toBe(6);
    expect(g.cost).toBe(Math.round(201.73 * 10 * 100) / 100);
    // the role money is INSIDE artistGrand (which also carries the travel), so
    // it is a breakdown and never an addition
    expect(costs.artistGrand).toBe(
      Math.round((g.cost + 17.09 * 10) * 100) / 100
    );
    expect(costs.grand).toBe(costs.artistGrand);
    expect(costs.weeks[0].roleDays).toBe(10);
  });

  it("a schedule-level unknown role falls back to its tier and is reported per day", () => {
    const m3 = model([
      shootDay(1, "Monday 6th July 2026", [
        scene("1/1", 0, {
          spacts: [{ name: "Ghost role", count: 4, roleId: "gone" }],
        }),
      ]),
    ]);
    const costs = computeCrowdCosts(m3, {}, withRoles([STANDIN], bandA));
    const plain = computeCrowdCosts(
      model([
        shootDay(1, "Monday 6th July 2026", [
          scene("1/1", 0, { spacts: [{ name: "Ghost role", count: 4 }] }),
        ]),
      ]),
      {},
      withRoles([STANDIN], bandA)
    );
    expect(costs.perDay.M1.spactPD).toBe(4);
    expect(costs.perDay.M1.roleHeads).toBe(0);
    expect(costs.grand).toBe(plain.grand);
    expect(costs.grand).toBeGreaterThan(0);
    expect(costs.missingRoles).toEqual({ gone: ["M1"] });
    expect(costs.perDay.M1.missingRoles).toEqual(["gone"]);
  });

  it("a deleted role on a TBC row still costs at the higher candidate", () => {
    const m4 = model([
      shootDay(1, "Monday 6th July 2026", [
        scene("1/1", 0, {
          saChars: [
            { name: "Maybe spacts", count: 4, roleId: "gone", tierTbc: true, tierCandidates: ["SA", "SPACT"] },
          ],
        }),
      ]),
    ]);
    const costs = computeCrowdCosts(m4, {}, withRoles([], bandA));
    expect(costs.perDay.M1.spactPD).toBe(4); // the dearer candidate
    expect(costs.perDay.M1.sa).toBe(0);
  });

  it("uplifts and the day column still foot with roles in play", () => {
    const s = withRoles([STANDIN], { ...bandA, uplift: { agencyPct: 17.5, contingencyPct: 5 } });
    const costs = computeCrowdCosts(m, {}, s);
    const summed = Object.values(costs.perDay).reduce(
      (a, e) => Math.round(a * 100 + e.cost * 100) / 100,
      0
    );
    expect(summed).toBe(costs.grand);
    expect(costs.upliftGrand.total).toBeGreaterThan(0);
    expect(costs.grand).toBe(
      Math.round((costs.artistGrand + costs.upliftGrand.total) * 100) / 100
    );
  });

  it("supplementary fees on a role group charge the role's line, not a tier's", () => {
    const m5 = model([
      shootDay(1, "Monday 6th July 2026", [
        scene("1/1", 0, {
          saChars: [{ name: "Stand-ins", count: 4, roleId: "standin", sup: 23 }],
        }),
      ]),
    ]);
    const costs = computeCrowdCosts(m5, {}, withRoles([STANDIN], bandA));
    const e = costs.perDay.M1;
    expect(e.supRole).toBe(92); // 4 × £23
    expect(e.supSA).toBe(0);
    expect(e.supCost).toBe(92);
    expect(e.roles.standin.cost).toBe(Math.round((201.73 * 4 + 92) * 100) / 100);
  });

  it("an edited day config carries roles through cdDayCost", () => {
    const cfg: Record<string, CrowdDayConfig> = {
      "Main|1": day({
        chars: [
          { name: "Crowd", count: 10, tier: "SA" },
          { name: "Stand-ins", count: 4, tier: "SA", roleId: "standin" },
        ],
      }),
    };
    const costs = computeCrowdCosts(m, cfg, withRoles([STANDIN], bandA));
    const e = costs.perDay.M1;
    expect(e.edited).toBe(true);
    expect(e.roles.standin.perHead).toBe(265.58); // travel included on this branch
    expect(e.heads).toBe(14);
    expect(e.travel.total).toBe(Math.round(17.09 * 14 * 100) / 100);
    expect(e.artistCost).toBe(
      Math.round((cdPerHead(day(), "SA", CROWD_DEFAULTS).per * 10 + 265.58 * 4) * 100) / 100
    );
  });
});
