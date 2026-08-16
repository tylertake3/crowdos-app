// ============================================================
// PACT/FAA 2026 rate card — Supporting Artists (SA) & Featured
// ============================================================
// THIS FILE IS THE PACT/FAA CARD ONLY. Take 3 SPACT lives in spact.ts and
// the two must never blur together.
//
// Locked rules (RATE-ENGINE-NOTES.md):
// · SA Basic Daily Rate £111.21 (day). Night BDR £166.82 applies ONLY on
//   scheduled night shoots — a day shoot wrapping late keeps the day base.
// · Holiday = 12.07% on the day rate only.
// · OT & early-call payments are charged AND displayed holiday-inclusive:
//   £11.69/30min day OT · £17.54/30min night OT & early call
//   (public holiday: £17.54 day / £26.29 night+early).
// · THERE IS NO FEATURED RATE — Featured SA = SA BDR + supplementary fees.

import type { CrowdDayConfig } from "./types";
import {
  cdTimes,
  otBlocksFor,
  earlyBlocksFor,
  earlyTravelApplies,
} from "./time";
import { round2, sumMoney } from "./money";

// PACT/FAA 2026 constants (rate card + client-confirmed canon)
export const PACT = {
  dayBDR: 111.21,
  nightBDR: 166.82,
  phDay: 166.82,
  phNight: 250.22,
  // holiday-EXCLUSIVE OT figures from the card print (kept for reference —
  // the engine charges the holiday-inclusive OTINC figures below)
  otDay: 10.43,
  otNight: 15.65,
  otPHDay: 15.65,
  otPHNight: 23.46,
  hol: 0.1207,
  travelA: 17.09,
  travelB: 23.89,
  early: 20.91, // early-call travel (called at or before 06:00) — FAA 2026, from 1 Mar 2026
  stdHrs: 9, // Standard Day framework
  cwdHrs: 7, // Continuous Working Day framework
} as const;

// OT & early-call rates DISPLAYED AND CHARGED including 12.07% holiday
// (client preference — matches the SPACT card print)
export const OTINC = {
  day: 11.69,
  night: 17.54,
  phDay: 17.54,
  phNight: 26.29,
} as const;

// Editable PACT-side settings with card defaults (replaces the prototype's
// DOM input getters gOTd/gOTn/gETsa/gTA/gTB and #cSA/#cHol).
export interface PactSettings {
  sa: number; //        SA basic daily rate
  hol: number; //       holiday as a fraction (0.1207)
  otDay: number; //     day OT / 30 min, holiday-inclusive
  otNight: number; //   night OT & early call / 30 min, holiday-inclusive
  earlyTravel: number; // early-call travel (≤ 06:00)
  travelA: number; //   travel allowance Cat A (TfL Zones 1–3)
  travelB: number; //   travel allowance Cat B (studios / beyond Z3)
  // ---- night & public-holiday bases ----
  // These used to be read straight off the frozen 2026 constants, so a user
  // who typed next year's card into Production Settings still paid 2026 money
  // on every night shoot and every bank holiday — silently, and only on the
  // days that cost the most. Optional, defaulting to the card constants, so an
  // existing saved settings object behaves exactly as it did.
  night?: number; //    SA night basic daily rate
  phDay?: number; //    public-holiday day base
  phNight?: number; //  public-holiday night base
  otPhDay?: number; //  day OT / 30 min on a public holiday
  otPhNight?: number; // night OT & early call / 30 min on a public holiday
}

export const PACT_DEFAULTS: PactSettings = {
  sa: PACT.dayBDR,
  hol: PACT.hol,
  otDay: OTINC.day,
  otNight: OTINC.night,
  earlyTravel: PACT.early,
  travelA: PACT.travelA,
  travelB: PACT.travelB,
  night: PACT.nightBDR,
  phDay: PACT.phDay,
  phNight: PACT.phNight,
  otPhDay: OTINC.phDay,
  otPhNight: OTINC.phNight,
};

export function pactFrameworkHours(fw: "std" | "cwd"): number {
  return fw === "cwd" ? PACT.cwdHrs : PACT.stdHrs;
}

export interface PerHeadBreakdown {
  base: number;
  hol: number;
  otBlocks: number;
  otDayB: number;
  otNightB: number;
  ot: number;
  earlyBlocks: number;
  earlyPay: number;
  earlyTravel: number;
  travel: number;
  per: number; // the per-head day total
}

// Per-head cost for one SA or Featured artist on a configured day.
// Featured uses the same BDR (base = SA rate); its extra money comes from
// per-character supplementary fees added by the caller.
export function pactPerHead(
  c: CrowdDayConfig,
  tier: "SA" | "Featured",
  s: PactSettings = PACT_DEFAULTS
): PerHeadBreakdown {
  const night = c.shift === "Night";
  const { call, wrap } = cdTimes(c);

  // Featured tracks the SA rate exactly — including the night (£166.82) and
  // public-holiday (£250.22) base swaps. (The prototype skipped the swaps
  // for Featured; confirmed as an oversight, fixed 2026-07-13.)
  const base = c.ph
    ? night
      ? (s.phNight ?? PACT.phNight)
      : (s.phDay ?? PACT.phDay)
    : night
      ? (s.night ?? PACT.nightBDR)
      : s.sa;
  const hol = base * s.hol; // 12.07% on the day rate only

  const otDayInc = c.ph ? (s.otPhDay ?? OTINC.phDay) : s.otDay;
  const otNightInc = c.ph ? (s.otPhNight ?? OTINC.phNight) : s.otNight;

  const fwH = pactFrameworkHours(c.fw);
  const { otBlocks, otDayB, otNightB } = otBlocksFor(call, wrap, fwH);
  const ot = otDayB * otDayInc + otNightB * otNightInc;

  const earlyBlocks = earlyBlocksFor(call);
  const earlyPay = earlyBlocks * otNightInc;
  const earlyTravel = earlyTravelApplies(call) ? s.earlyTravel : 0;

  const travel = c.travel === "A" ? s.travelA : c.travel === "B" ? s.travelB : 0;

  // Every component settles to the penny before it is summed, and `per` is the
  // sum of those settled components — one artist's chit for the day. Callers
  // multiply this by the headcount, which is how the money is actually paid.
  // See money.ts for why this is not cosmetic.
  const q = {
    base: round2(base),
    hol: round2(hol),
    ot: round2(ot),
    earlyPay: round2(earlyPay),
    earlyTravel: round2(earlyTravel),
    travel: round2(travel),
  };
  return {
    ...q,
    otBlocks,
    otDayB,
    otNightB,
    earlyBlocks,
    // the breakdown a view prints now adds up to the total it prints beside it
    per: sumMoney(q.base, q.hol, q.ot, q.earlyPay, q.travel, q.earlyTravel),
  };
}
