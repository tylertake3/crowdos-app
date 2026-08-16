// Parser defects that cost the user real money or real time, pinned so they
// cannot come back. Each block names the failure it guards against.

import { describe, it, expect } from "vitest";
import { parseAny, parseSchedule, parseExpanded, castTailAt, isPageMarker } from "../lib/engine";
import type { Scene } from "../lib/engine";

// ---------------------------------------------------------------------------
// C3 — catastrophic regex backtracking during import.
//
// The old trailing-cast pattern could partition a run of N digits 2^(N−1)
// ways. 26 digits took 3.5 seconds; 36 took hours. This runs in the user's
// BROWSER while they import a schedule, so it is not a slow test — it is a
// hung tab and a lost upload.
// ---------------------------------------------------------------------------
describe("cast-tail scanning is linear, not exponential", () => {
  it("a 40-digit run finishes in well under 100ms", () => {
    const line = "THE CROWD SURGES FORWARD " + "1".repeat(40) + "x";
    const t0 = performance.now();
    castTailAt(line);
    expect(performance.now() - t0).toBeLessThan(100);
  });

  it("60 digits with no valid tail is still instant", () => {
    const t0 = performance.now();
    for (let n = 20; n <= 60; n += 10) castTailAt("A DESCRIPTION " + "9".repeat(n) + "!");
    expect(performance.now() - t0).toBeLessThan(100);
  });

  it("a whole schedule whose descriptions carry long digit runs parses instantly", () => {
    const text = [
      "--- Day 1 - Monday 6th July 2026 --- SR 05:00 / SS 21:00",
      "-- BARBICAN -- 0700 - 1900",
      "1/1 EXT SOME PLACE Day 1 1/8 pgs. 5, 6,",
      "THE CODE READS " + "7".repeat(48) + " AND NOTHING HAPPENS",
      "--- End of Day 1 --- Monday 6th July 2026 --- 1 1/8 Pages",
    ].join("\n");
    const t0 = performance.now();
    const m = parseSchedule(text);
    expect(performance.now() - t0).toBeLessThan(200);
    expect(m.days).toHaveLength(1);
  });

  it("still finds the trailing cast list it is there to find", () => {
    expect(castTailAt("THE PILOT READS THE LETTER 5, 6, 7")).toMatchObject({ text: " 5, 6, 7" });
    expect(castTailAt("NO CAST HERE")).toBeNull();
  });

  it("wrapped cast numbers are still lifted off the description line", () => {
    const text = [
      "--- Day 1 - Monday 6th July 2026 --- SR 05:00 / SS 21:00",
      "-- BARBICAN -- 0700 - 1900",
      "1/1 EXT SOME PLACE Day 1 1/8 pgs. 5, 6,",
      "THE PILOT READS THE LETTER 7, 13",
      "--- End of Day 1 --- Monday 6th July 2026 --- 1 1/8 Pages",
    ].join("\n");
    const sc = parseSchedule(text).days[0].scenes[0];
    expect(sc.cast.map((c) => c.code)).toEqual(["5", "6", "7", "13"]);
    expect(sc.desc).toBe("THE PILOT READS THE LETTER");
  });
});

// ---------------------------------------------------------------------------
// C4 — page furniture becoming a cast member.
//
// A bare "2" at the foot of a page reads as a perfectly good cast code, so it
// became a phantom performer on whichever scene was open and rode into the
// DOOD and the cast costing.
// ---------------------------------------------------------------------------
describe("page numbers are not cast members", () => {
  const withFooter = (footer: string) =>
    parseSchedule(
      [
        "--- Day 1 - Monday 6th July 2026 --- SR 05:00 / SS 21:00",
        "-- BARBICAN -- 0700 - 1900",
        "1/1 EXT SOME PLACE Day 1 1/8 pgs. 5, 6",
        "THE PILOT READS THE LETTER",
        footer,
        "--- End of Day 1 --- Monday 6th July 2026 --- 1 1/8 Pages",
      ].join("\n")
    ).days[0].scenes[0];

  it("a bare page number never joins the cast", () => {
    expect(withFooter("2").cast.map((c) => c.code)).toEqual(["5", "6"]);
    expect(withFooter("14").cast.map((c) => c.code)).toEqual(["5", "6"]);
  });

  it("neither does a labelled or 'n of m' footer", () => {
    for (const f of ["Page 2", "Page # 2", "- 2 -", "2 of 40"]) {
      expect(withFooter(f).cast.map((c) => c.code), f).toEqual(["5", "6"]);
    }
  });

  it("a genuine wrapped cast list on its own line still counts", () => {
    expect(withFooter("7, 13, 21").cast.map((c) => c.code)).toEqual(["5", "6", "7", "13", "21"]);
  });

  it("isPageMarker knows furniture from content", () => {
    expect(isPageMarker("2")).toBe(true);
    expect(isPageMarker("Page 3 of 40")).toBe(true);
    expect(isPageMarker("5, 6")).toBe(false);
    expect(isPageMarker("HUB WORKERS")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// C5 — silently dropped crowd and stunt lines.
//
// The bare-name filter demanded a LOWERCASE letter and a length of 40, so
// "HUB WORKERS" and any longer description vanished from the breakdown along
// with the heads (and money) they represented. Scene.unparsed existed for
// exactly this and was never populated.
// ---------------------------------------------------------------------------
const fullFat = (block: string, lines: string[]) =>
  parseExpanded(
    [
      "Shoot Day # 1 Monday, 6 July 2026",
      "310.25 INT THE OFFICE - THE HUB 1/8 pgs",
      "The office is quiet",
      block,
      ...lines,
    ].join("\n")
  ).days[0].scenes[0];

describe("crowd and stunt lines are never silently dropped", () => {
  it("an ALL-CAPS group name is a real group, not junk", () => {
    const sc = fullFat("SA's", ["HUB WORKERS", "OFFICE STAFF"]);
    expect(sc.saChars).toEqual([
      { name: "HUB WORKERS", count: 1 },
      { name: "OFFICE STAFF", count: 1 },
    ]);
  });

  it("a long description is kept rather than thrown away at 40 characters", () => {
    const long = "COMMUTERS IN HEAVY WINTER COATS WITH UMBRELLAS AND BAGS";
    expect(long.length).toBeGreaterThan(40);
    expect(fullFat("SA's", [long]).saChars).toEqual([{ name: long, count: 1 }]);
  });

  it("anything the parser still won't take is recorded, not lost", () => {
    const sc = fullFat("SA's", ["??? !!! ???"]);
    expect(sc.saChars).toEqual([]);
    expect(sc.unparsed).toEqual(["??? !!! ???"]);
  });

  it("page furniture inside a crowd block is not a group and not an unparsed mystery", () => {
    const sc = fullFat("SA's", ["HUB WORKERS", "2"]);
    expect(sc.saChars).toEqual([{ name: "HUB WORKERS", count: 1 }]);
    expect(sc.unparsed).toEqual(["2"]);
  });

  it("counted forms keep working exactly as before", () => {
    expect(fullFat("SA's", ["HUB AGENTS [10]"]).saChars).toEqual([{ name: "HUB AGENTS", count: 10 }]);
    expect(fullFat("Background Actors", ["8 x airmen"]).saChars).toEqual([{ name: "airmen", count: 8 }]);
    expect(fullFat("Background Actors", ["160 x c"]).sa).toBe(160);
  });

  it("an ALL-CAPS stunt line and a long one both survive", () => {
    const sc = fullFat("Stunts", [
      "STUNT DRIVERS",
      "STUNT PERFORMERS DOUBLING THE PRINCIPAL CAST THROUGH THE ALLEYWAY CHASE",
    ]);
    expect(sc.extras!.map((x) => x.name)).toEqual([
      "STUNT DRIVERS",
      "STUNT PERFORMERS DOUBLING THE PRINCIPAL CAST THROUGH THE ALLEYWAY CHASE",
    ]);
  });
});

// ---------------------------------------------------------------------------
// C6 — set names eaten by the page-count and script-day readers.
// ---------------------------------------------------------------------------
describe("a set name ending in a digit is not a page count", () => {
  const sceneOf = (line: string): Scene =>
    parseExpanded(["Shoot Day # 1 Monday, 6 July 2026", line].join("\n")).days[0].scenes[0];

  it("'THE HOUSE - BEDROOM 2' keeps the bedroom and claims no pages", () => {
    const sc = sceneOf("310.25 INT THE HOUSE - BEDROOM 2");
    expect(sc.slug).toBe("THE HOUSE - BEDROOM 2");
    expect(sc.pages).toBe(""); // used to be "2", inflating the day's page total
  });

  it("a real page count is still read, with or without 'pgs'", () => {
    expect(sceneOf("310.25 INT THE HOUSE - BEDROOM 2 3/8 pgs").pages).toBe("2 3/8");
    expect(sceneOf("310.26 INT THE PARK - THE HUB 1 1/8 pgs").pages).toBe("1 1/8");
    expect(sceneOf("310.27 INT THE PARK 2/8").pages).toBe("2/8");
    expect(sceneOf("310.27 INT THE PARK 2/8").slug).toBe("THE PARK");
  });
});

describe("a house number is not a script day", () => {
  const victura = (ieLine: string) =>
    parseExpanded(
      [
        "Shoot Day # 1 Monday, 6 July 2026",
        ieLine,
        "Scene # 7.73A THE MINISTER ARRIVES",
      ].join("\n")
    ).days[0].scenes[0];

  it("'10 DOWNING STREET' stays whole", () => {
    const sc = victura("INT Day 10 DOWNING STREET");
    expect(sc.slug).toBe("10 DOWNING STREET");
    expect(sc.scriptDay).toBe(""); // used to be "10", with the address truncated
  });

  it("other addresses are equally safe", () => {
    expect(victura("EXT Day 221B BAKER ST").slug).toBe("221B BAKER ST");
    expect(victura("EXT Day 45 CHURCH LANE").slug).toBe("45 CHURCH LANE");
  });

  it("a genuine leading script day is still read", () => {
    const sc = victura("INT Night 7 TESTFIELD - HANGAR");
    expect(sc.scriptDay).toBe("7");
    expect(sc.slug).toBe("TESTFIELD - HANGAR");
  });
});

describe("parseAny still routes each format to its parser", () => {
  it("does not regress the one-liner / full-fat choice", () => {
    expect(parseAny("Shoot Day # 1 Monday, 6 July 2026").days).toHaveLength(1);
    expect(
      parseAny("--- Day 1 - Monday 6th July 2026 --- SR 05:00 / SS 21:00").days
    ).toHaveLength(1);
  });
});
