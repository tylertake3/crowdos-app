// Shoot-day date parsing. Call sheets and schedules write the date every way
// a human might, and a day whose _date fails to parse silently loses date
// sorting, week grouping, continuity runs, the calendar and the weather —
// it just renders its raw string. Real schedules SHOUT ("MONDAY 14TH APRIL"),
// which the original case-sensitive ordinal suffix never matched.
import { describe, it, expect } from "vitest";
import { parseDayDate } from "../lib/engine/model";

const d = (date: string) => parseDayDate({ date });
const ymd = (date: string) => {
  const x = d(date);
  return x ? [x.getFullYear(), x.getMonth() + 1, x.getDate()].join("-") : null;
};

describe("parseDayDate", () => {
  it("reads the ordinary lower/mixed-case forms", () => {
    expect(ymd("Monday 14th April")).toBe("2026-4-14");
    expect(ymd("14 April 2025")).toBe("2025-4-14");
    expect(ymd("Mon 6 Jul")).toBe("2026-7-6");
    expect(ymd("July 6")).toBe("2026-7-6");
  });

  it("reads SHOUTED dates with ordinal suffixes", () => {
    expect(ymd("MONDAY 14TH APRIL")).toBe("2026-4-14");
    expect(ymd("TUESDAY 1ST MAY")).toBe("2026-5-1");
    expect(ymd("WEDNESDAY 23RD APRIL 2025")).toBe("2025-4-23");
    expect(ymd("SATURDAY 2ND AUGUST")).toBe("2026-8-2");
  });

  it("reads abbreviated months, with or without a full stop", () => {
    expect(ymd("MON 14 APR")).toBe("2026-4-14");
    expect(ymd("Sept. 3 2025")).toBe("2025-9-3");
    expect(ymd("3 Sep 2025")).toBe("2025-9-3");
    expect(ymd("Thurs 11 Dec")).toBe("2026-12-11");
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
});
