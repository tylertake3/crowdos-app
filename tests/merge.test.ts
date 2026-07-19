import { describe, expect, it } from "vitest";
import { mergeDetail, sceneKey } from "../lib/engine/merge";
import type { Scene, ScheduleModel, ShootDay } from "../lib/engine/types";

// Minimal scene/day builders (raw, pre-prepModel shapes).
const scene = (num: string, over: Partial<Scene> = {}): Scene => ({
  num, part: "", ie: "EXT", slug: "", tod: "DAY", scriptDay: "", pages: "",
  unit: "Main", desc: "", sa: 0, veh: 0, pod: false, podVeh: 0,
  cast: [], extras: [], spacts: [], saChars: [], featured: [], vehNames: [], tags: [],
  ...over,
});
const day = (num: number, date: string, scenes: Scene[]): ShootDay => ({
  num, date, sr: "", ss: "", loc: "", hours: "", type: "", cams: "", scenes, pages: "",
});
const model = (days: ShootDay[], castMap: Record<string, string> = {}): ScheduleModel =>
  ({ days, castMap, notes: [] });

describe("sceneKey", () => {
  it("normalises part/spacing variants to one key", () => {
    expect(sceneKey({ num: "10 pt 1", part: "" })).toBe("10pt1");
    expect(sceneKey({ num: "10", part: "pt 1" })).toBe("10pt1");
    expect(sceneKey({ num: "10 PT.1", part: "" })).toBe("10pt1");
    expect(sceneKey({ num: "12B", part: "" })).toBe("12b");
  });
});

describe("mergeDetail", () => {
  // Spine: one-liner shapes — day dates + bare SA totals (named "SA" bucket).
  const spine = model(
    [
      day(1, "Wednesday 23 April 2025", [
        scene("9", { saChars: [{ name: "SA", count: 35 }], cast: [{ code: "1", type: "cast" }] }),
        scene("10 pt 1", { saChars: [{ name: "SA", count: 58 }] }),
      ]),
      day(2, "Thursday 24 April 2025", [
        scene("8", { saChars: [{ name: "SA", count: 15 }] }),
      ]),
    ],
    { "1": "Maia" },
  );
  // Detail: Full Fat shapes — pseudo-days (one per scene), tiered breakdowns.
  const detail = model(
    [
      day(0, "", [
        scene("9", {
          saChars: [{ name: "Hampstead Pedestrians", count: 15 }, { name: "Flask walk SA's", count: 20 }],
          cast: [{ code: "1", type: "cast" }, { code: "3", type: "cast" }],
          veh: 3,
        }),
      ]),
      day(0, "", [
        scene("10pt1", {
          saChars: [{ name: "Kids running into school", count: 20 }, { name: "Teachers", count: 3 }],
          spacts: [{ name: "School Mums", count: 4 }],
          extras: [{ name: "Stunt cyclist", count: 1 }],
        }),
      ]),
      day(0, "", [scene("99", { saChars: [{ name: "Ghost crowd", count: 10 }] })]),
    ],
    { "3": "Noah" },
  );

  const { model: merged, stats } = mergeDetail(spine, detail);

  it("replaces the spine's bare SA bucket with the detail's tiered breakdown (no double-count)", () => {
    const sc9 = merged.days[0].scenes[0];
    expect(sc9.sa).toBe(0);
    expect(sc9.saChars).toEqual([
      { name: "Hampstead Pedestrians", count: 15 },
      { name: "Flask walk SA's", count: 20 },
    ]); // 35 heads — same people, now named
    const sc10 = merged.days[0].scenes[1];
    expect(sc10.spacts).toEqual([{ name: "School Mums", count: 4 }]);
    expect(sc10.extras).toEqual([{ name: "Stunt cyclist", count: 1 }]);
  });

  it("keeps spine data where no detail matches", () => {
    const sc8 = merged.days[1].scenes[0];
    expect(sc8.saChars).toEqual([{ name: "SA", count: 15 }]);
  });

  it("unions cast and takes the larger vehicle claim", () => {
    const sc9 = merged.days[0].scenes[0];
    expect(sc9.cast.map((c) => c.code)).toEqual(["1", "3"]);
    expect(sc9.veh).toBe(3);
  });

  it("keeps the spine's day structure and merges cast maps (spine wins)", () => {
    expect(merged.days.map((d) => d.date)).toEqual([
      "Wednesday 23 April 2025",
      "Thursday 24 April 2025",
    ]);
    expect(merged.castMap).toEqual({ "1": "Maia", "3": "Noah" });
  });

  it("reports honest stats", () => {
    expect(stats.spineScenes).toBe(3);
    expect(stats.matched).toBe(2);
    expect(stats.bgReplaced).toBe(2);
    expect(stats.saHeads).toBe(58); // 35 + 23
    expect(stats.spactHeads).toBe(4);
    expect(stats.stuntHeads).toBe(1);
    expect(stats.unmatchedSpine).toEqual(["8"]);
    expect(stats.unmatchedDetail).toEqual(["99"]);
  });

  it("combines duplicate detail instances of a scene instead of picking one", () => {
    // A Full Fat block split across a page/chunk: one instance carries cast,
    // the other carries the background — losing either half loses real data.
    const spine2 = model([day(1, "d", [scene("9", { saChars: [{ name: "SA", count: 35 }] })])]);
    const detail2 = model([
      day(0, "", [scene("9", { cast: [{ code: "1", type: "cast" }], veh: 3 })]),
      day(0, "", [scene("9", {
        saChars: [{ name: "Hampstead Pedestrians", count: 15 }, { name: "Flask walk SA's", count: 20 }],
      })]),
    ]);
    const r = mergeDetail(spine2, detail2);
    const sc = r.model.days[0].scenes[0];
    expect(sc.saChars).toEqual([
      { name: "Hampstead Pedestrians", count: 15 },
      { name: "Flask walk SA's", count: 20 },
    ]);
    expect(sc.cast.map((c) => c.code)).toEqual(["1"]);
    expect(sc.veh).toBe(3);
    // same group named in both instances → one group at the larger count
    const detail3 = model([
      day(0, "", [scene("9", { saChars: [{ name: "Marchers", count: 10 }] })]),
      day(0, "", [scene("9", { saChars: [{ name: "marchers", count: 25 }] })]),
    ]);
    const r3 = mergeDetail(spine2, detail3);
    expect(r3.model.days[0].scenes[0].saChars).toEqual([{ name: "Marchers", count: 25 }]);
  });

  it("matches spine parts to an unsplit detail scene as a fallback", () => {
    const spine2 = model([day(1, "d", [scene("12 pt 2", { saChars: [{ name: "SA", count: 5 }] })])]);
    const detail2 = model([day(0, "", [scene("12", { saChars: [{ name: "Marchers", count: 5 }] })])]);
    const r = mergeDetail(spine2, detail2);
    expect(r.model.days[0].scenes[0].saChars).toEqual([{ name: "Marchers", count: 5 }]);
    expect(r.stats.matched).toBe(1);
  });
});
