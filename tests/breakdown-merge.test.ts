// A Crowd Breakdown uploaded against a schedule that is already on the board.
//
// Regression origin: sceneKey() joined a scene's number and part with nothing
// between them, so a schedule parser's {num:"87", part:"5/7"} keyed as
// "875/7" while a breakdown's "87pt5/7" keyed as "87pt5/7". Those can never
// meet. On a ruled-table schedule — where roughly half the scenes are parts
// (55pt15/29, 87pt5/7, 2pt3/3) — only 86 of 164 scenes matched and the crowd
// for the other half was silently dropped from the merge.
import { describe, it, expect } from "vitest";
import { mergeDetail, sceneKey } from "../lib/engine/merge";
import type { ScheduleModel, Scene, ShootDay } from "../lib/engine/types";

const scene = (num: string, part = "", extra: Partial<Scene> = {}): Scene => ({
  num, part, ie: "INT", slug: "", tod: "Day", scriptDay: "", pages: "",
  unit: "Main", desc: "", sa: 0, veh: 0, pod: false,
  cast: [], extras: [], spacts: [], saChars: [], featured: [], tags: [],
  ...extra,
});
const day = (num: number, date: string, scenes: Scene[]): ShootDay =>
  ({ num, date, sr: "", ss: "", loc: "", hours: "", type: "", cams: "", pages: "", scenes });
const model = (days: ShootDay[]): ScheduleModel => ({ days, castMap: {}, notes: [] });

// A schedule as the ruled-table parser produces it: the part is its own field,
// and the SA's column has already put a bare crowd total on each scene.
const spine = model([
  day(1, "Monday 7th Sep 2026", [
    scene("43", "", { sa: 3 }),
    scene("87", "5/7", { sa: 32 }),
    scene("55", "15/29", { sa: 0 }),
  ]),
  day(2, "Tuesday 8th Sep 2026", [
    scene("14REH", "", { sa: 0 }),
    scene("2", "pt", { sa: 0 }), //  a bare "pt" with no part number
  ]),
]);

// The breakdown carries the part INSIDE the scene number, and every AD writes
// it differently.
const breakdown = (write: (num: string, part: string) => string): ScheduleModel =>
  model([
    day(1, "", spine.days.flatMap((d) => d.scenes).map((s) =>
      scene(write(s.num, s.part), "", {
        saChars: [{ name: "Wedding guests", count: 20 }],
        spacts: [{ name: "Stand-ins", count: 2 }],
        extras: [{ name: "Stunt drivers", count: 1 }],
      }))),
  ]);

describe("Crowd Breakdown merged onto an uploaded schedule", () => {
  it("keys a part the same whichever document split it", () => {
    expect(sceneKey({ num: "87", part: "5/7" })).toBe("87pt5/7");
    expect(sceneKey({ num: "87pt5/7", part: "" })).toBe("87pt5/7");
    expect(sceneKey({ num: "87 PT 5/7", part: "" })).toBe("87pt5/7");
    expect(sceneKey({ num: "87 Part 5/7", part: "" })).toBe("87pt5/7");
    expect(sceneKey({ num: "55", part: "pt" })).toBe("55pt");
    // untouched: a plain number, a lettered scene, a dotted episode number
    expect(sceneKey({ num: "43", part: "" })).toBe("43");
    expect(sceneKey({ num: "12B", part: "" })).toBe("12b");
    expect(sceneKey({ num: "310.25", part: "" })).toBe("31025");
  });

  it("matches every scene however the breakdown writes the part", () => {
    for (const write of [
      (n: string, p: string) => (p && p !== "pt" ? `${n}pt${p}` : p ? `${n}pt` : n),
      (n: string, p: string) => (p && p !== "pt" ? `${n} PT ${p}` : p ? `${n} pt` : n),
    ]) {
      const r = mergeDetail(spine, breakdown(write));
      expect(r.stats.spineScenes).toBe(5);
      expect(r.stats.matched).toBe(5);
      expect(r.stats.unmatchedSpine).toEqual([]);
    }
  });

  it("replaces the schedule's bare SA total with the breakdown's tiers", () => {
    const r = mergeDetail(spine, breakdown((n, p) => (p && p !== "pt" ? `${n}pt${p}` : p ? `${n}pt` : n)));
    const sc = r.model.days[0].scenes[1]; // 87pt5/7 — schedule said 32 SA
    expect(sc.sa).toBe(0); // the bare bucket is cleared, never added to
    expect(sc.saChars).toEqual([{ name: "Wedding guests", count: 20 }]);
    expect(sc.spacts).toEqual([{ name: "Stand-ins", count: 2 }]);
    expect(sc.extras).toEqual([{ name: "Stunt drivers", count: 1 }]);
    expect(r.stats.bgReplaced).toBe(5);
    expect(r.stats.saHeads).toBe(100);
    expect(r.stats.spactHeads).toBe(10);
  });

  it("keeps the schedule's day structure, dates and order", () => {
    const r = mergeDetail(spine, breakdown((n, p) => (p ? `${n}pt${p === "pt" ? "" : p}` : n)));
    expect(r.model.days.map((d) => d.date)).toEqual([
      "Monday 7th Sep 2026", "Tuesday 8th Sep 2026",
    ]);
    expect(r.model.days.map((d) => d.scenes.length)).toEqual([3, 2]);
  });

  it("still falls back to an unsplit breakdown scene, and says what it missed", () => {
    const partial = model([
      day(1, "", [
        scene("87", "", { saChars: [{ name: "Guests", count: 9 }] }), // covers 87pt5/7
      ]),
    ]);
    const r = mergeDetail(spine, partial);
    expect(r.stats.matched).toBe(1);
    expect(r.model.days[0].scenes[1].saChars).toEqual([{ name: "Guests", count: 9 }]);
    // the schedule's own counts survive on everything the breakdown didn't cover
    expect(r.model.days[0].scenes[0].sa).toBe(3);
    expect(r.stats.unmatchedSpine).toEqual(["43", "5515/29", "14REH", "2pt"]);
  });
});
