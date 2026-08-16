// Shoot-day date parsing. Call sheets and schedules write the date every way
// a human might, and a day whose _date fails to parse silently loses date
// sorting, week grouping, continuity runs, the calendar and the weather —
// it just renders its raw string. Real schedules SHOUT ("MONDAY 14TH APRIL"),
// which the original case-sensitive ordinal suffix never matched.
import { afterAll, describe, it, expect } from "vitest";
import { parseDayDate, parseDayDateFull, defaultDateYear, prepModel, weekKey, weekKeyDate } from "../lib/engine/model";
import type { ScheduleModel, ShootDay } from "../lib/engine/types";

const d = (date: string) => parseDayDate({ date });
const ymd = (date: string) => {
  const x = d(date);
  return x ? [x.getFullYear(), x.getMonth() + 1, x.getDate()].join("-") : null;
};
// The engine no longer hardcodes 2026 as the year for a date that states none
// — a hardcoded year silently mis-dates every schedule the moment the calendar
// rolls over. The anchor is the current year, so the expectation is too.
const Y = defaultDateYear();

describe("parseDayDate", () => {
  it("reads the ordinary lower/mixed-case forms", () => {
    expect(ymd("Monday 14th April")).toBe(`${Y}-4-14`);
    expect(ymd("14 April 2025")).toBe("2025-4-14");
    expect(ymd("Mon 6 Jul")).toBe(`${Y}-7-6`);
    expect(ymd("July 6")).toBe(`${Y}-7-6`);
  });

  it("reads SHOUTED dates with ordinal suffixes", () => {
    expect(ymd("MONDAY 14TH APRIL")).toBe(`${Y}-4-14`);
    expect(ymd("TUESDAY 1ST MAY")).toBe(`${Y}-5-1`);
    expect(ymd("WEDNESDAY 23RD APRIL 2025")).toBe("2025-4-23");
    expect(ymd("SATURDAY 2ND AUGUST")).toBe(`${Y}-8-2`);
  });

  it("reads abbreviated months, with or without a full stop", () => {
    expect(ymd("MON 14 APR")).toBe(`${Y}-4-14`);
    expect(ymd("Sept. 3 2025")).toBe("2025-9-3");
    expect(ymd("3 Sep 2025")).toBe("2025-9-3");
    expect(ymd("Thurs 11 Dec")).toBe(`${Y}-12-11`);
  });

  it("month-first forms keep working, ordinal or not", () => {
    expect(ymd("April 14th, 2025")).toBe("2025-4-14");
    expect(ymd("APRIL 14 2025")).toBe("2025-4-14");
  });

  it("does not invent a date from a non-month word", () => {
    expect(d("Marketing 12")).toBeNull();
    expect(d("D14")).toBeNull();
    expect(d("TBC")).toBeNull();
    expect(d("")).toBeNull();
  });

  // ---- formats the old parser returned null for ----

  it("reads ISO dates (the shape every exported/AI-read schedule uses)", () => {
    expect(ymd("2025-04-14")).toBe("2025-4-14");
    expect(ymd("2026-12-01")).toBe("2026-12-1");
    expect(ymd("Shoot Day 4 — 2025/04/14")).toBe("2025-4-14");
  });

  it("reads UK numeric dates, DD/MM order, with 2- or 4-digit years", () => {
    expect(ymd("14/04/2025")).toBe("2025-4-14"); // used to return null
    expect(ymd("14/04/25")).toBe("2025-4-14");
    expect(ymd("14.04.2025")).toBe("2025-4-14");
    expect(ymd("14-04-2025")).toBe("2025-4-14");
    // DD/MM, never MM/DD: 04/03 is 4 March, not 3 April
    expect(ymd("04/03/2026")).toBe("2026-3-4");
  });

  it("expands a 2-digit year on the named-month forms too", () => {
    expect(ymd("14 April 25")).toBe("2025-4-14");
    expect(ymd("23-Sep-2024")).toBe("2024-9-23");
  });

  it("REJECTS an impossible date instead of rolling it into the next month", () => {
    // 31 February used to silently become 3 March — a shoot day invented on a
    // date the schedule never mentions, which then sorts and groups wrongly
    expect(d("31 February 2026")).toBeNull();
    expect(d("31/02/2026")).toBeNull();
    expect(d("2026-02-30")).toBeNull();
    expect(d("32 January 2026")).toBeNull();
    expect(d("2026-13-01")).toBeNull();
    // …but a real leap day is fine
    expect(ymd("29 February 2024")).toBe("2024-2-29");
    expect(d("29 February 2026")).toBeNull(); // 2026 is not a leap year
  });

  it("does not read a trailing call time as a year", () => {
    expect(ymd("3 September 07:00")).toBe(`${Y}-9-3`);
  });

  it("reports whether the source actually stated a year", () => {
    expect(parseDayDateFull({ date: "14 April 2025" })!.hasYear).toBe(true);
    expect(parseDayDateFull({ date: "Monday 14th April" })!.hasYear).toBe(false);
  });

  it("honours an explicit anchor year for a date that states none", () => {
    expect(parseDayDate({ date: "Monday 14th April" }, { year: 2031 })!.getFullYear()).toBe(2031);
  });
});

const day = (date: string, num = 1): ShootDay => ({
  num, date, sr: "", ss: "", loc: "", hours: "", type: "", cams: "",
  scenes: [], pages: "",
});
const model = (days: ShootDay[]): ScheduleModel =>
  prepModel({ days, castMap: {}, notes: [] }, "Main");

describe("prepModel — a year absent from one day comes from its neighbours", () => {
  it("takes the year from another day in the same schedule, not from the clock", () => {
    const m = model([
      day("Monday 6th July 2019", 1),
      day("Tuesday 7th July", 2), //  no year stated
      day("Wednesday 8th July", 3),
    ]);
    expect(m.days.map((x) => x._date!.getFullYear())).toEqual([2019, 2019, 2019]);
    expect(m.days.some((x) => x._dateYearAssumed)).toBe(false);
  });

  it("rolls a shoot that runs across New Year into the next year", () => {
    const m = model([
      day("Monday 29th December 2025", 1),
      day("Thursday 1st January", 2),
      day("Friday 2nd January", 3),
    ]);
    expect(m.days.map((x) => x._date!.getFullYear())).toEqual([2025, 2026, 2026]);
  });

  it("flags days only when the WHOLE document states no year anywhere", () => {
    const m = model([day("Monday 6th July", 1), day("Tuesday 7th July", 2)]);
    expect(m.days.every((x) => x._dateYearAssumed)).toBe(true);
    expect(m.days[0]._date!.getFullYear()).toBe(defaultDateYear());
  });

  it("leaves an unparseable date null and unflagged", () => {
    const m = model([day("14 April 2025", 1), day("TBC", 2)]);
    expect(m.days[1]._date).toBeNull();
    expect(m.days[1]._dateYearAssumed).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TIMEZONE MATRIX.
//
// The suite is pinned to TZ=Europe/London, which is the single timezone that
// hides the worst of these bugs (weekKey's UTC round-trip only misfires under
// BST, and only for half the year). These assertions are facts about the
// calendar — 8 July 2026 is a Wednesday and its Monday is 6 July, everywhere
// on earth — so they must hold under any host timezone, and they are run under
// several deliberately hostile ones: west of Greenwich, far east of it, and a
// half-hour offset.
// ---------------------------------------------------------------------------
const ZONES = [
  "Europe/London", //      the pinned zone (BST in July)
  "UTC",
  "America/Los_Angeles", // −7/−8: local midnight is the previous UTC day's morning
  "Pacific/Kiritimati", // +14: local midnight is the previous UTC day
  "Asia/Kolkata", //       +5:30, a half-hour offset
  "Australia/Sydney", //   southern-hemisphere DST, opposite phase to the UK
];
const ORIGINAL_TZ = process.env.TZ;
afterAll(() => {
  process.env.TZ = ORIGINAL_TZ;
});

describe.each(ZONES)("date handling under TZ=%s", (tz) => {
  const inZone = <T>(fn: () => T): T => {
    process.env.TZ = tz;
    try {
      return fn();
    } finally {
      process.env.TZ = ORIGINAL_TZ;
    }
  };

  it("weekKey names the LOCAL Monday of the week", () => {
    inZone(() => {
      // Wed 8 Jul 2026 → Mon 6 Jul 2026. The old toISOString round-trip
      // returned 5 Jul here whenever the host was ahead of UTC at midnight.
      expect(weekKey(new Date(2026, 6, 8))).toBe("2026-07-06");
      expect(weekKey(new Date(2026, 6, 6))).toBe("2026-07-06"); // the Monday itself
      expect(weekKey(new Date(2026, 6, 12))).toBe("2026-07-06"); // the Sunday
      expect(weekKey(new Date(2026, 6, 13))).toBe("2026-07-13"); // the next Monday
    });
  });

  it("consecutive weeks are always exactly 7 days apart across the DST change", () => {
    inZone(() => {
      // The UK clocks go back on 25 October 2026. Under the old key these two
      // rows implied an 8-day week.
      const keys = [
        weekKey(new Date(2026, 9, 20)), //  w/c Mon 19 Oct (BST)
        weekKey(new Date(2026, 9, 27)), //  w/c Mon 26 Oct (GMT)
        weekKey(new Date(2026, 10, 3)), //  w/c Mon 2 Nov
      ];
      expect(keys).toEqual(["2026-10-19", "2026-10-26", "2026-11-02"]);
      for (let i = 1; i < keys.length; i++) {
        const a = weekKeyDate(keys[i - 1])!, b = weekKeyDate(keys[i])!;
        const days = Math.round(
          (Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) -
            Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) /
            86400000
        );
        expect(days).toBe(7);
      }
    });
  });

  it("a parsed date keeps the calendar day the schedule wrote", () => {
    inZone(() => {
      for (const text of ["2026-07-06", "06/07/2026", "Monday 6th July 2026", "July 6, 2026"]) {
        const x = parseDayDate({ date: text })!;
        expect([x.getFullYear(), x.getMonth() + 1, x.getDate()], text).toEqual([2026, 7, 6]);
        // and the day it groups under is its own week's Monday
        expect(weekKey(x)).toBe("2026-07-06");
      }
    });
  });

  it("weekKeyDate round-trips a key back to the same local calendar day", () => {
    inZone(() => {
      const back = weekKeyDate("2026-07-06")!;
      expect([back.getFullYear(), back.getMonth() + 1, back.getDate()]).toEqual([2026, 7, 6]);
      expect(weekKey(back)).toBe("2026-07-06");
    });
  });
});
