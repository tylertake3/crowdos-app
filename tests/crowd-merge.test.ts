// Laying a CROWD BREAKDOWN over a schedule that is already on the board.
//
// Regression origin (FML, August 2026): a crowd breakdown had no route into the
// app except "new revision", which republishes the board FROM the uploaded
// document. A breakdown carries no cast numbers and only the crowd 2nd AD's
// shorthand for locations, so importing one over a good one-liner blanked the
// cast numbers and locations on every day it covered.
//
// The second failure this file pins down is subtler and was never visible: the
// only merge available matched scenes by NUMBER alone. On FML's breakdown Sc.23
// appears on five different days and Sc.45 and Sc.53 on two each, each with
// different crowd. Number-only matching pools them and hands Day 1 the crowd
// that belongs to Day 4 — a wrong number in a budget, with nothing on screen to
// say it happened.
import { describe, it, expect } from "vitest";
import { mergeCrowdBreakdown } from "../lib/engine/crowd-merge";
import type { ScheduleModel, Scene, ShootDay, NamedCount } from "../lib/engine/types";

const scene = (num: string, part = "", extra: Partial<Scene> = {}): Scene => ({
  num, part, ie: "INT", slug: "", tod: "Day", scriptDay: "", pages: "",
  unit: "Main", desc: "", sa: 0, veh: 0, pod: false,
  cast: [], extras: [], spacts: [], saChars: [], featured: [], tags: [],
  ...extra,
});
const day = (num: number, date: string, scenes: Scene[], extra: Partial<ShootDay> = {}): ShootDay =>
  ({ num, date, sr: "", ss: "", loc: "", hours: "", type: "", cams: "", pages: "", scenes, ...extra });
const model = (days: ShootDay[], castMap: Record<string, string> = {}): ScheduleModel =>
  ({ days, castMap, notes: [] });
const sa = (name: string, count: number): NamedCount => ({ name, count });

// The one-liner as it lands on the board: cast numbers, real locations, times
// of day, page counts — and a bare anonymous SA total per scene.
const oneLiner = () => model([
  day(1, "Monday 7th Sep 2026", [
    scene("43", "", { sa: 3, slug: "Jay's Dad's Hospital Room - ICU", cast: [{ code: ".J", type: "cast" }, { code: "17", type: "cast" }], pages: "1 3/8", scriptDay: "D4" }),
    scene("14", "", { sa: 12, slug: "Padel Court", cast: [{ code: ".S", type: "cast" }, { code: ".W", type: "cast" }, { code: "34", type: "cast" }], ie: "EXT" }),
    scene("45", "", { sa: 0, slug: "Wedding Hotel - Spa Sauna", cast: [{ code: ".N", type: "cast" }, { code: "9", type: "cast" }] }),
  ], { loc: "Hertfordshire Country Club", hours: "0800-1830", type: "SCWD" }),
  day(4, "Thursday 10th Sep 2026", [
    scene("53", "", { sa: 20, slug: "Wedding Hotel Spa - Pool Area", cast: [{ code: ".J", type: "cast" }] }),
    scene("45", "", { sa: 0, slug: "Wedding Hotel Spa - Sauna", cast: [{ code: ".N", type: "cast" }] }),
  ], { loc: "Hertfordshire Country Club", hours: "0800-1830" }),
], { ".J": "Jay", "17": "Terry Cartwright", "34": "Women 1 (Padel Player)" });

// The same shoot as the crowd breakdown states it: named crowd characters, and
// nothing else the schedule already knows.
const breakdown = () => model([
  day(1, "Monday 7 September 2026", [
    scene("43", "", { saChars: [sa("Hospital Nurses", 2), sa("Hospital Doctor", 1)] }),
    scene("14", "", { saChars: [sa("Padel Staff", 2), sa("Padel Players", 8)], spacts: [sa("Experienced Female Padel Player", 2)] }),
    scene("45", "", {}), // weather cover, no crowd at all
  ], { loc: "LOCATION TBC" }),
  day(4, "Thursday 10 September 2026", [
    scene("53", "", { saChars: [sa("Spa Guests", 20)], spacts: [sa("Bride's Friends (Spa)", 3)] }),
    scene("45", "", {}),
  ], { loc: "HERTFORDSHIRE COUNTRY CLUB" }),
]);

describe("mergeCrowdBreakdown", () => {
  it("writes the breakdown's crowd onto the schedule's days", () => {
    const { model: out, stats } = mergeCrowdBreakdown(oneLiner(), breakdown());
    const d1 = out.days[0];
    expect(d1.scenes[0].saChars).toEqual([sa("Hospital Nurses", 2), sa("Hospital Doctor", 1)]);
    expect(d1.scenes[1].spacts).toEqual([sa("Experienced Female Padel Player", 2)]);
    expect(stats.daysMatched).toBe(2);
    expect(stats.heads).toBe(38); // 3 + 10 + 2 on day 1, 20 + 3 on day 4
  });

  it("retires the one-liner's anonymous SA total once the crowd is named", () => {
    // "SA's 12" and "2 Padel Staff + 8 Padel Players + 2 SPACTs" are the SAME
    // people. Leaving both set books — and pays — 12 heads twice.
    const { model: out } = mergeCrowdBreakdown(oneLiner(), breakdown());
    expect(out.days[0].scenes[1].sa).toBe(0);
  });

  // ---- the reported bug -------------------------------------------------
  it("never touches cast numbers, locations, dates, hours or scene text", () => {
    const before = oneLiner();
    const { model: out } = mergeCrowdBreakdown(before, breakdown());
    const d1 = out.days[0], s43 = d1.scenes[0];
    expect(s43.cast.map((c) => c.code)).toEqual([".J", "17"]);
    expect(s43.slug).toBe("Jay's Dad's Hospital Room - ICU");
    expect(s43.pages).toBe("1 3/8");
    expect(s43.scriptDay).toBe("D4");
    // The breakdown says "LOCATION TBC" for this day. The schedule says where
    // it actually shoots, and the schedule wins.
    expect(d1.loc).toBe("Hertfordshire Country Club");
    expect(d1.hours).toBe("0800-1830");
    expect(d1.type).toBe("SCWD");
    expect(d1.date).toBe("Monday 7th Sep 2026");
    expect(out.castMap).toEqual(before.castMap);
  });

  it("keeps a scene the breakdown has nothing to say about exactly as it was", () => {
    // Sc.45 is a weather cover with no crowd on either day. An empty cell in a
    // breakdown is silence, not a statement that the crowd is zero.
    const { model: out } = mergeCrowdBreakdown(oneLiner(), breakdown());
    expect(out.days[0].scenes[2].cast.map((c) => c.code)).toEqual([".N", "9"]);
    expect(out.days[0].scenes[2].slug).toBe("Wedding Hotel - Spa Sauna");
  });

  // ---- day-scoped matching ----------------------------------------------
  it("keeps a repeated scene's crowd on the day it belongs to", () => {
    // Sc.45 is on day 1 and day 4; Sc.53's 20 Spa Guests are day 4's. Matching
    // on scene number alone would put them on day 1 as well.
    const bd = breakdown();
    bd.days[1].scenes[1] = scene("45", "", { saChars: [sa("Spa Guests", 20)] });
    const { model: out } = mergeCrowdBreakdown(oneLiner(), bd);
    expect(out.days[0].scenes[2].saChars).toEqual([]); // day 1's Sc.45: still nothing
    expect(out.days[1].scenes[1].saChars).toEqual([sa("Spa Guests", 20)]);
  });

  it("matches days on the calendar date, not the day number", () => {
    // A breakdown built before a day was inserted numbers everything one out.
    // The dates still agree, and the dates are what decide.
    const bd = breakdown();
    bd.days[0].num = 99;
    bd.days[1].num = 1;
    const { model: out, stats } = mergeCrowdBreakdown(oneLiner(), bd);
    expect(stats.daysMatched).toBe(2);
    expect(stats.daysAdded).toBe(0);
    expect(out.days[0].scenes[0].saChars).toEqual([sa("Hospital Nurses", 2), sa("Hospital Doctor", 1)]);
  });

  // ---- what does not match is kept, and said ----------------------------
  it("adds a shoot day the schedule does not have, flagged and in date order", () => {
    const bd = breakdown();
    bd.days.push(day(2, "Tuesday 8 September 2026", [
      scene("13", "", { saChars: [sa("Gastro Pub Diners", 28)] }),
    ]));
    const { model: out, stats } = mergeCrowdBreakdown(oneLiner(), bd);
    expect(stats.daysAdded).toBe(1);
    expect(stats.addedDayLabels).toEqual(["Tuesday 8 September 2026"]);
    // slotted between 7 Sep and 10 Sep, not parked on the end
    expect(out.days.map((d) => d.date)).toEqual([
      "Monday 7th Sep 2026", "Tuesday 8 September 2026", "Thursday 10th Sep 2026",
    ]);
    expect(out.days[1].fromBreakdown).toBe(true);
    expect(out.days[1].scenes[0].fromBreakdown).toBe(true);
    // and its crowd is in the total — it is booked, and it costs
    expect(stats.heads).toBe(66);
  });

  it("adds a scene its day does not list, flagged, without disturbing the rest", () => {
    const bd = breakdown();
    bd.days[0].scenes.push(scene("88", "2/2", { saChars: [sa("Post Credits Pub Goers", 10)] }));
    const { model: out, stats } = mergeCrowdBreakdown(oneLiner(), bd);
    expect(stats.scenesAdded).toBe(1);
    expect(stats.addedSceneLabels).toEqual(["D1 · Sc.882/2"]);
    const added = out.days[0].scenes[3];
    expect(added.fromBreakdown).toBe(true);
    expect(added.saChars).toEqual([sa("Post Credits Pub Goers", 10)]);
    // the three scenes that were already there are untouched and still first
    expect(out.days[0].scenes.slice(0, 3).every((s) => !s.fromBreakdown)).toBe(true);
  });

  it("reports the schedule's own days that the breakdown never mentioned", () => {
    const bd = breakdown();
    bd.days.pop(); // breakdown covers day 1 only
    const { model: out, stats } = mergeCrowdBreakdown(oneLiner(), bd);
    expect(stats.unmatchedSpineDays).toEqual(["Thursday 10th Sep 2026"]);
    // untouched means untouched — day 4's own SA total survives
    expect(out.days[1].scenes[0].sa).toBe(20);
    expect(out.days[1].scenes[0].saChars).toEqual([]);
  });

  it("pairs a schedule's split part with the breakdown's combined number", () => {
    const spine = model([day(1, "Monday 7 September 2026", [scene("87", "5/7", { sa: 32 })])]);
    const bd = model([day(1, "Monday 7 September 2026", [
      scene("87pt5/7", "", { saChars: [sa("Gastro Pub Diners", 28), sa("Gastro Pub Waiters", 2), sa("Gastro Pub Bar Staff", 2)] }),
    ])]);
    const { model: out, stats } = mergeCrowdBreakdown(spine, bd);
    expect(stats.scenesMatched).toBe(1);
    expect(stats.scenesAdded).toBe(0);
    expect(out.days[0].scenes[0].sa).toBe(0);
    expect(out.days[0].scenes[0].saChars).toHaveLength(3);
  });

  // ---- keying the same scene written two ways ---------------------------
  it("pairs a scene whose number carries the schedule's I/E artefact", () => {
    // The schedule parser leaves "88pt2/2 INT/EXT" in the number. Unmatched, it
    // used to re-add the breakdown's 88pt2/2 to the same day as a duplicate —
    // the same background booked twice on one day.
    const spine = model([day(1, "Monday 7 September 2026", [scene("88pt2/2 INT/EXT")])]);
    const bd = model([day(1, "Monday 7 September 2026", [
      scene("88", "2/2", { saChars: [sa("Post Credits Pub Goers", 10)] }),
    ])]);
    const { model: out, stats } = mergeCrowdBreakdown(spine, bd);
    expect(stats.scenesMatched).toBe(1);
    expect(stats.scenesAdded).toBe(0);
    expect(out.days[0].scenes).toHaveLength(1);
    expect(out.days[0].scenes[0].saChars).toEqual([sa("Post Credits Pub Goers", 10)]);
  });

  it("pairs a scene the two documents number with and without a leading zero", () => {
    const spine = model([day(1, "Monday 7 September 2026", [
      scene("6"), scene("55", "7/29"),
    ])]);
    const bd = model([day(1, "Monday 7 September 2026", [
      scene("06", "", { saChars: [sa("Office Workers", 10)] }),
      scene("55", "07/29", { saChars: [sa("Wedding Guests", 110)] }),
    ])]);
    const { model: out, stats } = mergeCrowdBreakdown(spine, bd);
    expect(stats.scenesAdded).toBe(0);
    expect(out.days[0].scenes[0].saChars).toEqual([sa("Office Workers", 10)]);
    expect(out.days[0].scenes[1].saChars).toEqual([sa("Wedding Guests", 110)]);
  });

  it("leaves an ambiguous number unmatched rather than guessing", () => {
    // A bare "55" against a day of 55pt8/29, 55pt9/29… could be any of them.
    // Guessing would put a day's crowd on one arbitrary part.
    const spine = model([day(1, "Monday 7 September 2026", [
      scene("55", "8/29"), scene("55", "9/29"),
    ])]);
    const bd = model([day(1, "Monday 7 September 2026", [
      scene("55", "", { saChars: [sa("Wedding Guests", 110)] }),
    ])]);
    const { model: out, stats } = mergeCrowdBreakdown(spine, bd);
    expect(stats.scenesMatched).toBe(0);
    expect(stats.scenesAdded).toBe(1);
    expect(out.days[0].scenes[0].saChars).toEqual([]);
    expect(out.days[0].scenes[1].saChars).toEqual([]);
  });

  // ---- weather cover ----------------------------------------------------
  it("marks an added scene that sits under a WEATHER COVER banner", () => {
    // FML covers Sc.23/24/25 on four separate days. Costed as real crowd on
    // each, that is four days of background for a day's work that happens once
    // — and weather cover is scheduled precisely because it may never be shot.
    const bd = breakdown();
    bd.days[0].locBlocks = [{ loc: "AUDLEY END ESTATE", from: 0 }, { loc: "WEATHER COVER", from: 3 }];
    bd.days[0].scenes.push(scene("23", "", { saChars: [sa("Wedding Guests (BBQ)", 60)] }));
    const { model: out, stats } = mergeCrowdBreakdown(oneLiner(), bd);
    expect(stats.scenesAdded).toBe(1);
    const added = out.days[0].scenes.find((s) => s.num === "23");
    expect(added?.fromBreakdown).toBe(true);
    expect(added?.status).toBe("weatherCover");
  });

  it("folds a breakdown day printed in two blocks into the one shoot day", () => {
    // FML's breakdown prints six of its shoot days across two blocks. Read as
    // two day records on one date, they used to become a second shoot day the
    // production does not have — with a "Breakdown only" warning on what is
    // simply page two of a day the schedule already knows about.
    const bd = breakdown();
    bd.days.push(day(1, "Monday 7 September 2026", [
      scene("88", "2/2", { saChars: [sa("Post Credits Pub Goers", 10)] }),
    ]));
    const { model: out, stats } = mergeCrowdBreakdown(oneLiner(), bd);
    expect(stats.daysAdded).toBe(0);
    expect(out.days).toHaveLength(2);
    expect(stats.daysMatched).toBe(2);
    // the second block's scene lands on day 1, flagged because the schedule
    // does not list it there
    expect(out.days[0].scenes).toHaveLength(4);
    expect(out.days[0].scenes[3].fromBreakdown).toBe(true);
    expect(out.days[0].scenes[3].saChars).toEqual([sa("Post Credits Pub Goers", 10)]);
  });

  it("combines a scene printed twice on one breakdown day without doubling it", () => {
    // A page split repeats the scene's block. Same group named twice is the
    // same people — the larger claim, never the sum.
    const spine = model([day(1, "Monday 7 September 2026", [scene("23")])]);
    const bd = model([day(1, "Monday 7 September 2026", [
      scene("23", "", { saChars: [sa("Wedding Guests", 40)] }),
      scene("23", "", { saChars: [sa("Wedding Guests", 60), sa("Waiting Staff", 4)] }),
    ])]);
    const { model: out, stats } = mergeCrowdBreakdown(spine, bd);
    expect(out.days[0].scenes[0].saChars).toEqual([sa("Wedding Guests", 60), sa("Waiting Staff", 4)]);
    expect(stats.heads).toBe(64);
  });
});
