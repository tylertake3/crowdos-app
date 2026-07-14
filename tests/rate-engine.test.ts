// Validation suite — every number in RATE-ENGINE-NOTES.md must be
// reproduced here. If any of these fail, the engine has drifted from the
// validated prototype. Run with: npm test

import { describe, it, expect } from "vitest";
import {
  cdPerHead,
  computeCrowdCosts,
  computeStuntCosts,
  parseAny,
  prepModel,
  mergeModels,
  tierFwHours,
  type CrowdDayConfig,
} from "../lib/engine";
import { DEMO_FULLFAT } from "../lib/engine/demo/demo-fullfat";
import { DEMO_2NDUNIT } from "../lib/engine/demo/demo-2ndunit";

const round2 = (n: number) => Math.round(n * 100) / 100;

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

describe("PACT/FAA 2026 — SA per-head", () => {
  it("call 07:05 → wrap 18:00, Standard Day = £188.48 (£111.21 + £13.42 hol + 4×£11.69 OT + £17.09 travel)", () => {
    const p = cdPerHead(day({ call: "07:05" }), "SA");
    expect(p.base).toBe(111.21);
    expect(round2(p.hol)).toBe(13.42);
    expect(p.otBlocks).toBe(4);
    expect(p.otDayB).toBe(4); // all OT before 22:00 → day money
    expect(round2(p.ot)).toBe(46.76);
    expect(p.earlyBlocks).toBe(0);
    expect(p.travel).toBe(17.09);
    expect(round2(p.per)).toBe(188.48);
  });

  it("call 06:00 → wrap 18:00, Standard Day = £243.29 (adds 2×£17.54 early + £19.73 early travel; day counts 11h from 07:00 → 4 OT blocks, NOT 12h)", () => {
    const p = cdPerHead(day({ call: "06:00" }), "SA");
    expect(p.otBlocks).toBe(4); // framework counts from 07:00, not 06:00
    expect(p.earlyBlocks).toBe(2);
    expect(round2(p.earlyPay)).toBe(35.08);
    expect(p.earlyTravel).toBe(19.73); // called at or before 06:00
    expect(round2(p.per)).toBe(243.29);
  });

  it("SA framework: Standard Day 9h / CWD 7h", () => {
    expect(tierFwHours(day(), "SA")).toBe(9);
    expect(tierFwHours(day({ fw: "cwd" }), "SA")).toBe(7);
  });
});

describe("PACT/FAA 2026 — Featured tracks the SA rate exactly", () => {
  it("Featured on a night shoot uses the £166.82 night BDR (prototype oversight, fixed)", () => {
    const c = day({ shift: "Night", call: "18:00", wrap: "04:00" });
    const p = cdPerHead(c, "Featured");
    expect(p.base).toBe(166.82);
    expect(round2(p.hol)).toBe(20.14); // 12.07% of the night base
    expect(p.otNightB).toBe(p.otBlocks); // post-22:00 OT at night money
  });

  it("Featured on a public holiday uses the PH bases (£166.82 day / £250.22 night)", () => {
    expect(cdPerHead(day({ ph: true }), "Featured").base).toBe(166.82);
    expect(
      cdPerHead(day({ ph: true, shift: "Night", call: "18:00", wrap: "04:00" }), "Featured").base
    ).toBe(250.22);
  });

  it("Featured per-head equals SA per-head for any day config (no independent rate)", () => {
    const configs = [
      day(),
      day({ shift: "Night", call: "18:00", wrap: "05:30" }),
      day({ ph: true, call: "06:00", wrap: "19:00" }),
      day({ fw: "cwd", call: "05:30", wrap: "18:45", travel: "B" }),
    ];
    for (const c of configs) {
      expect(cdPerHead(c, "Featured").per).toBe(cdPerHead(c, "SA").per);
    }
  });
});

describe("Take 3 SPACT 2026 — per-head (separate card)", () => {
  it("07:00 → 18:00, SWD(10h) = £310.97 (£255 + £15.50 in lieu + 2×£11.69 OT + £17.09 travel)", () => {
    const p = cdPerHead(day(), "SPACT");
    expect(p.base).toBe(255);
    expect(p.hol).toBe(15.5); // flat payment in lieu — NOT a percentage
    expect(p.otBlocks).toBe(2); // 11h − 10h SWD = 1h → 2 blocks
    expect(round2(p.ot)).toBe(23.38);
    expect(p.travel).toBe(17.09);
    expect(round2(p.per)).toBe(310.97);
  });

  it("SPACT framework differs from SA: SWD 10h / CWD 8h", () => {
    expect(tierFwHours(day(), "SPACT")).toBe(10);
    expect(tierFwHours(day({ fw: "cwd" }), "SPACT")).toBe(8);
  });
});

describe("Prototype grand totals — demo schedule, default rates", () => {
  const mMain = prepModel(parseAny(DEMO_FULLFAT), "Main");
  const m2U = prepModel(parseAny(DEMO_2NDUNIT), "2nd");
  m2U.castMap = Object.assign({}, mMain.castMap, m2U.castMap);
  const mAll = mergeModels(mMain, m2U);

  // BASELINE HISTORY:
  // · £574,342 (original notes) — testing residue in localStorage, discarded.
  // · £574,155 — clean prototype, confirmed by Tyler 2026-07-13.
  // · £596,689 (current) — 2026-07-14 parser correction: Day 77's crowd is
  //   written "160 x c" (lowercase) in the schedule; the prototype's
  //   uppercase-only pattern missed it, undercounting the day by 159 SAs
  //   (~£22.5k). See prototype-parity.test.ts (M77).
  it("crowd mode grand total = £596,689 (Full Schedule, incl. Day 77 lowercase-crowd fix)", () => {
    const crowd = computeCrowdCosts(mAll);
    expect(Math.round(crowd.grand)).toBe(596689);
  });

  it("stunt mode grand total = £261,270 (Full Schedule)", () => {
    const stunt = computeStuntCosts(mAll);
    expect(Math.round(stunt.grand)).toBe(261270);
  });

  it("stunt mode, Main Unit only = £206,685", () => {
    const stunt = computeStuntCosts(mMain);
    expect(Math.round(stunt.grand)).toBe(206685);
  });
});
