// Revision diffing — the behaviours validated against the real Piccadilly S8
// corpus (Shooting 2026-06-18 → Blue 2026-07-03 → Pink 2026-07-15), pinned
// as synthetic cases. See lib/engine/revise.ts for the identity model.

import { describe, it, expect } from "vitest";
import { diffRevisions, carriedDayRecords, prepModel, sceneIndexOf } from "../lib/engine";
import type { Scene, ScheduleModel, ShootDay } from "../lib/engine";

const scene = (num: string, part = ""): Scene => ({
  num, part, ie: "EXT", slug: "", tod: "Day", scriptDay: "", pages: "1",
  unit: "Main", desc: "", sa: 0, veh: 0, pod: false, cast: [], tags: [],
});

const day = (num: number, date: string, sceneNums: string[], loc = "Somewhere"): ShootDay => ({
  num, date, sr: "", ss: "", loc, hours: "", type: "", cams: "",
  scenes: sceneNums.map((n) => scene(n)), pages: "",
});

const model = (days: ShootDay[]): ScheduleModel =>
  prepModel({ days, castMap: {}, notes: [] }, "Main");

describe("diffRevisions — day matching by scene content", () => {
  it("renumbered block: same scenes on new day numbers/dates match at 100% (Blue D37–38 → Pink D38–39)", () => {
    const oldM = model([
      day(37, "Monday 10th August 2026", ["10/43", "10/32", "10/37"]),
      day(38, "Tuesday 11th August 2026", ["10/44", "10/47"]),
    ]);
    const newM = model([
      day(38, "Tuesday 11th August 2026", ["10/43", "10/32", "10/37"]),
      day(39, "Wednesday 12th August 2026", ["10/44", "10/47"]),
    ]);
    const d = diffRevisions(oldM, newM);
    expect(d.matches).toHaveLength(2);
    expect(d.matches.every((m) => m.overlap === 1 && m.renumbered)).toBe(true);
    expect(d.dayMap.get("M37")!.num).toBe(38);
    expect(d.dayMap.get("M38")!.num).toBe(39);
    expect(d.cutDays).toHaveLength(0);
    expect(d.shotDays).toHaveLength(0);
  });

  it("swapped days: two days trade contents and each follows its scenes (Stokenchurch D52↔D53)", () => {
    const oldM = model([
      day(52, "Friday 11th September 2026", ["8/27", "8/18"]),
      day(53, "Monday 14th September 2026", ["8/48", "8/50"]),
    ]);
    const newM = model([
      day(52, "Friday 11th September 2026", ["8/48", "8/50"]),
      day(53, "Monday 14th September 2026", ["8/27", "8/18"]),
    ]);
    const d = diffRevisions(oldM, newM);
    expect(d.dayMap.get("M52")!.num).toBe(53); // followed its scenes, not its number
    expect(d.dayMap.get("M53")!.num).toBe(52);
  });

  it("matching is one-to-one — a new day can't be claimed by two old days", () => {
    const oldM = model([
      day(1, "Monday 1st June 2026", ["1/1", "1/2"]),
      day(2, "Tuesday 2nd June 2026", ["1/1", "1/2", "1/3"]), // overlaps same new day
    ]);
    const newM = model([day(1, "Monday 1st June 2026", ["1/1", "1/2", "1/3"])]);
    const d = diffRevisions(oldM, newM);
    const matched = d.matches.map((m) => m.oldDay.num);
    expect(matched).toEqual([2]); // best overlap wins the single new day
  });
});

describe("diffRevisions — shot history vs real cuts", () => {
  const oldM = () =>
    model([
      day(12, "Monday 6th July 2026", ["12/15", "10/04"], "Barbican"), //   before Pink starts — shot
      day(20, "Thursday 16th July 2026", ["10/09"], "Canary Wharf"), //     in the new window
      day(30, "Thursday 30th July 2026", ["5/55"], "Somewhere"), //         future day vanished — cut
    ]);
  const newM = () =>
    model([
      day(20, "Thursday 16th July 2026", ["10/09", "11/24a"], "Canary Wharf"),
      day(21, "Friday 17th July 2026", ["7/48"], "Silvertown"),
    ]);

  it("a vanished day before the new schedule's start is shot history, not a deletion", () => {
    const d = diffRevisions(oldM(), newM());
    expect(d.shotDays.map((x) => x.num)).toEqual([12]);
    expect(d.cutDays.map((x) => x.num)).toEqual([30]);
    expect(d.scenes.shot.map((s) => s.key).sort()).toEqual(["10/04", "12/15"]);
    expect(d.scenes.cut.map((s) => s.key)).toEqual(["5/55"]);
  });

  it("scene adds and moves are tracked with their days", () => {
    const d = diffRevisions(oldM(), newM());
    expect(d.scenes.added.map((s) => s.key).sort()).toEqual(["11/24a", "7/48"]);
    expect(d.scenes.same).toBe(1); // 10/09 stayed on 16 July
    expect(d.scenes.moved).toHaveLength(0);
  });

  it("carriedDayRecords clones shot days flagged carried, with the source revision label", () => {
    const d = diffRevisions(oldM(), newM());
    const recs = carriedDayRecords(d, "Blue");
    expect(recs).toHaveLength(1);
    expect(recs[0].num).toBe(12);
    expect(recs[0].carried).toBe(true);
    expect(recs[0].fromRev).toBe("Blue");
    expect(recs[0].scenes.map((s: Scene) => s.num)).toEqual(["12/15", "10/04"]);
    expect("_date" in recs[0]).toBe(false); // JSON-safe for aiModel storage
  });

  it("a past day whose scenes reappear later was REPLANNED, not shot — never stitched twice", () => {
    // real corpus: Blue's D18 Woolwich (14 July) vanished from Pink (issued
    // 15 July) but its scenes shoot on Pink's D24 (23 July) — the day was
    // replanned, and stitching it would double the scenes on the board
    const o = model([
      day(18, "Tuesday 14th July 2026", ["9/34", "9/37", "9/39", "9/14", "9/15"], "Woolwich North"),
      day(24, "Thursday 23rd July 2026", ["12/60", "12/61", "12/62", "12/63"], "Woolwich"),
    ]);
    const n = model([
      day(24, "Thursday 23rd July 2026", ["9/34", "9/37", "9/39", "12/60", "12/61", "12/62", "12/63"], "Woolwich"),
    ]);
    const d = diffRevisions(o, n);
    expect(d.dayMap.get("M24")!.num).toBe(24); // old D24's 4/7 beats old D18's 3/9 — one-to-one greedy
    expect(d.supersededDays.map((x) => x.num)).toEqual([18]); // 3 of 5 scenes reappear → replanned
    expect(d.shotDays).toHaveLength(0); // NOT stitched — no duplicate scenes
    expect(carriedDayRecords(d, "Blue")).toHaveLength(0);
    // the two scenes that never reappear are genuine cuts, not "shot"
    expect(d.scenes.cut.map((s) => s.key).sort()).toEqual(["9/14", "9/15"]);
    expect(d.scenes.shot).toHaveLength(0);
  });

  it("a shot day whose number is reused by the new revision is a collision, not carried", () => {
    const o = model([day(1, "Monday 1st June 2026", ["1/1"])]);
    const n = model([day(1, "Monday 6th July 2026", ["9/9"])]); // renumbered from 1
    const d = diffRevisions(o, n);
    expect(d.shotDays).toHaveLength(0);
    expect(d.collisions.map((x) => x.num)).toEqual([1]);
  });
});

describe("diffRevisions — scene moves across days (work follows the scene)", () => {
  it("a split day: moved scenes report old→new day; the day still matches its larger remnant", () => {
    // Woolwich North's day split — 3 scenes went to a new 23 July day
    const oldM = model([
      day(18, "Tuesday 14th July 2026", ["9/34", "9/37", "9/39", "9/14", "9/15"], "Woolwich North"),
    ]);
    const newM = model([
      day(18, "Tuesday 14th July 2026", ["9/14", "9/15"], "Woolwich North"),
      day(24, "Thursday 23rd July 2026", ["9/34", "9/37", "9/39"], "Woolwich"),
    ]);
    const d = diffRevisions(oldM, newM);
    expect(d.dayMap.get("M18")!.num).toBe(24); // 3/5 beats 2/5 — best-overlap remnant
    // moved = the scene's calendar date changed; the ones staying on 14 July are "same"
    const movedKeys = d.scenes.moved.map((m) => m.key).sort();
    expect(movedKeys).toEqual(["9/34", "9/37", "9/39"]);
    expect(d.scenes.moved.every((m) => m.newDay.num === 24)).toBe(true);
    expect(d.scenes.same).toBe(2);
  });

  it("sceneIndexOf gives each scene's new day and position for key rewriting", () => {
    const m = model([day(24, "Thursday 23rd July 2026", ["9/34", "9/37"], "Woolwich")]);
    const idx = sceneIndexOf(m);
    expect(idx.get("9/34")!.day.num).toBe(24);
    expect(idx.get("9/34")!.idx).toBe(0);
    expect(idx.get("9/37")!.idx).toBe(1);
  });
});
