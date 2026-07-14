// Real-world Full Fat schedules come in several dialects. These synthetic
// snippets (invented content, genuine structure) pin the conventions learned
// from real production PDFs on 2026-07-14:
// · "Victura-style": DAY banner with CALL/WRAP, ALL-CAPS location line,
//   INT/EXT line *before* a "Scene # 7.73A <description>" line, dot-numbered
//   scenes, background as "8 x airmen".
// · "Emb-style": "SHOOT DAY 1: <DATE> | 08:00-17:00 CWD" day lines, scene
//   number first ("310.25 INT ... pgs LOC:"), set name on the next line,
//   "(D)"/"(N)" time-of-day markers, crowd under "SA's" as "NAME [10]".

import { describe, it, expect } from "vitest";
import { parseAny } from "../lib/engine";

const VICTURA_STYLE = `SHOOT SCHED - BLOCK 9 - "EXAMPLE" - SCHEDULE
DAY 1 - CALL 11:30 - 21:30 WRAP -SCWD - SR 05:17 / SS 20:43
TESTFIELD AIRBASE / HANGAR
Blue Screen for VFX sprites
Shoot Day # 1 Wednesday, 13 May 2026
INT Night 7 TESTFIELD - HANGAR EXAMPLETOWN 3/8
Scene # 7.73A A PILOT reads the letter
Cast Members
4. PILOT ONE
Background Actors
8 x airmen
INT Morning TESTFIELD - HANGAR 1/8
Scene # 8.40 The letter arrives
Background Actors
1 x mail clerk
8 x airmen
`;

const EMB_STYLE = `EXAMPLE | SEASON 1 | TEST SHOW
SHOOT DAY 1: MONDAY 23 SEPTEMBER 2024 | 08:00-17:00 CWD
310.25 INT 1/8 pgs LOC:
THE OFFICE - THE HUB
STAGE:X (D)
N3
The office is quiet - THE BOSS walks into The Hub
Cast Members
3. THE BOSS
SA's
HUB WORKERS [10]
310.26 INT THE OFFICE - THE HUB 1 1/8 pgs
STAGE:X (N)
N3
THE BOSS asks a question
Cast Members
3. THE BOSS
SA's
HUB WORKERS [10]
GUARDS [4]
SHOOT DAY 2: TUESDAY 24 SEPTEMBER 2024 | 08:00-17:00
55.10 EXT THE CAR PARK 2/8 pgs
STAGE:Y (D)
D1
A car arrives
SA's
DRIVERS [2]
`;

describe("Victura-style Full Fat", () => {
  const m = parseAny(VICTURA_STYLE);
  it("finds the day with banner hours, type, and ALL-CAPS location", () => {
    expect(m.days.length).toBe(1);
    const d = m.days[0];
    expect(d.num).toBe(1);
    expect(d.date).toContain("13 May 2026");
    expect(d.hours).toBe("11:30–21:30");
    expect(d.type).toBe("SCWD");
    expect(d.loc).toBe("TESTFIELD AIRBASE / HANGAR");
    expect(d.sr).toBe("05:17");
  });
  it("pairs the INT/EXT line with the following Scene # line", () => {
    const [s1, s2] = m.days[0].scenes;
    expect(m.days[0].scenes.length).toBe(2);
    expect(s1.num).toBe("7.73A");
    expect(s1.ie).toBe("INT");
    expect(s1.tod).toBe("Night");
    expect(s1.scriptDay).toBe("7");
    expect(s1.pages).toBe("3/8");
    expect(s1.desc).toBe("A PILOT reads the letter");
    expect(s1.slug).toContain("TESTFIELD - HANGAR");
    expect(s2.num).toBe("8.40");
    expect(s2.tod).toBe("Morning");
  });
  it("reads 'N x name' background with headcounts", () => {
    const [s1, s2] = m.days[0].scenes;
    expect(s1.featured).toEqual([{ name: "airmen", count: 8 }]);
    expect(s2.featured).toEqual([
      { name: "mail clerk", count: 1 },
      { name: "airmen", count: 8 },
    ]);
  });
});

// One-liners: the day board must populate with SCENES even when crowd/stunts
// aren't in the document (they're added by hand afterwards).
const OL_ENDOFDAY = `Cast Members
1. EDDIE
7 07 INT HALSTEAD MANOR - SITTING ROOM 29 1 7/8pgs 5, 6, 7, 13 FE :
Something happens in the sitting room
INT HALSTEAD MANOR - STAIRCASE 29 1/8pgs 5, 6 FE :
A quiet moment on the stairs
End of DAY 1 Wednesday, 10 September 2025 3 5/8pgs
EXT COURTYARD 29 2/8pgs 7 FE :
Cars arrive
End of DAY 2 Thursday, 11 September 2025 2/8pgs
`;

const OL_IE_LEADING = `Shoot Day # 1 Wednesday, 23 March 2022
EXT LONDON STADIUM - PITCH Day 4/29 1/8
Players walk out into the line up. 5, 10, 11, 13, 14
EXT LONDON STADIUM - PITCH Day 4/32 1/8
The teams kick off. 5, 11, 13
End Day # 1 Wednesday, 23 March 2022 -- Total Pages: 1 5/8
`;

describe("One-liner: End-of-DAY delimited (no start header)", () => {
  const m = parseAny(OL_ENDOFDAY);
  it("builds days from End-of-DAY lines and populates their scenes", () => {
    expect(m.days.length).toBe(2);
    expect(m.days[0].num).toBe(1);
    expect(m.days[0].date).toContain("10 September 2025");
    expect(m.days[0].scenes.length).toBe(2);
    expect(m.days[1].scenes.length).toBe(1);
  });
  it("reads scene IE, slug, pages and cast numbers", () => {
    const s = m.days[0].scenes[0];
    expect(s.ie).toBe("INT");
    expect(s.slug).toContain("HALSTEAD MANOR - SITTING ROOM");
    expect(s.pages).toBe("1 7/8");
    expect(s.cast.map((c) => c.code)).toEqual(["5", "6", "7", "13"]);
  });
});

describe("One-liner: IE-leading scenes (cast on the description line)", () => {
  const m = parseAny(OL_IE_LEADING);
  it("captures scenes with no scene number", () => {
    expect(m.days.length).toBe(1);
    expect(m.days[0].scenes.length).toBe(2);
    const s = m.days[0].scenes[0];
    expect(s.ie).toBe("EXT");
    expect(s.slug).toContain("LONDON STADIUM - PITCH");
    expect(s.cast.map((c) => c.code)).toEqual(["5", "10", "11", "13", "14"]);
  });
});

describe("Emb-style Full Fat", () => {
  const m = parseAny(EMB_STYLE);
  it("finds SHOOT DAY lines with date, hours, and type", () => {
    expect(m.days.length).toBe(2);
    expect(m.days[0].num).toBe(1);
    expect(m.days[0].date).toBe("MONDAY 23 SEPTEMBER 2024");
    expect(m.days[0].hours).toBe("08:00–17:00");
    expect(m.days[0].type).toBe("CWD");
    expect(m.days[1].num).toBe(2);
  });
  it("reads number-first scenes, next-line set names, (D)/(N) and N-numbers", () => {
    const [s1, s2] = m.days[0].scenes;
    expect(m.days[0].scenes.length).toBe(2);
    expect(s1.num).toBe("310.25");
    expect(s1.slug).toBe("THE OFFICE - THE HUB");
    expect(s1.tod).toBe("Day");
    expect(s1.scriptDay).toBe("N3");
    expect(s1.pages).toBe("1/8");
    expect(s1.desc).toContain("THE BOSS walks");
    expect(s2.num).toBe("310.26");
    expect(s2.slug).toContain("THE OFFICE - THE HUB");
    expect(s2.tod).toBe("Night");
    expect(s2.pages).toBe("1 1/8");
  });
  it("reads SA's blocks as named crowd with counts", () => {
    const [s1, s2] = m.days[0].scenes;
    expect(s1.featured).toEqual([{ name: "HUB WORKERS", count: 10 }]);
    expect(s2.featured).toEqual([
      { name: "HUB WORKERS", count: 10 },
      { name: "GUARDS", count: 4 },
    ]);
    expect(m.days[1].scenes[0].featured).toEqual([{ name: "DRIVERS", count: 2 }]);
  });
});
