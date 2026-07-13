// Prototype parity — the strongest guarantee we have that the port is
// faithful. The fixtures were captured from prototype_1.html running live in
// a clean browser (no saved edits, default rates) on 2026-07-13: every
// per-day cost the prototype computed, for both engines, on the merged
// Main + 2nd Unit demo schedule. The port must match all of them exactly.

import { describe, it, expect } from "vitest";
import crowdPerDay from "./fixtures/prototype-crowd-perday.json";
import stuntPerDay from "./fixtures/prototype-stunt-perday.json";
import {
  computeCrowdCosts,
  computeStuntCosts,
  mergeModels,
  parseAny,
  prepModel,
} from "../lib/engine";
import { DEMO_FULLFAT } from "../lib/engine/demo/demo-fullfat";
import { DEMO_2NDUNIT } from "../lib/engine/demo/demo-2ndunit";

const mMain = prepModel(parseAny(DEMO_FULLFAT), "Main");
const m2U = prepModel(parseAny(DEMO_2NDUNIT), "2nd");
m2U.castMap = Object.assign({}, mMain.castMap, m2U.castMap);
const mAll = mergeModels(mMain, m2U);

describe("prototype parity — merged demo schedule, default rates", () => {
  it(`crowd: all ${Object.keys(crowdPerDay).length} costed days match the prototype to the penny`, () => {
    const mine = Object.fromEntries(
      Object.entries(computeCrowdCosts(mAll).perDay).map(([id, e]) => [
        id,
        +e.cost.toFixed(2),
      ])
    );
    expect(mine).toEqual(crowdPerDay);
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
