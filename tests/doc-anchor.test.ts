// Regression tests for "click a day, highlight it in the original".
//
// Every line below is real text extracted from PM2 FullFat Shooting Schedule
// (27.06.25).pdf. The bug these guard against: the first implementation
// matched "day <n>" anywhere in a line, so clicking D4 highlighted
// "Scene # EXT POND Day 4/8" (page eighths) instead of "Shoot Day # 4".

import { describe, it, expect } from "vitest";
import { dayBannerIndex, findDateLine, isDayBanner } from "../lib/engine/doc-anchor";

const L = (text: string) => ({ text });

// a representative slice of the real document, in document order
const REAL_LINES = [
  "THORNFIELD",
  "Shoot Day # 1 Monday, June 30, 2025",
  "Scene # EXT NEW ENGLAND CEMETERY Day 1 2/8",
  "Scene # EXT NEW ENGLAND CEMETERY Day 3/8",
  "End Day # 1 Monday, June 30, 2025 -- Total Pages: 1 5/8",
  "Shoot Day # 2 - 3 Tue., Jul. 1, 2025 - Wed., Jul. 2, 2025",
  "Scene # 3 EXT POND Day 2/8",
  "End Day # 2 - 3 Tue., Jul. 1, 2025 - Wed., Jul. 2, 2025 -- Total Pages: 3 7/8",
  "Shoot Day # 4 Thursday, July 3, 2025",
  "Scene # EXT POND Day 4/8",
  "Scene # 70pt INT/EXT IAN'S APARTMENT Day 4 2/8",
  "End Day # 4 Thursday, July 3, 2025 -- Total Pages: 4 4/8",
  "Shoot Day # 5 Friday, July 4, 2025",
  "Scene # 102pt EXT POND Day 6/8",
  "Shoot Day # 6 Monday, July 7, 2025",
  "Scene # EXT LOCKLAND MANOR Day 3",
  "Scene # EXT LONDON Day 1/8",
].map(L);

describe("day banners in the original document", () => {
  const idx = dayBannerIndex(REAL_LINES);

  it("anchors each day to its opening banner, never a scene row", () => {
    expect(idx.get(1)!.text).toBe("Shoot Day # 1 Monday, June 30, 2025");
    expect(idx.get(4)!.text).toBe("Shoot Day # 4 Thursday, July 3, 2025");
    expect(idx.get(5)!.text).toBe("Shoot Day # 5 Friday, July 4, 2025");
    expect(idx.get(6)!.text).toBe("Shoot Day # 6 Monday, July 7, 2025");
  });

  it("maps both halves of a combined 'Day # 2 - 3' banner to that banner", () => {
    const banner = "Shoot Day # 2 - 3 Tue., Jul. 1, 2025 - Wed., Jul. 2, 2025";
    expect(idx.get(2)!.text).toBe(banner);
    expect(idx.get(3)!.text).toBe(banner);
  });

  it("never anchors a day to an 'End Day' marker", () => {
    for (const [, ln] of idx) expect(ln.text).not.toMatch(/^end/i);
  });

  it("ignores the page-eighths 'Day n/8' token inside scene rows", () => {
    // these are the exact lines the old matcher wrongly picked
    expect(isDayBanner("Scene # EXT POND Day 4/8")).toBe(false);
    expect(isDayBanner("Scene # 70pt INT/EXT IAN'S APARTMENT Day 4 2/8")).toBe(false);
    expect(isDayBanner("Scene # EXT LOCKLAND MANOR Day 3")).toBe(false);
    expect(isDayBanner("Scene # EXT LONDON Day 1/8")).toBe(false);
    expect(isDayBanner("Scene # 3 EXT POND Day 2/8")).toBe(false);
  });

  it("accepts the other banner styles schedules use", () => {
    expect(isDayBanner("--- DAY #12 - Thursday 8th May 2024 ---", 12)).toBe(true);
    expect(isDayBanner("DAY 7 - Monday 14 July", 7)).toBe(true);
    expect(isDayBanner("Shoot Day # 54 Thursday, September 11, 2025", 54)).toBe(true);
  });

  it("does not read a trailing date as a day range", () => {
    // "#12 - 8th May" must map day 12 only, not days 8..12
    const one = dayBannerIndex([L("--- DAY #12 - 8th May 2024 ---")]);
    expect(one.get(12)).toBeTruthy();
    expect(one.get(8)).toBeUndefined();
  });

  it("checks a specific day number when asked", () => {
    expect(isDayBanner("Shoot Day # 4 Thursday, July 3, 2025", 4)).toBe(true);
    expect(isDayBanner("Shoot Day # 4 Thursday, July 3, 2025", 5)).toBe(false);
    expect(isDayBanner("End Day # 4 Thursday, July 3, 2025", 4)).toBe(false);
  });
});

// A crowd breakdown is a ruled table: its day banner sits in the MIDDLE column
// of the header row, so the banner never starts the line. These lines are real
// text out of a crowd breakdown PDF.
const TABLE_LINES = [
  "Wednesday 9 September 2026 SHOOT DAY 3 HERTFORDSHIRE COUNTRY CLUB (0800-1830)",
  "Sc.47 INT D4 WEDDING HOTEL SPA - POOL AREA 20 Spa Guests",
  "Sc.53 INT D4 WEDDING HOTEL SPA - POOL AREA 3 Bride's Friends (Spa)",
  "23 x SUPPORTING ARTISTS 0 xSPACTs (Special Action Extras) 0 x STUNTS",
  "Thursday 10 September 2026 SHOOT DAY 4 HERTFORDSHIRE COUNTRY CLUB (0800-1830)",
  "Sc.53 INT D4 WEDDING HOTEL SPA - POOL AREA 20 Spa Guests",
  "Sc.45 INT D4 WEDDING HOTEL - SPA SAUNA The Boys are relaxing in the Sauna",
  "Friday 11 September 2026 SHOOT DAY 5 LOCATION TBC (0800 - 1830)",
  "Sc.43 INT D4 JAY'S DAD'S HOSPITAL ROOM - ICU 3 Hospital Nurses",
].map(L);

describe("ruled-table day headers (crowd breakdown)", () => {
  const idx = dayBannerIndex(TABLE_LINES);

  it("finds a banner sitting mid-line in a table header row", () => {
    expect(idx.get(3)!.text).toContain("Wednesday 9 September 2026");
    expect(idx.get(4)!.text).toContain("Thursday 10 September 2026");
    expect(idx.get(5)!.text).toContain("Friday 11 September 2026");
  });

  it("still ignores a scene row's day/night marker", () => {
    expect(isDayBanner("Sc.47 INT D4 WEDDING HOTEL SPA - POOL AREA 20 Spa Guests")).toBe(false);
    expect(isDayBanner("Sc.53 INT D4 WEDDING HOTEL SPA - POOL AREA 3 Bride's Friends (Spa)")).toBe(
      false
    );
  });
});

describe("falling back to the day's date", () => {
  it("matches a header worded differently from the board's date", () => {
    // the board holds "10 Sep 2026"; the document prints the long form
    const line = findDateLine(TABLE_LINES, "10 Sep 2026");
    expect(line!.text).toContain("Thursday 10 September 2026");
  });

  it("does not settle for a neighbouring day", () => {
    const line = findDateLine(TABLE_LINES, "11 Sep 2026");
    expect(line!.text).toContain("Friday 11 September 2026");
  });

  it("prefers the header row over a body row carrying the same date", () => {
    const lines = [
      L("Sc.12 EXT FIELD 10 September 2026 pick-up if weather turns"),
      L("Thursday 10 September 2026 HERTFORDSHIRE COUNTRY CLUB"),
    ];
    expect(findDateLine(lines, "2026-09-10")!.text).toContain("Thursday");
  });

  it("returns nothing when the document never prints that date", () => {
    expect(findDateLine(TABLE_LINES, "25 Dec 2026")).toBeNull();
    expect(findDateLine(TABLE_LINES, "")).toBeNull();
  });

  it("never anchors a day to an 'End Day' line", () => {
    const lines = [
      L("End Day # 4 Thursday, July 3, 2025 -- Total Pages: 4 4/8"),
      L("Shoot Day # 5 Friday, July 4, 2025"),
    ];
    expect(findDateLine(lines, "3 July 2025")).toBeNull();
  });
});
