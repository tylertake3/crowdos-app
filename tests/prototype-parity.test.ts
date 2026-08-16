// Prototype parity — the strongest guarantee we have that the port is
// faithful. The fixtures were captured from prototype_1.html running live in
// a clean browser (no saved edits, default rates) on 2026-07-13: every
// per-day cost the prototype computed, for both engines, on the merged
// Main + 2nd Unit demo schedule. The port must match all of them exactly.
//
// ONE deliberate divergence (2026-07-14): M77 is 22675.69 here, not the
// prototype's 141.72. The schedule writes Day 77's crowd as "160 x c"
// (lowercase); the prototype's uppercase-only pattern missed it and costed
// the day at a single head — a real 159-SA undercount. The parser now
// treats "N x c" case-insensitively as plain crowd.

// TWO DELIBERATE DIVERGENCES FROM AN EXACT MATCH (2026-08-15), both money
// decisions rather than port infidelity — see lib/engine/money.ts and
// lib/engine/location.ts:
//
// · Per-head figures are now settled to the penny BEFORE being multiplied by
//   the headcount, the way a payroll chit works, and every total is built from
//   already-settled components so the per-day column foots to the grand total.
//   That moves each day by pennies (largest observed on this schedule: £0.92
//   on a 160-head day; £12.33 across all 66 days). Days are therefore asserted
//   within a penny per head rather than to the exact penny — everything the
//   parity fixture actually guards (which days cost, how many heads, which
//   rate branch, which travel band) still has to match.
// · An unrecognised location now takes travel band B, not A. That is a real
//   change of budget, so this test pins the PROTOTYPE's band default
//   (unknownBand: "A") and leaves the new default's effect to
//   rate-engine.test.ts, which states the new grand total outright.

import { describe, it, expect } from "vitest";
import crowdPerDay from "./fixtures/prototype-crowd-perday.json";
import stuntPerDay from "./fixtures/prototype-stunt-perday.json";
import {
  computeCrowdCosts,
  computeStuntCosts,
  mergeModels,
  parseAny,
  prepModel,
  CROWD_DEFAULTS,
} from "../lib/engine";
import { DEMO_FULLFAT } from "../lib/engine/demo/demo-fullfat";
import { DEMO_2NDUNIT } from "../lib/engine/demo/demo-2ndunit";

const mMain = prepModel(parseAny(DEMO_FULLFAT), "Main");
const m2U = prepModel(parseAny(DEMO_2NDUNIT), "2nd");
m2U.castMap = Object.assign({}, mMain.castMap, m2U.castMap);
const mAll = mergeModels(mMain, m2U);

describe("prototype parity — merged demo schedule, default rates", () => {
  it(`crowd: all ${Object.keys(crowdPerDay).length} costed days match the prototype (within penny-quantisation)`, () => {
    const costs = computeCrowdCosts(mAll, {}, { ...CROWD_DEFAULTS, unknownBand: "A" });
    const mine = Object.fromEntries(
      Object.entries(costs.perDay).map(([id, e]) => [id, +e.cost.toFixed(2)])
    );
    // exactly the same days cost, and only those days
    expect(Object.keys(mine).sort()).toEqual(Object.keys(crowdPerDay).sort());
    for (const [id, expected] of Object.entries(crowdPerDay as Record<string, number>)) {
      const heads = costs.perDay[id].sa + costs.perDay[id].featPD + costs.perDay[id].spactPD;
      // a penny per head is the whole budget for rounding: anything larger is
      // a rate or a parse that has genuinely changed
      expect(Math.abs(mine[id] - expected)).toBeLessThanOrEqual(0.01 * heads + 0.01);
    }
  });

  it("crowd: the per-day column foots to the grand total exactly", () => {
    const costs = computeCrowdCosts(mAll);
    const summed = Object.values(costs.perDay).reduce(
      (a, e) => Math.round(a * 100 + e.cost * 100) / 100,
      0
    );
    expect(summed).toBe(costs.grand);
  });

  it(`stunt: all ${Object.keys(stuntPerDay).length} costed days match the prototype to the penny`, () => {
    const mine = Object.fromEntries(
      Object.entries(computeStuntCosts(mAll).perDay).map(([id, e]) => [
        id,
        +e.cost.toFixed(2),
      ])
    );
    expect(mine).toEqual(stuntPerDay);
  });
});
