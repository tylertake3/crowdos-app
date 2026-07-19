// BSR/Equity stunt agreement rules (Tyler, 2026-07-16 + BSR Combined Rate
// Card v2.7): weekly fee covers 5 days worked in one week; 6th day = +1×
// daily; 7th day = day7Mult × daily (1.5 on the agreements); night shoot =
// nightPct % of daily ON TOP; usage % applies ONLY to the day-rate/weekly-fee
// base (never night uplift, holiday, insurance, or adjustments); insurance
// applies to coordinators as well as performers.
import { describe, it, expect } from "vitest";
import { computeStuntCosts, STUNT_DEFAULTS } from "../lib/engine/stunt";
import { parseDayDate } from "../lib/engine/model";
import type { ScheduleModel, ShootDay, Scene } from "../lib/engine/types";

const round2 = (n: number) => Math.round(n * 100) / 100;

// one performer (cast token) working every day of the model
function modelWithDays(dates: string[], types: string[] = []): ScheduleModel {
  const days: ShootDay[] = dates.map((date, i) => {
    const scene: Scene = {
      num: String(i + 1), part: "", ie: "INT", slug: "SET", tod: "Day",
      scriptDay: "", pages: "", unit: "Main", desc: "",
      sa: 0, veh: 0, pod: false, podVeh: 0,
      cast: [{ code: "ST1", type: "stuntPerf" }],
      extras: [], spacts: [], saChars: [], featured: [], vehNames: [], tags: [],
    };
    const d: ShootDay = {
      num: i + 1, date, loc: "", hours: "", type: types[i] || "",
      sr: "", ss: "", cams: "", pages: "", unit: "Main",
      scenes: [scene], id: "M" + (i + 1),
    } as ShootDay;
    d._date = parseDayDate(d);
    return d;
  });
  return { days, castMap: {}, notes: [] };
}

// Mon 6 – Sun 12 July 2026 is one Monday-start week
const WEEK = [
  "Monday, 6 July 2026", "Tuesday, 7 July 2026", "Wednesday, 8 July 2026",
  "Thursday, 9 July 2026", "Friday, 10 July 2026", "Saturday, 11 July 2026",
  "Sunday, 12 July 2026",
];

// CFA-like settings, zeroed extras so each rule is visible in isolation
const CFA = {
  ...STUNT_DEFAULTS,
  perf: 708, coord: 899, perfWk: 2832, coordWk: 3596,
  hol: 0, ins: 0, insDays: 0, usePct: 0,
  nightPct: 50, day6Mult: 1, day7Mult: 1.5,
};

describe("stunt weekly fee & 6th/7th day (BSR)", () => {
  it("5 days in one week = the weekly fee, not 5 dailies", () => {
    const c = computeStuntCosts(modelWithDays(WEEK.slice(0, 5)), {}, CFA);
    expect(round2(c.grand)).toBe(2832); // weekly £2,832, NOT 5×£708=£3,540
  });

  it("6th day adds one daily; 7th adds 1.5× daily", () => {
    const six = computeStuntCosts(modelWithDays(WEEK.slice(0, 6)), {}, CFA);
    expect(round2(six.grand)).toBe(2832 + 708);
    const seven = computeStuntCosts(modelWithDays(WEEK), {}, CFA);
    expect(round2(seven.grand)).toBe(2832 + 708 + 708 * 1.5);
  });

  it("under 5 days in a week stays at flat dailies", () => {
    const c = computeStuntCosts(modelWithDays(WEEK.slice(0, 3)), {}, CFA);
    expect(round2(c.grand)).toBe(3 * 708);
  });

  it("weeks are independent — 4 days one week + 4 the next = 8 dailies", () => {
    const NEXT = ["Monday, 13 July 2026", "Tuesday, 14 July 2026", "Wednesday, 15 July 2026", "Thursday, 16 July 2026"];
    const c = computeStuntCosts(modelWithDays([...WEEK.slice(0, 4), ...NEXT]), {}, CFA);
    expect(round2(c.grand)).toBe(8 * 708);
  });
});

describe("night uplift & usage scope", () => {
  it("a CWN day adds nightPct % of the daily on top", () => {
    const c = computeStuntCosts(modelWithDays(WEEK.slice(0, 1), ["CWN"]), {}, CFA);
    expect(round2(c.grand)).toBe(708 + 354); // daily + 50%
  });

  it("usage applies to the weekly-derived base, never the night uplift", () => {
    const s = { ...CFA, usePct: 0.5, nightPct: 50 };
    const c = computeStuntCosts(modelWithDays(WEEK.slice(0, 5), ["CWN"]), {}, s);
    // base 2832 + usage 0.5×2832 + one night uplift 354 (usage NOT on the 354)
    expect(round2(c.grand)).toBe(2832 + 1416 + 354);
  });

  it("neutral defaults reproduce the flat-daily behaviour byte-for-byte", () => {
    const flat = { ...STUNT_DEFAULTS, hol: 0, ins: 0, insDays: 0, usePct: 0 };
    const c = computeStuntCosts(modelWithDays(WEEK), {}, flat);
    expect(round2(c.grand)).toBe(7 * 600); // 7 days × £600, no weekly/multiplier effects
  });
});

describe("stunt day calculator: hours-driven OT / early / dawn (CFA rules)", () => {
  const R = { ...CFA, otFrac: 7 }; // OT per hour or part = daily ÷ 7 = £101.142857…
  const perHr = 708 / 7;
  const one = (cfg: any, s = R) =>
    computeStuntCosts(modelWithDays(WEEK.slice(0, 1)), {}, s, { "Main|1": cfg }).grand;

  it("SWD 07:00–19:00 (12h worked, 10h framework) = 2h OT", () => {
    expect(round2(one({ call: "07:00", wrap: "19:00", fw: "swd" }))).toBe(round2(708 + 2 * perHr));
  });

  it("CWD 07:00–17:00 (10h worked, 8h framework) = 2h OT; part-hours round up", () => {
    expect(round2(one({ call: "07:00", wrap: "17:30", fw: "cwd" }))).toBe(round2(708 + 3 * perHr));
  });

  it("pre-dawn 06:00 call: 1h early OT, day counts from 07:00 (no other OT at 17:00 wrap)", () => {
    expect(round2(one({ call: "06:00", wrap: "17:00", fw: "swd" }))).toBe(round2(708 + 1 * perHr));
  });

  it("dawn call at 05:00: 5-hour day, NO early pay, OT after 5h", () => {
    // 05:00–14:00 = 9h worked → 4h past the 5h dawn day
    expect(round2(one({ call: "05:00", wrap: "14:00", fw: "swd" }))).toBe(round2(708 + 4 * perHr));
  });

  it("config night toggle adds the uplift; otFrac 0 keeps hours inert (neutral default)", () => {
    expect(round2(one({ call: "07:00", wrap: "17:00", night: true }))).toBe(round2(708 + 354));
    const neutral = { ...CFA, otFrac: 0 };
    expect(round2(one({ call: "07:00", wrap: "23:00" }, neutral))).toBe(708);
  });
});

describe("insurance covers coordinators too", () => {
  it("a coordinator's day carries insurance like a performer's", () => {
    const m = modelWithDays(WEEK.slice(0, 1));
    m.days[0].scenes[0].cast = [{ code: "SC", type: "stuntCoord" }];
    const s = { ...STUNT_DEFAULTS, coord: 899, hol: 0, usePct: 0, ins: 24, insDays: 2 };
    const c = computeStuntCosts(m, {}, s);
    expect(round2(c.grand)).toBe(899 + 24);
  });
});
