import { describe, it, expect } from "vitest";
import { normalize } from "../lib/engine/ai-normalize";

// A one-liner schedule that states a single crowd/stunt total for the whole
// shoot day (e.g. a footer "Extras x 48: Stunts x 6") rather than per scene.
// That total must land on EVERY scene in the day, not just one.
describe("day-level crowd/stunt totals spread across every scene", () => {
  const raw = {
    days: [
      {
        num: 1,
        date: "Sunday 13th September 2026",
        loc: "Four Seasons Hotel Morocco",
        type: "Day",
        hours: "",
        // Day-level total — no scene named.
        background: [{ tier: "SA", name: "", count: 48 }],
        stunts: [{ name: "Stunts", count: 6 }],
        scenes: [
          { num: "301/4", ie: "INT/EXT", tod: "DAY", scriptDay: "", pages: "", desc: "welcome", cast: ["1"], vehicles: 0, background: [], stunts: [] },
          { num: "301/5", ie: "INT/EXT", tod: "DAY", scriptDay: "", pages: "", desc: "tour", cast: ["2"], vehicles: 0, background: [], stunts: [] },
          { num: "301/6", ie: "EXT", tod: "DAY", scriptDay: "", pages: "", desc: "convoy", cast: ["1"], vehicles: 0, background: [], stunts: [] },
          { num: "301/20", ie: "EXT", tod: "DAY", scriptDay: "", pages: "", desc: "arrive", cast: ["21"], vehicles: 0, background: [], stunts: [] },
        ],
      },
    ],
    castMap: [],
    questions: [],
  };

  const model = normalize(raw);
  const day = model.days[0];

  it("puts the 48 SA on every scene", () => {
    for (const s of day.scenes) {
      const sa = s.saChars.reduce((n: number, e: any) => n + e.count, 0);
      expect(sa).toBe(48);
    }
  });

  it("puts the 6 stunts on every scene", () => {
    for (const s of day.scenes) {
      const st = s.extras.reduce((n: number, e: any) => n + e.count, 0);
      expect(st).toBe(6);
    }
  });

  it("does NOT override a scene that names its own background", () => {
    const raw2 = JSON.parse(JSON.stringify(raw));
    raw2.days[0].scenes[0].background = [{ tier: "SA", name: "Waiters", count: 10 }];
    const m = normalize(raw2);
    const s0 = m.days[0].scenes[0];
    // Scene keeps only its own 10 Waiters, not the blanket 48.
    expect(s0.saChars.reduce((n: number, e: any) => n + e.count, 0)).toBe(10);
    // Other scenes still get the day total.
    expect(m.days[0].scenes[1].saChars.reduce((n: number, e: any) => n + e.count, 0)).toBe(48);
  });

  it("leaves scenes untouched when there is no day-level total", () => {
    const raw3 = JSON.parse(JSON.stringify(raw));
    raw3.days[0].background = [];
    raw3.days[0].stunts = [];
    const m = normalize(raw3);
    for (const s of m.days[0].scenes) {
      expect(s.saChars.length).toBe(0);
      expect(s.extras.length).toBe(0);
    }
  });
});
