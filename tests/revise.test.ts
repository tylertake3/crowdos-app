// Revision diffing — the behaviours validated against the real Piccadilly S8
// corpus (Shooting 2026-06-18 → Blue 2026-07-03 → Pink 2026-07-15), pinned
// as synthetic cases. See lib/engine/revise.ts for the identity model.

import { describe, it, expect } from "vitest";
import {
  diffRevisions, carriedDayRecords, carryCastMap, prepModel, sceneIndexOf,
  sceneIndexAllOf, describeRevision, revisionChangeLines, baseSceneKey, dayUid,
} from "../lib/engine";
import type { CastToken, Scene, ScheduleModel, ShootDay } from "../lib/engine";

const scene = (num: string, part = ""): Scene => ({
  num, part, ie: "EXT", slug: "", tod: "Day", scriptDay: "", pages: "1",
  unit: "Main", desc: "", sa: 0, veh: 0, pod: false, cast: [], tags: [],
});

// a scene with content, for the per-scene content diff
const cast = (...codes: string[]): CastToken[] => codes.map((code) => ({ code, type: "cast" }));
const richScene = (num: string, over: Partial<Scene> = {}): Scene => ({ ...scene(num), ...over });

const day = (num: number, date: string, sceneNums: string[], loc = "Somewhere"): ShootDay => ({
  num, date, sr: "", ss: "", loc, hours: "", type: "", cams: "",
  scenes: sceneNums.map((n) => scene(n)), pages: "",
});

// a day built from whole Scene objects rather than bare numbers
const dayOf = (num: number, date: string, scenes: Scene[], over: Partial<ShootDay> = {}): ShootDay => ({
  num, date, sr: "", ss: "", loc: "Somewhere", hours: "", type: "", cams: "",
  scenes, pages: "", ...over,
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

describe("carryCastMap — cast numbers are a permanent production label", () => {
  // The real FALCON case: issue 1 (28 Jul) prints the numbered cast list,
  // issue 2 (13 Aug) drops it but its scenes still reference the same numbers.
  const falconCast = {
    "1": "EDDIE", "2": "SUSIE GLASS", "9": "TONY BANKS", "10": "JACK GLASS",
    "21": "AISHA", "24": "BLANKET",
  };

  it("a new schedule with NO cast list keeps every name from the prior revision", () => {
    const carried = carryCastMap(falconCast, {}); // issue 2 has an empty castMap
    expect(carried).toEqual(falconCast);
    expect(carried["9"]).toBe("TONY BANKS"); // "9" still reads as Tony Banks
  });

  it("the new document's own names win where it gives them (recast / correction)", () => {
    const carried = carryCastMap(falconCast, { "10": "JACK (RECAST)", "50": "NEW ROLE" });
    expect(carried["10"]).toBe("JACK (RECAST)"); // new doc overrides
    expect(carried["50"]).toBe("NEW ROLE"); //     new code added
    expect(carried["1"]).toBe("EDDIE"); //         untouched old name preserved
  });

  it("a blank / whitespace name in the new document never erases a known name", () => {
    const carried = carryCastMap(falconCast, { "9": "", "1": "   " });
    expect(carried["9"]).toBe("TONY BANKS");
    expect(carried["1"]).toBe("EDDIE");
  });

  it("handles missing maps without throwing (first ever upload, null prev)", () => {
    expect(carryCastMap(null, { "1": "EDDIE" })).toEqual({ "1": "EDDIE" });
    expect(carryCastMap({ "1": "EDDIE" }, null)).toEqual({ "1": "EDDIE" });
    expect(carryCastMap(undefined, undefined)).toEqual({});
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

// ===========================================================================
// A1 — day identity. `d.id` is only unit + day number, so two day RECORDS can
// share it. Matching and dayMap used to key on it, which meant one day blocked
// the other from matching and dayMap silently overwrote one with the other.
// ===========================================================================
describe("diffRevisions — two days sharing a number are two different days", () => {
  const oldM = () =>
    model([
      day(5, "Monday 6th July 2026", ["1/1", "1/2"], "Barbican"),
      // a second record numbered 5 — a stitched carry-over, a split day, or a
      // thin parse. Real corpora produce these constantly.
      day(5, "Tuesday 7th July 2026", ["2/1", "2/2"], "Soho"),
    ]);
  const newM = () =>
    model([
      day(5, "Monday 6th July 2026", ["1/1", "1/2"], "Barbican"),
      day(6, "Tuesday 7th July 2026", ["2/1", "2/2"], "Soho"),
    ]);

  it("matches BOTH days — neither blocks the other", () => {
    const d = diffRevisions(oldM(), newM());
    expect(d.matches).toHaveLength(2);
    expect(d.cutDays).toHaveLength(0);
    expect(d.addedDays).toHaveLength(0);
  });

  it("dayMapByUid keeps both pairings; the legacy dayMap can only hold one", () => {
    const o = oldM();
    const d = diffRevisions(o, newM());
    const [a, b] = o.days;
    expect(d.dayMapByUid.get(dayUid(a))!.num).toBe(5);
    expect(d.dayMapByUid.get(dayUid(b))!.num).toBe(6); // used to be lost entirely
    expect(dayUid(a)).not.toBe(dayUid(b));
    expect(d.dayMap.size).toBe(1); // both share id "M5" — the reason uids exist
  });

  it("each match reports the identity of the day on each side", () => {
    const d = diffRevisions(oldM(), newM());
    expect(new Set(d.matches.map((m) => m.oldUid)).size).toBe(2);
    expect(new Set(d.matches.map((m) => m.newUid)).size).toBe(2);
  });
});

// ===========================================================================
// A2 — days with no parsed scenes. Travel days, holidays, unit moves and thin
// parses have nothing to overlap on, so they were reported as cut AND added on
// EVERY revision, stranding all their day-level work every single time.
// ===========================================================================
describe("diffRevisions — days with no scenes still match", () => {
  it("matches a scene-less day on its date", () => {
    const oldM = model([
      day(10, "Monday 6th July 2026", [], "Travel to Glasgow"),
      day(11, "Tuesday 7th July 2026", ["1/1"]),
    ]);
    const newM = model([
      day(10, "Monday 6th July 2026", [], "Travel to Glasgow"),
      day(11, "Tuesday 7th July 2026", ["1/1"]),
    ]);
    const d = diffRevisions(oldM, newM);
    expect(d.cutDays).toHaveLength(0);
    expect(d.addedDays).toHaveLength(0);
    const travel = d.matches.find((m) => m.oldDay.num === 10)!;
    expect(travel.matchedBy).toBe("date");
  });

  it("falls back to the day number when the date moved", () => {
    const oldM = model([day(10, "Monday 6th July 2026", [], "Rest day")]);
    const newM = model([day(10, "Tuesday 7th July 2026", [], "Rest day")]);
    const d = diffRevisions(oldM, newM);
    expect(d.matches).toHaveLength(1);
    expect(d.matches[0].matchedBy).toBe("number");
    expect(d.matches[0].daysShifted).toBe(1);
  });

  it("falls back to the location when both the date and the number moved", () => {
    const oldM = model([day(10, "Monday 6th July 2026", [], "Pinewood Stage 5")]);
    const newM = model([day(12, "Thursday 9th July 2026", [], "Pinewood Stage 5")]);
    const d = diffRevisions(oldM, newM);
    expect(d.matches).toHaveLength(1);
    expect(d.matches[0].matchedBy).toBe("location");
    expect(d.matches[0].renumbered).toBe(true);
  });

  it("a genuinely dropped scene-less day is still reported as cut", () => {
    const oldM = model([
      day(11, "Tuesday 7th July 2026", ["1/1"]),
      day(12, "Wednesday 8th July 2026", [], "Travel"), // ahead of the new start
    ]);
    const newM = model([day(11, "Tuesday 7th July 2026", ["1/1"])]);
    const d = diffRevisions(oldM, newM);
    expect(d.cutDays.map((x) => x.num)).toEqual([12]);
  });

  it("a day with scenes is never fallback-matched to an unrelated day", () => {
    // same date, completely different scenes: a real re-plan, not the same day
    const oldM = model([day(1, "Monday 6th July 2026", ["1/1", "1/2"], "A")]);
    const newM = model([day(1, "Monday 6th July 2026", ["9/1", "9/2"], "A")]);
    const d = diffRevisions(oldM, newM);
    expect(d.matches).toHaveLength(0);
    expect(d.cutDays.map((x) => x.num)).toEqual([1]);
  });
});

// ===========================================================================
// A3 — a scene scheduled on two days. sceneIndexOf kept only the first, so one
// day's worth of edits on that scene vanished without a word.
// ===========================================================================
describe("diffRevisions — a scene scheduled on more than one day", () => {
  const m = () =>
    model([
      day(1, "Monday 6th July 2026", ["7/12", "7/13"]),
      day(2, "Tuesday 7th July 2026", ["7/12", "7/20"]), // 7/12 again
    ]);

  it("sceneIndexAllOf returns every occurrence", () => {
    const idx = sceneIndexAllOf(m());
    expect(idx.get("7/12")!.map((o) => o.day.num)).toEqual([1, 2]);
    expect(idx.get("7/13")).toHaveLength(1);
  });

  it("sceneIndexOf still anchors on the first occurrence (unchanged behaviour)", () => {
    expect(sceneIndexOf(m()).get("7/12")!.day.num).toBe(1);
  });

  it("the diff REPORTS the extra occurrences instead of dropping them", () => {
    const d = diffRevisions(m(), m());
    const dup = d.duplicateScenes.filter((x) => x.side === "new");
    expect(dup.map((x) => x.key)).toEqual(["7/12"]);
    expect(dup[0].days.map((x) => x.num)).toEqual([1, 2]);
    expect(revisionChangeLines(d).join("\n")).toContain("Scene 7/12 appears on 2 days");
  });
});

// ===========================================================================
// A4 — a scene that moved to a different day NUMBER on the same DATE. Its
// carry target changed, so calling it "unchanged" sends the work to the wrong
// day. This happens whenever a date carries two units or a day is split.
// ===========================================================================
describe("diffRevisions — same date, different day number is a MOVE", () => {
  it("classifies it as moved, not same", () => {
    const oldM = model([day(18, "Tuesday 14th July 2026", ["9/34"], "Woolwich")]);
    const newM = model([day(19, "Tuesday 14th July 2026", ["9/34"], "Woolwich")]);
    const d = diffRevisions(oldM, newM);
    expect(d.scenes.same).toBe(0);
    expect(d.scenes.moved.map((x) => x.key)).toEqual(["9/34"]);
    expect(d.scenes.moved[0].newDay.num).toBe(19);
    expect(d.sceneChanges[0].moved).toBe(true);
  });

  it("a scene that keeps both its date and its day number is still 'same'", () => {
    const oldM = model([day(18, "Tuesday 14th July 2026", ["9/34"], "Woolwich")]);
    const newM = model([day(18, "Tuesday 14th July 2026", ["9/34"], "Woolwich")]);
    expect(diffRevisions(oldM, newM).scenes.same).toBe(1);
  });
});

// ===========================================================================
// A5 — renumbered scenes. Pink pages turn 45 into 45A; treating that as a cut
// plus an add strands every edit on the scene.
// ===========================================================================
describe("diffRevisions — renumbered scenes follow their base number", () => {
  it("pairs 45 with 45A rather than cutting and re-adding", () => {
    const oldM = model([day(1, "Monday 6th July 2026", ["45", "46"])]);
    const newM = model([day(1, "Monday 6th July 2026", ["45A", "46"])]);
    const d = diffRevisions(oldM, newM);
    expect(d.scenes.renumbered).toHaveLength(1);
    expect(d.scenes.renumbered[0]).toMatchObject({ oldKey: "45", newKey: "45a" });
    expect(d.scenes.cut).toHaveLength(0);
    expect(d.scenes.added).toHaveLength(0);
    // scene-keyed work knows where to go
    expect(d.sceneKeyMap.get("45")).toBe("45a");
    expect(d.sceneKeyMap.get("46")).toBe("46");
  });

  it("never guesses when the base number is ambiguous", () => {
    // two candidates on the new side — resolving this wrongly would move a
    // whole scene's crowd onto someone else's day
    const oldM = model([day(1, "Monday 6th July 2026", ["45"])]);
    const newM = model([day(1, "Monday 6th July 2026", ["45A", "45B"])]);
    const d = diffRevisions(oldM, newM);
    expect(d.scenes.renumbered).toHaveLength(0);
    expect(d.scenes.cut.map((x) => x.key)).toEqual(["45"]);
    expect(d.scenes.added.map((x) => x.key).sort()).toEqual(["45a", "45b"]);
  });

  it("baseSceneKey strips part and letter suffixes the same way merge.ts does", () => {
    expect(baseSceneKey("45a")).toBe("45");
    expect(baseSceneKey("10pt1")).toBe("10");
    expect(baseSceneKey("10/43")).toBe("10/43");
  });

  it("a renumbered scene is reported in plain English", () => {
    const oldM = model([day(1, "Monday 6th July 2026", ["45"])]);
    const newM = model([day(1, "Monday 6th July 2026", ["45A"])]);
    expect(revisionChangeLines(diffRevisions(oldM, newM)).join("\n")).toContain(
      "Scene 45 is now scene 45a."
    );
  });
});

// ===========================================================================
// A6 — a shot day whose number the new schedule reuses. It used to be dropped
// outright: the production lost a real day off its timeline and its spend.
// ===========================================================================
describe("diffRevisions — a colliding shot day is kept, not lost", () => {
  const diff = () => {
    const o = model([day(1, "Monday 1st June 2026", ["1/1"], "Barbican")]);
    const n = model([day(1, "Monday 6th July 2026", ["9/9"])]);
    return diffRevisions(o, n);
  };

  it("still reports the collision", () => {
    expect(diff().collisions.map((x) => x.num)).toEqual([1]);
  });

  it("carries it under a suffixed id so it cannot clash with the live day", () => {
    const recs = carriedDayRecords(diff(), "Blue");
    expect(recs).toHaveLength(1);
    expect(recs[0].id).toBe("M1-Blue");
    expect(recs[0].collided).toBe(true);
    expect(recs[0].carried).toBe(true);
    expect(recs[0].fromRev).toBe("Blue");
    expect(recs[0].scenes.map((s: Scene) => s.num)).toEqual(["1/1"]);
  });

  it("its scenes count as shot history, not as cuts", () => {
    const d = diff();
    expect(d.scenes.shot.map((s) => s.key)).toEqual(["1/1"]);
    expect(d.scenes.cut).toHaveLength(0);
  });

  it("says so in plain English", () => {
    expect(revisionChangeLines(diff()).join("\n")).toContain("reuses day number 1");
  });
});

// ===========================================================================
// A7 — what actually changed. Day-level deltas, and the per-scene content diff
// without which a scene going 20 supporting artists → 200 reads "unchanged".
// ===========================================================================
describe("DayMatch — the day-level deltas an AD needs to see", () => {
  const d = () =>
    diffRevisions(
      model([
        dayOf(7, "Monday 6th July 2026", [scene("1/1"), scene("1/2")], {
          loc: "Barbican", type: "CWD", hours: "0700–1900",
        }),
      ]),
      model([
        dayOf(8, "Thursday 9th July 2026", [scene("1/1"), scene("1/3")], {
          loc: "Silvertown", type: "CWN", hours: "1600–0400",
        }),
      ])
    ).matches[0];

  it("reports the shift in whole days, signed", () => {
    expect(d().daysShifted).toBe(3);
  });

  it("reports a location change with both sides", () => {
    expect(d().locChanged).toEqual({ before: "Barbican", after: "Silvertown" });
  });

  it("reports a day-type change (CWD ↔ CWN, weather cover)", () => {
    expect(d().typeChanged).toEqual({ before: "CWD", after: "CWN" });
  });

  it("reports an hours change", () => {
    expect(d().hoursChanged).toEqual({ before: "0700–1900", after: "1600–0400" });
  });

  it("reports the scenes gained and lost", () => {
    expect(d().scenesGained).toEqual(["1/3"]);
    expect(d().scenesLost).toEqual(["1/2"]);
  });

  it("daysShifted is null when a date can't be read, not a wrong number", () => {
    const m = diffRevisions(
      model([day(1, "TBC", ["1/1"])]),
      model([day(1, "Monday 6th July 2026", ["1/1"])])
    ).matches[0];
    expect(m.daysShifted).toBeNull();
  });

  it("daysShifted is right across a DST change (not 6.96 days rounded by luck)", () => {
    const m = diffRevisions(
      model([day(1, "Friday 23rd October 2026", ["1/1"])]),
      model([day(1, "Friday 30th October 2026", ["1/1"])]) // clocks go back 25 Oct
    ).matches[0];
    expect(m.daysShifted).toBe(7);
  });

  it("an unchanged day reports no deltas at all", () => {
    const m = diffRevisions(
      model([day(1, "Monday 6th July 2026", ["1/1"], "Barbican")]),
      model([day(1, "Monday 6th July 2026", ["1/1"], "Barbican")])
    ).matches[0];
    expect(m.daysShifted).toBe(0);
    expect(m.locChanged).toBeNull();
    expect(m.typeChanged).toBeNull();
    expect(m.hoursChanged).toBeNull();
    expect(m.scenesGained).toEqual([]);
    expect(m.scenesLost).toEqual([]);
  });
});

describe("sceneChanges — the per-scene content diff", () => {
  it("a scene going 20 crowd → 200 is NOT unchanged", () => {
    const o = model([dayOf(1, "Monday 6th July 2026", [richScene("12/4", { sa: 20 })])]);
    const n = model([dayOf(1, "Monday 6th July 2026", [richScene("12/4", { sa: 200 })])]);
    const d = diffRevisions(o, n);
    expect(d.scenes.same).toBe(1); // it is still on the same day…
    expect(d.sceneChanges).toHaveLength(1); // …but its content changed
    expect(d.sceneChanges[0].crowd).toEqual({ before: 20, after: 200 });
    expect(revisionChangeLines(d).join("\n")).toContain(
      "Scene 12/4 crowd up from 20 to 200 — 180 more."
    );
  });

  it("counts named groups, featured and SPACTs as crowd, not just the bare total", () => {
    const o = model([
      dayOf(1, "Monday 6th July 2026", [
        richScene("12/4", { sa: 10, saChars: [{ name: "commuters", count: 5 }] }),
      ]),
    ]);
    const n = model([
      dayOf(1, "Monday 6th July 2026", [
        richScene("12/4", {
          sa: 10,
          saChars: [{ name: "commuters", count: 5 }],
          spacts: [{ name: "drivers", count: 2 }],
          featured: [{ name: "busker", count: 1 }],
        }),
      ]),
    ]);
    expect(diffRevisions(o, n).sceneChanges[0].crowd).toEqual({ before: 15, after: 18 });
  });

  it("a crowd cut reads as a reduction", () => {
    const o = model([dayOf(1, "Monday 6th July 2026", [richScene("12/4", { sa: 100 })])]);
    const n = model([dayOf(1, "Monday 6th July 2026", [richScene("12/4", { sa: 40 })])]);
    expect(revisionChangeLines(diffRevisions(o, n)).join("\n")).toContain(
      "crowd down from 100 to 40 — 60 fewer."
    );
  });

  it("reports cast codes added and dropped", () => {
    const o = model([dayOf(1, "Monday 6th July 2026", [richScene("12/4", { cast: cast("1", "9", "24") })])]);
    const n = model([dayOf(1, "Monday 6th July 2026", [richScene("12/4", { cast: cast("1", "9", "31") })])]);
    const c = diffRevisions(o, n).sceneChanges[0];
    expect(c.castAdded).toEqual(["31"]);
    expect(c.castDropped).toEqual(["24"]);
  });

  it("reports a slug (set) change and a location change", () => {
    const o = model([
      dayOf(1, "Monday 6th July 2026", [richScene("12/4", { slug: "THE HOUSE - KITCHEN" })], { loc: "Barbican" }),
    ]);
    const n = model([
      dayOf(1, "Monday 6th July 2026", [richScene("12/4", { slug: "THE HOUSE - HALL" })], { loc: "Silvertown" }),
    ]);
    const c = diffRevisions(o, n).sceneChanges[0];
    expect(c.slugChanged).toEqual({ before: "THE HOUSE - KITCHEN", after: "THE HOUSE - HALL" });
    expect(c.locChanged).toEqual({ before: "Barbican", after: "Silvertown" });
  });

  it("reports a stunt change", () => {
    const o = model([dayOf(1, "Monday 6th July 2026", [richScene("12/4", { extras: [{ name: "drivers", count: 2 }] })])]);
    const n = model([dayOf(1, "Monday 6th July 2026", [richScene("12/4", { extras: [{ name: "drivers", count: 6 }] })])]);
    expect(diffRevisions(o, n).sceneChanges[0].stuntChanged).toEqual({ before: 2, after: 6 });
  });

  it("a genuinely identical scene produces no entry at all", () => {
    const mk = () =>
      model([dayOf(1, "Monday 6th July 2026", [richScene("12/4", { sa: 20, cast: cast("1") })], { loc: "Barbican" })]);
    expect(diffRevisions(mk(), mk()).sceneChanges).toHaveLength(0);
  });
});

// ===========================================================================
// A8 — the plain-English change list.
// ===========================================================================
describe("describeRevision — plain English, grouped by day, uncapped", () => {
  const build = () => {
    const o = model([
      dayOf(1, "Monday 6th July 2026", [richScene("1/1", { sa: 20 }), scene("1/2")], { loc: "Barbican" }),
      // ahead of the new schedule's start, so dropping it is a real cut and
      // not shot history
      day(2, "Wednesday 15th July 2026", ["2/1"], "Soho"),
    ]);
    const n = model([
      dayOf(1, "Wednesday 8th July 2026", [richScene("1/1", { sa: 200 }), scene("1/3")], { loc: "Silvertown" }),
      day(9, "Friday 10th July 2026", ["9/1"], "Ealing"),
    ]);
    return diffRevisions(o, n);
  };

  it("groups every change under the day it happened on", () => {
    const groups = describeRevision(build());
    const day1 = groups.find((g) => g.label.startsWith("Day 1"))!;
    expect(day1.label).toBe("Day 1 — 8 Jul");
    expect(day1.dayId).toBe("M1");
    expect(day1.lines.join("\n")).toContain("Moved 2 days later, to 8 Jul.");
    expect(day1.lines.join("\n")).toContain("Location changed from Barbican to Silvertown.");
    expect(day1.lines.join("\n")).toContain("Picked up 1 scene: 1/3.");
    expect(day1.lines.join("\n")).toContain("Lost 1 scene: 1/2.");
    expect(day1.lines.join("\n")).toContain("crowd up from 20 to 200");
  });

  it("names dropped days and new days in words a producer would use", () => {
    const text = revisionChangeLines(build()).join("\n");
    expect(text).toContain("New shoot day added at Ealing.");
    expect(text).toContain("Day dropped from the schedule (was Soho).");
  });

  it("uses no ids, no jargon and no truncation markers", () => {
    const text = revisionChangeLines(build()).join("\n");
    expect(text).not.toMatch(/…|\.\.\.|and \d+ more/);
    expect(text).not.toMatch(/\boverlap\b|\bJaccard\b|sceneKey|dayUid/i);
  });

  it("lists EVERY change, however many — nothing is capped", () => {
    const many = (n: number, sa: number) =>
      model([dayOf(1, "Monday 6th July 2026", Array.from({ length: n }, (_, i) => richScene(`5/${i}`, { sa })))]);
    const groups = describeRevision(diffRevisions(many(40, 10), many(40, 99)));
    const lines = groups.flatMap((g) => g.lines).filter((l) => l.includes("crowd up"));
    expect(lines).toHaveLength(40);
  });

  it("says nothing about a revision that changed nothing", () => {
    const mk = () => model([day(1, "Monday 6th July 2026", ["1/1"], "Barbican")]);
    expect(describeRevision(diffRevisions(mk(), mk()))).toEqual([]);
  });
});
