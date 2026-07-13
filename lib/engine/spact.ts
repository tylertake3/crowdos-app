// ====================================================
// Take 3 SPACT 2026 rate card (4 Mar – 31 Dec 2026)
// ====================================================
// THIS FILE IS THE TAKE 3 SPACT CARD ONLY. PACT/FAA lives in pact.ts and
// the two must never blur together.
//
// Locked rules (RATE-ENGINE-NOTES.md):
// · £255 basic + £15.50 FLAT payment in lieu of holiday (not a %).
//   Night £372. Public holiday £387.50 day / £432.50 night.
// · Framework differs from SA: SWD 10h (incl. 1h lunch) / CWD 8h.
// · Same OT money as PACT, shown holiday-inclusive: £11.69 day,
//   £17.54 after 22:00 & early call (PH £17.54 / £26.29).
// · Early-call travel £20.91 (vs SA £19.73). Same travel bands A/B.

import type { CrowdDayConfig } from "./types";
import {
  cdTimes,
  otBlocksFor,
  earlyBlocksFor,
  earlyTravelApplies,
} from "./time";
import type { PerHeadBreakdown } from "./pact";

export const SP3 = {
  day: 255,
  night: 372,
  phDay: 387.5,
  phNight: 432.5,
  hol: 15.5, // FLAT payment in lieu of holiday
  fwStd: 10, // Standard Working Day framework (incl. 1h lunch)
  fwCwd: 8, //  Continuous Working Day framework
  earlyTravel: 20.91,
} as const;

// The OT money printed on the SPACT card matches PACT's holiday-inclusive
// figures; they are configured here independently so the cards stay separate.
export const SP3_OT = {
  day: 11.69,
  night: 17.54,
  phDay: 17.54,
  phNight: 26.29,
} as const;

// Editable SPACT-side settings with card defaults (replaces the prototype's
// DOM input getters gSpHol/gSpNight/gSpET and #cSpact).
export interface SpactSettings {
  basic: number; //      SPACT basic daily rate
  night: number; //      night basic rate
  hol: number; //        flat payment in lieu of holiday / day
  otDay: number; //      day OT / 30 min, holiday-inclusive
  otNight: number; //    night OT & early call / 30 min
  earlyTravel: number; // early-call travel (≤ 06:00)
  travelA: number; //    same A/B travel bands as PACT
  travelB: number;
}

export const SPACT_DEFAULTS: SpactSettings = {
  basic: SP3.day,
  night: SP3.night,
  hol: SP3.hol,
  otDay: SP3_OT.day,
  otNight: SP3_OT.night,
  earlyTravel: SP3.earlyTravel,
  travelA: 17.09,
  travelB: 23.89,
};

export function spactFrameworkHours(fw: "std" | "cwd"): number {
  return fw === "cwd" ? SP3.fwCwd : SP3.fwStd;
}

// Per-head cost for one SPACT on a configured day.
export function spactPerHead(
  c: CrowdDayConfig,
  s: SpactSettings = SPACT_DEFAULTS
): PerHeadBreakdown {
  const night = c.shift === "Night";
  const { call, wrap } = cdTimes(c);

  const base = c.ph ? (night ? SP3.phNight : SP3.phDay) : night ? s.night : s.basic;
  const hol = s.hol; // flat payment in lieu of holiday

  const otDayInc = c.ph ? SP3_OT.phDay : s.otDay;
  const otNightInc = c.ph ? SP3_OT.phNight : s.otNight;

  const fwH = spactFrameworkHours(c.fw);
  const { otBlocks, otDayB, otNightB } = otBlocksFor(call, wrap, fwH);
  const ot = otDayB * otDayInc + otNightB * otNightInc;

  const earlyBlocks = earlyBlocksFor(call);
  const earlyPay = earlyBlocks * otNightInc;
  const earlyTravel = earlyTravelApplies(call) ? s.earlyTravel : 0;

  const travel = c.travel === "A" ? s.travelA : c.travel === "B" ? s.travelB : 0;

  return {
    base,
    hol,
    otBlocks,
    otDayB,
    otNightB,
    ot,
    earlyBlocks,
    earlyPay,
    earlyTravel,
    travel,
    per: base + hol + ot + earlyPay + travel + earlyTravel,
  };
}
