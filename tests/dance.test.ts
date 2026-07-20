// Dance (Equity TV / PACT TV 2026) — numbers pinned against Take 3's own
// dance calculator (take3-dancecalculator.netlify.app), which this engine
// ports. The headline case is copied straight off the site's breakdown.

import { describe, it, expect } from "vitest";
import { danceWeek, danceDayCalc, DANCE_2026, type DanceWeek } from "../lib/engine";

const round2 = (n: number) => Math.round(n * 100) / 100;
const week = (over: Partial<DanceWeek> = {}): DanceWeek => ({
  eng: "svod", pat: "cwd", shoot: 1, reh: 0, fit: 0, usage: 65,
  days: [{ start: 8 * 60, end: 20 * 60 }],
  travelH: 0, miles: 0,
  pens: { defer: false, curtail: false, rest: false },
  ...over,
});

describe("dance — the site's own headline case", () => {
  it("SVOD · 1 shoot day · CWD 08:00–20:00 · 65% usage = £1,100.43 (OT £300 = 4×£25.50 + 4×£49.50)", () => {
    const c = danceWeek(week());
    expect(c.engFee).toBe(474.5); //          SVOD One Day Engagement
    expect(c.usage).toBeCloseTo(308.43, 2); // 65% of £474.50
    expect(c.holiday).toBe(17.5);
    expect(c.perDay[0].otHrs).toBe(4); //     12h on the clock − 8h CWD
    expect(c.perDay[0].otStdBlocks).toBe(4); // first 2 hrs
    expect(c.perDay[0].otEnhBlocks).toBe(4); // beyond 2 hrs
    expect(c.ot).toBe(4 * 25.5 + 4 * 49.5); // £300
    expect(round2(c.gross)).toBe(1100.43);
  });
});

describe("dance — weekly engagement composition", () => {
  it("2 shoot days = weekly engagement + 1 production day; usage on both", () => {
    const c = danceWeek(week({ shoot: 2, days: [{ start: 480, end: 960 }], usage: 50 }));
    expect(c.engFee).toBe(848); //   SVOD weekly
    expect(c.prodFees).toBe(70);
    expect(c.usage).toBeCloseTo((848 + 70) * 0.5, 2);
    expect(c.holiday).toBe(35); //   2 days attended
  });

  it("broadcast single day uses £402; all 7 days adds the £105 7th-day payment", () => {
    expect(danceWeek(week({ eng: "broadcast" })).engFee).toBe(402);
    const c7 = danceWeek(week({ shoot: 7, days: [{ start: 480, end: 960 }] }));
    expect(c7.seventhPay).toBe(105);
    expect(c7.prodDays).toBe(6);
  });

  it("rehearsals & fittings: flat fees, holiday counts them, usage does NOT", () => {
    const c = danceWeek(week({ reh: 2, fit: 1, usage: 100, days: [{ start: 480, end: 960 }] }));
    expect(c.rehFees).toBe(265);
    expect(c.fitFees).toBe(70);
    expect(c.holiday).toBe(4 * 17.5); // 1 shoot + 2 reh + 1 fit
    expect(c.usage).toBeCloseTo(474.5, 2); // engagement only
  });
});

describe("dance — day rules", () => {
  it("NWD caps basic at 10h; CWD at 8h", () => {
    expect(danceDayCalc({ start: 480, end: 480 + 11 * 60 }, "nwd").otHrs).toBe(1);
    expect(danceDayCalc({ start: 480, end: 480 + 11 * 60 }, "cwd").otHrs).toBe(3);
  });

  it("dawn call (04:00–05:00) caps basic hours at 5", () => {
    const d = danceDayCalc({ start: 4.5 * 60, end: 4.5 * 60 + 7 * 60 }, "cwd");
    expect(d.dawn).toBe(true);
    expect(d.basicCap).toBe(5);
    expect(d.otHrs).toBe(2);
    expect(d.otStdBlocks).toBe(4); // day rules still apply — dawn ≠ night
  });

  it("night work (start before 04:00 or past midnight): ALL OT at the enhanced rate + £35 flat", () => {
    const d = danceDayCalc({ start: 20 * 60, end: 20 * 60 + 10 * 60 }, "cwd"); // wraps 06:00 next day
    expect(d.night).toBe(true);
    expect(d.otStdBlocks).toBe(0);
    expect(d.otEnhBlocks).toBe(4); // 10h − 8h = 2h → 4 blocks, all enhanced
    expect(d.nightPay).toBe(35);
  });

  it("travel capped at 2 hrs/day; mileage at £0.55; penalties per shoot day", () => {
    const c = danceWeek(week({ travelH: 3, miles: 20, shoot: 2, days: [{ start: 480, end: 960 }], pens: { defer: true, curtail: true, rest: false } }));
    expect(c.travelPerDay).toBe(2 * 25.5);
    expect(c.milesPerDay).toBeCloseTo(11, 2);
    expect(c.travel).toBeCloseTo((51 + 11) * 2, 2);
    expect(c.pens).toBeCloseTo((8.5 + 49.5) * 2, 2);
  });
});
