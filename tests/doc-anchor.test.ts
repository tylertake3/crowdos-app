// Regression tests for "click a day, highlight it in the original".
//
// Every line below is real text extracted from PM2 FullFat Shooting Schedule
// (27.06.25).pdf. The bug these guard against: the first implementation
// matched "day <n>" anywhere in a line, so clicking D4 highlighted
// "Scene # EXT POND Day 4/8" (page eighths) instead of "Shoot Day # 4".

import { describe, it, expect } from "vitest";
import { dayBannerIndex, isDayBanner } from "../lib/engine/doc-anchor";

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
