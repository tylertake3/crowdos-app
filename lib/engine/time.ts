// Card-agnostic time mechanics shared by both rate cards.
// THE 07:00 FRAMEWORK RULE lives here: the working day counts from
// max(call, 07:00); pre-07:00 time is covered by early-call payments and
// never double-counts into basic hours or OT.

import type { CrowdDayConfig } from "./types";

export interface DayTimes {
  call: number; // decimal hours, e.g. 7.5 = 07:30
  wrap: number; // decimal hours; +24 if past midnight
  hours: number;
}

export function cdTimes(c: Pick<CrowdDayConfig, "call" | "wrap">): DayTimes {
  const [ch, cm] = (c.call || "07:00").split(":").map(Number);
  const [wh, wm] = (c.wrap || "18:00").split(":").map(Number);
  const call = ch + cm / 60;
  let wrap = wh + wm / 60;
  if (wrap <= call) wrap += 24;
  return { call, wrap, hours: wrap - call };
}

export interface OtBlocks {
  otBlocks: number;
  otDayB: number;
  otNightB: number;
}

// OT rounds UP per 30-min block. Blocks from 22:00 onward (including past
// midnight) count as night blocks — a day shoot wrapping late keeps its day
// base, only the OT blocks switch to the night money.
export function otBlocksFor(
  call: number,
  wrap: number,
  frameworkHours: number
): OtBlocks {
  const effCall = Math.max(call, 7);
  const otH = Math.max(0, wrap - effCall - frameworkHours);
  const otBlocks = Math.max(0, Math.ceil(otH * 2 - 1e-9));
  let otDayB = 0;
  let otNightB = 0;
  const otStart = effCall + frameworkHours;
  for (let i = 0; i < otBlocks; i++) {
    const t = (otStart + i * 0.5) % 24;
    if (t >= 22 || t < 7) otNightB++;
    else otDayB++;
  }
  return { otBlocks, otDayB, otNightB };
}

// Every 30 min before 07:00 pays an early-call block (rounded up).
export function earlyBlocksFor(call: number): number {
  return call < 7 ? Math.max(0, Math.ceil((7 - call) * 2 - 1e-9)) : 0;
}

// Called AT OR BEFORE 06:00 → early-call travel applies.
export function earlyTravelApplies(call: number): boolean {
  return call <= 6;
}
