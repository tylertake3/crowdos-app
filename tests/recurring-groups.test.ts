import { describe, it, expect } from "vitest";
import { computeCrowdCosts } from "../lib/engine/crowd";
import { prepModel } from "../lib/engine/model";
import type { ScheduleModel, RecurringGroup, NamedCount } from "../lib/engine/types";

// Build a schedule where one named SA group "Hotel Guests" appears on three
// days with quantities 150 / 50 / 150, all linked to the same recurring group.
function buildModel(groups: RecurringGroup[], perDayQty: number[]): ScheduleModel {
  const gid = groups[0]?.id;
  const row = (count: number): NamedCount => ({ name: "Hotel Guests", count, groupId: gid });
  const model: ScheduleModel = {
    castMap: {},
    notes: [],
    recurringGroups: groups,
    days: perDayQty.map((qty, i) => ({
      num: i + 1,
      date: `0${i + 1} Jan`,
      sr: "",
      ss: "",
      loc: "Test Location",
      hours: "",
      type: "",
      cams: "",
      pages: "",
      scenes: [
        {
          num: `${i + 1}A`,
          part: "",
          ie: "INT",
          tod: "DAY",
          scriptDay: "",
          pages: "",
          unit: "Main",
          desc: "lobby",
          sa: 0,
          veh: 0,
          pod: false,
          cast: [],
          saChars: [row(qty)],
          tags: [],
        },
      ],
    })),
  };
  return prepModel(model, "Main");
}

const HOTEL: RecurringGroup = { id: "rg_hotel", name: "Hotel Guests", tier: "SA", poolSize: 150 };

describe("recurring crowd groups — cross-day counting", () => {
  it("unique heads = peak (pool), person-days = sum", () => {
    const c = computeCrowdCosts(buildModel([HOTEL], [150, 50, 150]));
    const g = c.groups["rg_hotel"];
    expect(g).toBeDefined();
    expect(g.personDays).toBe(350); // 150 + 50 + 150 — what you pay
    expect(g.peak).toBe(150);
    expect(g.uniqueHeads).toBe(150); // who you booked, never 350
    expect(g.dayCounts.size).toBe(3);
  });

  it("a lighter day is a subset — never inflates unique heads", () => {
    const c = computeCrowdCosts(buildModel([HOTEL], [150, 50, 150]));
    // the 50-day contributes to person-days but not to the pool
    expect(c.groups["rg_hotel"].uniqueHeads).toBe(150);
  });

  it("same group in several scenes on ONE day counts once (within-day peak)", () => {
    const model = buildModel([HOTEL], [150]);
    // add a second scene same day, same group, quantity 150
    model.days[0].scenes.push({
      ...model.days[0].scenes[0],
      num: "1B",
      desc: "bar",
      saChars: [{ name: "Hotel Guests", count: 150, groupId: "rg_hotel" }],
    });
    const c = computeCrowdCosts(model);
    expect(c.groups["rg_hotel"].dayCounts.get("M1")).toBe(150);
    expect(c.groups["rg_hotel"].personDays).toBe(150); // one day, not 300
  });
});

describe("recurring group fees — once-per-run vs per-day", () => {
  it("once-run fee charged a single time on the pool", () => {
    const withFee: RecurringGroup = {
      ...HOTEL,
      fees: [{ label: "Costume fitting", amount: 20, kind: "onceRun" }],
    };
    const c = computeCrowdCosts(buildModel([withFee], [150, 50, 150]));
    // 20 × 150 unique heads = 3000, once — NOT 20 × 350
    expect(c.groups["rg_hotel"].onceRunTotal).toBe(3000);
    expect(c.groupOnceRunTotal).toBe(3000);
  });

  it("per-day fee accrues on each working day's quantity", () => {
    const withFee: RecurringGroup = {
      ...HOTEL,
      fees: [{ label: "Night premium", amount: 10, kind: "perDay" }],
    };
    const c = computeCrowdCosts(buildModel([withFee], [150, 50, 150]));
    // 10 × 350 person-days = 3500
    expect(c.groups["rg_hotel"].perDayFeeTotal).toBe(3500);
    // per-day group fees are not added to grand here (they ride on day rows)
    expect(c.groupOnceRunTotal).toBe(0);
  });

  it("once-run fee is added into the grand total", () => {
    const base = computeCrowdCosts(buildModel([HOTEL], [150, 50, 150])).grand;
    const withFee: RecurringGroup = {
      ...HOTEL,
      fees: [{ label: "Wig", amount: 20, kind: "onceRun" }],
    };
    const withGrand = computeCrowdCosts(buildModel([withFee], [150, 50, 150])).grand;
    expect(withGrand - base).toBe(3000);
  });
});

describe("recurring groups — productions without them are unaffected", () => {
  it("no groups → empty rollup, zero once-run total", () => {
    const model = buildModel([], [150, 50, 150]);
    model.recurringGroups = [];
    const c = computeCrowdCosts(model);
    expect(Object.keys(c.groups).length).toBe(0);
    expect(c.groupOnceRunTotal).toBe(0);
  });
});
