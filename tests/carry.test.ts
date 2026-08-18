// Carrying the user's work across a revision — lib/engine/carry.ts.
//
// This is the most safety-critical module in the product: every ~3 days an AD
// issues a revised schedule, the user re-uploads it, and this file decides
// where their crowd numbers, notes and day settings land. Getting it wrong
// either loses work silently or — worse — re-attaches an edit to the WRONG
// scene and prices somebody else's day as if a human had checked it.
//
// Every test below is named for the guarantee it pins.

import { describe, it, expect } from "vitest";
import { cdayKey } from "../lib/engine/crowd";
import {
  slotSceneKey, sceneOrdinal, slotSuffix, sceneSlotKey,
  isLegacySlotKey, slotIndexOn, planSlotMigration,
  dayCarryTargets, sceneCarryTargets, carryReviewReasons,
  compactRevisionDiff, storedDiffMoney, storedDiffHeadline,
  storedDiffByDay, storedCutByDay, dayChangeLabels, sceneChangeLabel,
  diffRevisions, prepModel, sceneIndexAllOf, sceneCrowdHeads,
  carriedDayRecords, carriedDayId, computeCrowdCosts, describeRevision,
  carrySceneKey, sceneKey,
} from "../lib/engine";
import type { Scene, ScheduleModel, ShootDay } from "../lib/engine";
import type { SlotDay, SlotMigrationPlan } from "../lib/engine/carry";

// ---------------------------------------------------------------------------
// fixtures — same house style as tests/revise.test.ts
// ---------------------------------------------------------------------------

const scene = (num: string, part = ""): Scene => ({
  num, part, ie: "EXT", slug: "", tod: "Day", scriptDay: "", pages: "1",
  unit: "Main", desc: "", sa: 0, veh: 0, pod: false, cast: [], tags: [],
});
const richScene = (num: string, over: Partial<Scene> = {}): Scene => ({ ...scene(num), ...over });

const day = (num: number, date: string, sceneNums: string[], loc = "Somewhere"): ShootDay => ({
  num, date, sr: "", ss: "", loc, hours: "", type: "", cams: "",
  scenes: sceneNums.map((n) => scene(n)), pages: "",
});

const dayOf = (num: number, date: string, scenes: Scene[], over: Partial<ShootDay> = {}): ShootDay => ({
  num, date, sr: "", ss: "", loc: "Somewhere", hours: "", type: "", cams: "",
  scenes, pages: "", ...over,
});

const model = (days: ShootDay[]): ScheduleModel =>
  prepModel({ days, castMap: {}, notes: [] }, "Main");

/** a bare day, as far as slot keying is concerned */
const slotDay = (num: number | string, scenes: { num?: string; part?: string }[], unit?: string): SlotDay =>
  ({ num, scenes, ...(unit ? { unit } : {}) });

/** apply a migration plan to a key list, the way the store does */
const applyPlan = (keys: string[], plan: SlotMigrationPlan): string[] => {
  const moves = new Map(plan.moves.map((m) => [m.from, m.to]));
  return keys.map((k) => moves.get(k) || k);
};

// ===========================================================================
// 1 · scene slot keys — the identity a piece of work is filed under
// ===========================================================================

describe("slotSceneKey — one scene, however the schedule spells it", () => {
  it("normalises spacing and full stops, so '10 Pt 1' and '10pt1' are the same scene", () => {
    expect(slotSceneKey("10", " Pt 1")).toBe("10pt1");
    expect(slotSceneKey("10", "pt1")).toBe("10pt1");
    expect(slotSceneKey("10 ", "PT. 1")).toBe("10pt1");
  });

  it("lower-cases, so a pink-page 45A matches a stored 45a", () => {
    expect(slotSceneKey("45A")).toBe("45a");
    expect(slotSceneKey("45a")).toBe("45a");
  });

  it("is empty when the scene has neither a number nor a part", () => {
    expect(slotSceneKey()).toBe("");
    expect(slotSceneKey(undefined, undefined)).toBe("");
    expect(slotSceneKey("", "")).toBe("");
  });

  it("keeps the episode/scene separator — 10/43 is not 1043", () => {
    expect(slotSceneKey("10/43")).toBe("10/43");
  });
});

describe("sceneOrdinal — only a day that genuinely lists a scene twice goes past 0", () => {
  it("is 0 for every scene on an ordinary day", () => {
    const d = slotDay(1, [{ num: "45" }, { num: "46" }, { num: "47" }]);
    expect([0, 1, 2].map((i) => sceneOrdinal(d, i))).toEqual([0, 0, 0]);
  });

  it("numbers the occurrences 0 and 1 when one day lists the same scene twice", () => {
    const d = slotDay(1, [{ num: "45" }, { num: "46" }, { num: "45" }]);
    expect(sceneOrdinal(d, 0)).toBe(0);
    expect(sceneOrdinal(d, 2)).toBe(1);
  });

  it("treats differently-spelled duplicates as the same scene", () => {
    const d = slotDay(1, [{ num: "10", part: "Pt 1" }, { num: "10", part: "pt1" }]);
    expect(sceneOrdinal(d, 1)).toBe(1);
  });

  it("groups scenes with no number at all, rather than throwing", () => {
    const d = slotDay(1, [{}, { num: "45" }, {}]);
    expect(sceneOrdinal(d, 0)).toBe(0);
    expect(sceneOrdinal(d, 2)).toBe(1);
  });

  it("is 0 for an index that is off the end of the day", () => {
    expect(sceneOrdinal(slotDay(1, [{ num: "45" }]), 9)).toBe(0);
  });
});

describe("slotSuffix — the last segment marks a key as scene-anchored", () => {
  it("is #0 for the ordinary single-occurrence case", () => {
    expect(slotSuffix(0)).toBe("#0");
  });
  it("counts further occurrences", () => {
    expect(slotSuffix(1)).toBe("#1");
    expect(slotSuffix(2)).toBe("#2");
  });
});

describe("sceneSlotKey — a position-independent address for one scene's work", () => {
  it("is unit | day | scene | part | occurrence", () => {
    const d = slotDay(12, [{ num: "45", part: "pt1" }], "Main");
    expect(sceneSlotKey(d, 0)).toBe("Main|12|45|pt1|#0");
  });

  it("defaults a day with no unit to Main, so an old record still resolves", () => {
    expect(sceneSlotKey(slotDay(12, [{ num: "45" }]), 0)).toBe("Main|12|45||#0");
  });

  it("keeps the second-unit name distinct — Main D18 and 2nd D18 are different days", () => {
    const d = slotDay(18, [{ num: "45" }], "2nd");
    expect(sceneSlotKey(d, 0)).toBe("2nd|18|45||#0");
  });

  it("leaves the scene and part segments blank when the scene has neither", () => {
    expect(sceneSlotKey(slotDay(3, [{}]), 0)).toBe("Main|3|||#0");
  });

  it("gives the two occurrences of a twice-listed scene two different keys", () => {
    const d = slotDay(1, [{ num: "45" }, { num: "45" }]);
    expect(sceneSlotKey(d, 0)).toBe("Main|1|45||#0");
    expect(sceneSlotKey(d, 1)).toBe("Main|1|45||#1");
  });

  it("survives an index that names no scene rather than throwing", () => {
    expect(sceneSlotKey(slotDay(1, [{ num: "45" }]), 5)).toBe("Main|1|||#0");
  });

  it("always has five segments, so every existing reader that splits on | keeps working", () => {
    expect(sceneSlotKey(slotDay(1, [{ num: "45", part: "pt1" }]), 0).split("|")).toHaveLength(5);
  });
});

// ===========================================================================
// 2 · telling the two key forms apart
// ===========================================================================

describe("isLegacySlotKey — a key still filed under an array position", () => {
  it("is true for the old unit|day|scene|part|index form", () => {
    expect(isLegacySlotKey("Main|12|45||0")).toBe(true);
    expect(isLegacySlotKey("Main|12|45|pt1|3")).toBe(true);
  });

  it("is false for the new #ordinal form", () => {
    expect(isLegacySlotKey("Main|12|45||#0")).toBe(false);
    expect(isLegacySlotKey("Main|12|45||#2")).toBe(false);
  });

  it("is false for the whole-day DAY form, which was never position-keyed", () => {
    expect(isLegacySlotKey("Main|12|||DAY")).toBe(false);
  });

  it("is false for anything that is not a five-segment slot key", () => {
    expect(isLegacySlotKey("Main|12")).toBe(false);
    expect(isLegacySlotKey("")).toBe(false);
    expect(isLegacySlotKey("Main|12|45||#0|extra")).toBe(false);
  });
});

describe("slotIndexOn — resolving either key form back to a scene on a day", () => {
  const d = slotDay(1, [{ num: "45" }, { num: "46" }, { num: "45" }]);

  it("finds the nth occurrence for a #ordinal key", () => {
    expect(slotIndexOn(d, "45", "", "#0")).toBe(0);
    expect(slotIndexOn(d, "45", "", "#1")).toBe(2);
    expect(slotIndexOn(d, "46", "", "#0")).toBe(1);
  });

  it("returns -1 when the day does not have that many occurrences", () => {
    expect(slotIndexOn(d, "45", "", "#2")).toBe(-1);
  });

  it("returns -1 when the scene is not on the day at all", () => {
    expect(slotIndexOn(d, "99", "", "#0")).toBe(-1);
  });

  it("matches the scene through the same normalisation, so '10 Pt 1' finds '10pt1'", () => {
    const p = slotDay(1, [{ num: "10", part: "pt1" }]);
    expect(slotIndexOn(p, "10", " Pt 1", "#0")).toBe(0);
  });

  it("takes a legacy key's last segment as a literal array index", () => {
    expect(slotIndexOn(d, "anything", "", "0")).toBe(0);
    expect(slotIndexOn(d, "anything", "", "2")).toBe(2);
  });

  it("returns -1 for a legacy index off the end of the day", () => {
    expect(slotIndexOn(d, "45", "", "3")).toBe(-1);
    expect(slotIndexOn(d, "45", "", "99")).toBe(-1);
  });

  it("returns -1 for a negative or unreadable last segment", () => {
    expect(slotIndexOn(d, "45", "", "-1")).toBe(-1);
    expect(slotIndexOn(d, "45", "", "abc")).toBe(-1);
  });

  it("returns -1 for the whole-day DAY marker, which addresses no scene", () => {
    expect(slotIndexOn(d, "", "", "DAY")).toBe(-1);
  });
});

// ===========================================================================
// 3 · planSlotMigration — the upgrade-safety path
// ===========================================================================

describe("planSlotMigration — moving stored work off array positions", () => {
  const dayA = slotDay(12, [{ num: "45" }, { num: "46" }, { num: "47" }]);
  const lookup = (unit: string, num: string): SlotDay | null =>
    unit === "Main" && num === "12" ? dayA : null;

  it("rewrites every legacy key onto the scene that was actually at that position", () => {
    const keys = ["Main|12|45||0", "Main|12|46||1", "Main|12|47||2"];
    const plan = planSlotMigration(keys, lookup);
    expect(plan.moves).toEqual([
      { from: "Main|12|45||0", to: "Main|12|45||#0" },
      { from: "Main|12|46||1", to: "Main|12|46||#0" },
      { from: "Main|12|47||2", to: "Main|12|47||#0" },
    ]);
    expect(plan.unresolved).toEqual([]);
    expect(plan.collisions).toEqual([]);
  });

  it("falls back to the stored position only when the key's own scene has gone — and SAYS it guessed", () => {
    // the key names a scene the day no longer lists at all, so the scene
    // sitting at the stored position is the only evidence left. That is a
    // guess, and migration writes it into storage, so it is reported.
    const plan = planSlotMigration(["Main|12|OLDNUM||1"], lookup);
    expect(plan.moves).toEqual([{ from: "Main|12|OLDNUM||1", to: "Main|12|46||#0" }]);
    expect(plan.guessed).toEqual([
      { from: "Main|12|OLDNUM||1", to: "Main|12|46||#0", wantedScene: "OLDNUM", usedScene: "46" },
    ]);
  });

  it("leaves a key EXACTLY where it is when its day is not loaded — nothing is thrown away", () => {
    const keys = ["Main|12|45||0", "2nd|4|9/34||0", "Main|99|1/1||0"];
    const plan = planSlotMigration(keys, lookup);
    expect(plan.unresolved).toEqual(["2nd|4|9/34||0", "Main|99|1/1||0"]);
    expect(plan.moves.map((m) => m.from)).toEqual(["Main|12|45||0"]);
    // and applying the plan does not touch them
    expect(applyPlan(keys, plan)).toEqual(["Main|12|45||#0", "2nd|4|9/34||0", "Main|99|1/1||0"]);
  });

  it("still finds the scene when the stored position is off the end of the day", () => {
    // position 7 is nonsense now, but the key names scene 45 and scene 45 is
    // right there — the work follows its own scene rather than being stranded
    const plan = planSlotMigration(["Main|12|45||7"], lookup);
    expect(plan.moves).toEqual([{ from: "Main|12|45||7", to: "Main|12|45||#0" }]);
    expect(plan.guessed).toEqual([]);
  });

  it("leaves a key alone when neither its scene nor its position is on the day", () => {
    const plan = planSlotMigration(["Main|12|GONE||7"], lookup);
    expect(plan.moves).toEqual([]);
    expect(plan.unresolved).toEqual(["Main|12|GONE||7"]);
  });

  it("passes already-migrated and whole-day keys through untouched", () => {
    const keys = ["Main|12|45||#0", "Main|12|||DAY", "not-a-slot-key"];
    const plan = planSlotMigration(keys, lookup);
    expect(plan).toEqual({ moves: [], unresolved: [], collisions: [], guessed: [] });
    expect(applyPlan(keys, plan)).toEqual(keys);
  });

  it("parks the later of two colliding legacy keys on a spare ordinal instead of overwriting it", () => {
    // both keys point at position 0; whatever the second one held would have
    // silently replaced the first one's work
    const keys = ["Main|12|45||0", "Main|12|GHOST||0"];
    const plan = planSlotMigration(keys, lookup);
    expect(plan.moves).toEqual([
      { from: "Main|12|45||0", to: "Main|12|45||#0" },
      { from: "Main|12|GHOST||0", to: "Main|12|45||#1" },
    ]);
    expect(plan.collisions).toEqual([
      { from: "Main|12|GHOST||0", wanted: "Main|12|45||#0", parked: "Main|12|45||#1" },
    ]);
    // the two survive as two distinct keys — neither is lost
    expect(new Set(applyPlan(keys, plan)).size).toBe(2);
  });

  it("keeps walking up the ordinals when the spare slot is taken too", () => {
    const keys = ["Main|12|45||0", "Main|12|A||0", "Main|12|B||0"];
    const plan = planSlotMigration(keys, lookup);
    expect(plan.moves.map((m) => m.to)).toEqual([
      "Main|12|45||#0", "Main|12|45||#1", "Main|12|45||#2",
    ]);
    expect(plan.collisions).toHaveLength(2);
  });

  it("never parks on an ordinal an already-migrated key holds", () => {
    const keys = ["Main|12|45||#0", "Main|12|45||0"];
    const plan = planSlotMigration(keys, lookup);
    expect(plan.moves).toEqual([{ from: "Main|12|45||0", to: "Main|12|45||#1" }]);
    expect(plan.collisions[0].parked).toBe("Main|12|45||#1");
  });

  it("is idempotent — running the plan twice moves nothing the second time", () => {
    const keys = ["Main|12|45||0", "Main|12|46||1", "Main|12|GHOST||0", "2nd|4|9/34||0"];
    const once = applyPlan(keys, planSlotMigration(keys, lookup));
    const second = planSlotMigration(once, lookup);
    expect(second.moves).toEqual([]);
    expect(second.collisions).toEqual([]);
    expect(applyPlan(once, second)).toEqual(once);
  });

  it("gives the two occurrences of a twice-listed scene two ordinals, not a collision", () => {
    const twice = slotDay(12, [{ num: "45" }, { num: "45" }]);
    const plan = planSlotMigration(
      ["Main|12|45||0", "Main|12|45||1"],
      (u, n) => (u === "Main" && n === "12" ? twice : null)
    );
    expect(plan.moves.map((m) => m.to)).toEqual(["Main|12|45||#0", "Main|12|45||#1"]);
    expect(plan.collisions).toEqual([]);
  });

  it("only touches keys under the given namespace prefix", () => {
    const keys = ["prod1|Main|12|45||0", "prod2|Main|12|45||0"];
    const plan = planSlotMigration(keys, lookup, { prefix: "prod1|" });
    expect(plan.moves).toEqual([{ from: "prod1|Main|12|45||0", to: "prod1|Main|12|45||#0" }]);
    expect(plan.unresolved).toEqual([]);
    expect(applyPlan(keys, plan)[1]).toBe("prod2|Main|12|45||0"); // other production untouched
  });

  it("handles an empty key list", () => {
    expect(planSlotMigration([], lookup)).toEqual({ moves: [], unresolved: [], collisions: [], guessed: [] });
  });
});

describe("planSlotMigration — the scene inserted at the TOP of a day", () => {
  // THE bug. Work was filed under array position, so inserting one scene at
  // the start of a day silently re-attached every edit below it to the scene
  // above — invisible, plausible, and wrong in money.
  const before = slotDay(12, [{ num: "45" }, { num: "46" }, { num: "47" }]);
  const after = slotDay(12, [{ num: "44" }, { num: "45" }, { num: "46" }, { num: "47" }]);
  const legacy = ["Main|12|45||0", "Main|12|46||1", "Main|12|47||2"];

  it("legacy position keys DID re-attach every downstream edit to the wrong scene", () => {
    // resolved against the day after the insert, each old key finds the scene
    // one place above the one it was made on
    const landed = legacy.map((k) => {
      const [, , sNum, sPart, last] = k.split("|");
      return after.scenes[slotIndexOn(after, sNum, sPart, last)].num;
    });
    expect(landed).toEqual(["44", "45", "46"]); // every one of them wrong
  });

  it("migrated keys follow their own scene across the insert", () => {
    const migrated = applyPlan(legacy, planSlotMigration(legacy, () => before));
    expect(migrated).toEqual(["Main|12|45||#0", "Main|12|46||#0", "Main|12|47||#0"]);
    const landed = migrated.map((k) => {
      const [, , sNum, sPart, last] = k.split("|");
      return after.scenes[slotIndexOn(after, sNum, sPart, last)].num;
    });
    expect(landed).toEqual(["45", "46", "47"]); // every one of them right
  });

  it("the newly inserted scene has no work attached to it", () => {
    const migrated = new Set(applyPlan(legacy, planSlotMigration(legacy, () => before)));
    expect(migrated.has(sceneSlotKey(after, 0))).toBe(false); // "Main|12|44||#0"
  });

  it("a scene REMOVED from the top of a day likewise keeps every edit on its own scene", () => {
    const trimmed = slotDay(12, [{ num: "46" }, { num: "47" }]);
    const migrated = applyPlan(legacy, planSlotMigration(legacy, () => before));
    const resolve = (k: string) => {
      const [, , sNum, sPart, last] = k.split("|");
      return slotIndexOn(trimmed, sNum, sPart, last);
    };
    expect(migrated.map(resolve)).toEqual([-1, 0, 1]); // 45 is genuinely gone; the rest track
  });
});

// ===========================================================================
// 4 · dayCarryTargets — where each old day's day-level work lands
// ===========================================================================

describe("dayCarryTargets — one target per old day, every contest reported", () => {
  it("sends a matched day's work to the day its scenes went to, not its old number", () => {
    const oldM = model([day(52, "Friday 11th September 2026", ["8/27", "8/18"])]);
    const newM = model([day(53, "Monday 14th September 2026", ["8/27", "8/18"])]);
    const t = dayCarryTargets(diffRevisions(oldM, newM));
    expect(t.map.get("Main|52")).toBe("Main|53");
    expect(t.collisions).toEqual([]);
  });

  it("the strongest pairing claims a contested target; the loser is REPORTED, never overwritten", () => {
    // the new revision reuses day number 5 for two different day records
    const oldM = model([
      day(5, "Monday 6th July 2026", ["1/1", "1/2"], "Barbican"),
      day(6, "Tuesday 7th July 2026", ["2/1", "2/2"], "Soho"),
    ]);
    const newM = model([
      day(5, "Monday 6th July 2026", ["1/1", "1/2"], "Barbican"), //   100% with old D5
      day(5, "Tuesday 7th July 2026", ["2/1", "2/2", "2/3"], "Soho"), // 67% with old D6
    ]);
    const diff = diffRevisions(oldM, newM);
    expect(diff.matches).toHaveLength(2);
    const t = dayCarryTargets(diff);
    expect(t.map.get("Main|5")).toBe("Main|5"); // best overlap owns it
    expect(t.map.has("Main|6")).toBe(false); //   the loser is not silently redirected
    expect(t.collisions).toEqual([{ from: "Main|6", to: "Main|5", heldBy: "Main|5" }]);
  });

  it("an already-shot day keeps its own number — it is stitched in unchanged", () => {
    const oldM = model([
      day(12, "Monday 6th July 2026", ["12/15"], "Barbican"), // before the new start
      day(20, "Thursday 16th July 2026", ["10/09"], "Canary Wharf"),
    ]);
    const newM = model([day(20, "Thursday 16th July 2026", ["10/09"], "Canary Wharf")]);
    const diff = diffRevisions(oldM, newM);
    expect(diff.shotDays.map((d) => d.num)).toEqual([12]);
    const t = dayCarryTargets(diff);
    expect(t.map.get("Main|12")).toBe("Main|12");
    expect(t.map.get("Main|20")).toBe("Main|20");
  });

  it("a hand-added day keeps its own number too", () => {
    const oldM = model([day(1, "Monday 6th July 2026", ["1/1"])]);
    const newM = model([day(1, "Monday 6th July 2026", ["1/1"])]);
    const t = dayCarryTargets(diffRevisions(oldM, newM), ["Main|900", "2nd|901"]);
    expect(t.map.get("Main|900")).toBe("Main|900");
    expect(t.map.get("2nd|901")).toBe("2nd|901");
  });

  it("an old day only ever gets ONE target — a later claim can't redirect it", () => {
    const oldM = model([day(52, "Friday 11th September 2026", ["8/27"])]);
    const newM = model([day(53, "Monday 14th September 2026", ["8/27"])]);
    // the same day also offered as a hand-added day; the match must win
    const t = dayCarryTargets(diffRevisions(oldM, newM), ["Main|52"]);
    expect(t.map.get("Main|52")).toBe("Main|53");
    expect(t.collisions).toEqual([]); // re-claiming the same source is not a contest
  });

  it("keeps the units apart — Main D18 and 2nd D18 are different days", () => {
    const oldM = model([day(18, "Tuesday 14th July 2026", ["9/34"])]);
    const newM = model([day(19, "Tuesday 14th July 2026", ["9/34"])]);
    const t = dayCarryTargets(diffRevisions(oldM, newM), ["2nd|18"]);
    expect(t.map.get("Main|18")).toBe("Main|19");
    expect(t.map.get("2nd|18")).toBe("2nd|18");
  });

  it("a cut day has no target at all, so its work is never re-attached to somebody else", () => {
    const oldM = model([
      day(1, "Monday 6th July 2026", ["1/1"]),
      day(2, "Tuesday 7th July 2026", ["9/9"]),
    ]);
    const newM = model([day(1, "Monday 6th July 2026", ["1/1"])]);
    const diff = diffRevisions(oldM, newM);
    expect(diff.cutDays.map((d) => d.num)).toEqual([2]);
    expect(dayCarryTargets(diff).map.has("Main|2")).toBe(false);
  });
});

// ===========================================================================
// 5 · sceneCarryTargets — which instance of a scene the user is about to work on
// ===========================================================================

describe("sceneCarryTargets — the live day outranks the history", () => {
  it("a still-to-shoot day ranks ABOVE a carried already-shot day", () => {
    // binding the edit to the shot day left the upcoming instance blank, which
    // reads as "nobody has broken this scene down yet" on a fully broken-down scene
    const m = model([
      dayOf(12, "Monday 6th July 2026", [scene("9/34")], { carried: true, fromRev: "Blue" }),
      dayOf(24, "Thursday 23rd July 2026", [scene("9/34")]),
    ]);
    const t = sceneCarryTargets(m, "9/34");
    expect(t.map((x) => x.day.num)).toEqual([24, 12]);
    expect(t[0].day.carried).toBeFalsy();
  });

  it("ranks live days by date, earliest first", () => {
    const m = model([
      dayOf(6, "Friday 24th July 2026", [scene("9/34")]),
      dayOf(5, "Tuesday 21st July 2026", [scene("9/34")]),
    ]);
    expect(sceneCarryTargets(m, "9/34").map((x) => x.day.num)).toEqual([5, 6]);
  });

  it("falls back to the day number when two live days share a date", () => {
    const m = model([
      dayOf(9, "Tuesday 21st July 2026", [scene("9/34")]),
      dayOf(8, "Tuesday 21st July 2026", [scene("9/34")]),
    ]);
    expect(sceneCarryTargets(m, "9/34").map((x) => x.day.num)).toEqual([8, 9]);
  });

  it("orders carried days among themselves by date too", () => {
    const m = model([
      dayOf(4, "Thursday 9th July 2026", [scene("9/34")], { carried: true }),
      dayOf(2, "Monday 6th July 2026", [scene("9/34")], { carried: true }),
      dayOf(30, "Monday 3rd August 2026", [scene("9/34")]),
    ]);
    expect(sceneCarryTargets(m, "9/34").map((x) => x.day.num)).toEqual([30, 2, 4]);
  });

  it("reports the scene's position on each day, so a slot key can be built from it", () => {
    const m = model([dayOf(24, "Thursday 23rd July 2026", [scene("9/33"), scene("9/34")])]);
    const [t] = sceneCarryTargets(m, "9/34");
    expect(t.idx).toBe(1);
    expect(t.scene.num).toBe("9/34");
    expect(sceneSlotKey(t.day, t.idx)).toBe("Main|24|9/34||#0");
  });

  it("returns every occurrence when one scene shoots on two days", () => {
    const m = model([
      dayOf(1, "Monday 6th July 2026", [scene("7/12")]),
      dayOf(2, "Tuesday 7th July 2026", [scene("7/12")]),
    ]);
    expect(sceneCarryTargets(m, "7/12")).toHaveLength(2);
  });

  it("returns nothing for a scene the new revision does not contain", () => {
    const m = model([dayOf(1, "Monday 6th July 2026", [scene("7/12")])]);
    expect(sceneCarryTargets(m, "99/99")).toEqual([]);
  });

  it("does not mutate the model's own scene index", () => {
    const m = model([
      dayOf(12, "Monday 6th July 2026", [scene("9/34")], { carried: true }),
      dayOf(24, "Thursday 23rd July 2026", [scene("9/34")]),
    ]);
    sceneCarryTargets(m, "9/34");
    expect(sceneIndexAllOf(m).get("9/34")!.map((o) => o.day.num)).toEqual([12, 24]);
  });
});

// ===========================================================================
// 6 · carryReviewReasons — is the carried day config still trustworthy?
// ===========================================================================

describe("carryReviewReasons — plain English about what the numbers were based on", () => {
  const base = {
    overlap: 1,
    matchedBy: "scenes" as const,
    scenesGained: [] as string[],
    scenesLost: [] as string[],
    hoursChanged: null,
    typeChanged: null,
    locChanged: null,
  };

  it("a clean, high-overlap match needs no review", () => {
    expect(carryReviewReasons(base)).toEqual({ needsReview: false, reasons: [] });
  });

  it("an exactly-half overlap is still treated as a match, not a partial one", () => {
    expect(carryReviewReasons({ ...base, overlap: 0.5 }).needsReview).toBe(false);
  });

  it("flags a low-overlap match with the percentage", () => {
    const r = carryReviewReasons({ ...base, overlap: 0.25 });
    expect(r.needsReview).toBe(true);
    expect(r.reasons).toEqual([
      "Only 25% of this day's scenes are the same as before, so it is only a partial match.",
    ]);
  });

  it("flags a day matched by date rather than by its scenes", () => {
    const r = carryReviewReasons({ ...base, overlap: 0, matchedBy: "date" });
    expect(r.reasons).toEqual([
      "This day lists no scenes, so it was matched to the previous schedule by date.",
    ]);
  });

  it("flags a day matched by number", () => {
    expect(carryReviewReasons({ ...base, overlap: 0, matchedBy: "number" }).reasons[0]).toContain(
      "matched to the previous schedule by number"
    );
  });

  it("flags a day matched by location", () => {
    expect(carryReviewReasons({ ...base, overlap: 0, matchedBy: "location" }).reasons[0]).toContain(
      "matched to the previous schedule by location"
    );
  });

  it("says only the non-scene match, not the overlap percentage, when both could apply", () => {
    const r = carryReviewReasons({ ...base, overlap: 0.2, matchedBy: "location" });
    expect(r.reasons).toHaveLength(1);
    expect(r.reasons[0]).toContain("by location");
  });

  it("reads correctly in the singular for one scene gained", () => {
    expect(carryReviewReasons({ ...base, scenesGained: ["1/3"] }).reasons[0]).toBe(
      "This day picked up 1 scene, so the crowd numbers may no longer be right."
    );
  });

  it("reads correctly in the plural for two scenes lost", () => {
    expect(carryReviewReasons({ ...base, scenesLost: ["1/1", "1/2"] }).reasons[0]).toBe(
      "This day lost 2 scenes, so the crowd numbers may no longer be right."
    );
  });

  it("reads correctly when scenes were gained AND lost together", () => {
    const r = carryReviewReasons({ ...base, scenesGained: ["1/3"], scenesLost: ["1/1", "1/2"] });
    expect(r.reasons[0]).toBe(
      "This day picked up 1 scene and lost 2 scenes, so the crowd numbers may no longer be right."
    );
  });

  it("says the call and wrap times are the old ones when the hours moved", () => {
    const r = carryReviewReasons({ ...base, hoursChanged: { before: "0700–1900", after: "1600–0400" } });
    expect(r.reasons).toEqual([
      "The hours changed from 0700–1900 to 1600–0400, so the call and wrap times here are the old ones.",
    ]);
  });

  it("says the travel band and the address are the old ones when the location moved", () => {
    const r = carryReviewReasons({ ...base, locChanged: { before: "Barbican", after: "Silvertown" } });
    expect(r.reasons).toEqual([
      "The location changed from Barbican to Silvertown, so the travel band and the address here are the old ones.",
    ]);
  });

  it("reports a day-type change (CWD ↔ CWN)", () => {
    const r = carryReviewReasons({ ...base, typeChanged: { before: "CWD", after: "CWN" } });
    expect(r.reasons).toEqual(["The day type changed from CWD to CWN."]);
  });

  it("writes '(not stated)' rather than an empty gap when one side is blank", () => {
    const r = carryReviewReasons({
      ...base,
      hoursChanged: { before: "", after: "0700–1900" },
      typeChanged: { before: "CWD", after: "" },
      locChanged: { before: "", after: "" },
    });
    expect(r.reasons[0]).toContain("from (not stated) to 0700–1900");
    expect(r.reasons[1]).toContain("from CWD to (not stated)");
    expect(r.reasons[2]).toContain("from (not stated) to (not stated)");
  });

  it("stacks every reason, in the order the day card prints them", () => {
    const r = carryReviewReasons({
      overlap: 0.3,
      matchedBy: "scenes",
      scenesGained: ["1/3"],
      scenesLost: ["1/1"],
      hoursChanged: { before: "a", after: "b" },
      typeChanged: { before: "c", after: "d" },
      locChanged: { before: "e", after: "f" },
    });
    expect(r.needsReview).toBe(true);
    expect(r.reasons).toHaveLength(5);
    expect(r.reasons[0]).toContain("picked up 1 scene and lost 1 scene");
    expect(r.reasons[4]).toContain("Only 30%");
  });

  it("does not flag a zero-overlap scenes match (nothing in common is not a partial match)", () => {
    expect(carryReviewReasons({ ...base, overlap: 0 }).needsReview).toBe(false);
  });
});

// ===========================================================================
// 7 · the compact, storable diff
// ===========================================================================

describe("dayChangeLabels — the words on a day card", () => {
  it("says New day for an added day", () => {
    expect(dayChangeLabels({ num: 9, unit: "Main", kind: "new" })).toEqual(["New day"]);
  });

  it("says which day number it used to be", () => {
    expect(dayChangeLabels({ num: 38, unit: "Main", kind: "changed", fromDay: 37 })).toEqual(["Was D37"]);
  });

  it("does not say Was D… when the number is unchanged", () => {
    expect(dayChangeLabels({ num: 38, unit: "Main", kind: "changed", fromDay: 38 })).toEqual([]);
  });

  it("says how far the day moved, in the right direction and number", () => {
    expect(dayChangeLabels({ num: 1, unit: "Main", kind: "changed", daysShifted: 3 })).toEqual(["3 days later"]);
    expect(dayChangeLabels({ num: 1, unit: "Main", kind: "changed", daysShifted: -1 })).toEqual(["1 day earlier"]);
  });

  it("says nothing about a shift of zero, or one that could not be worked out", () => {
    expect(dayChangeLabels({ num: 1, unit: "Main", kind: "changed", daysShifted: 0 })).toEqual([]);
    expect(dayChangeLabels({ num: 1, unit: "Main", kind: "changed", daysShifted: null })).toEqual([]);
  });

  it("names each carried-over setting that has moved underneath it", () => {
    expect(
      dayChangeLabels({
        num: 1, unit: "Main", kind: "changed",
        locBefore: "Barbican", typeBefore: "CWD", hoursBefore: "0700–1900",
      })
    ).toEqual(["New location", "Day type changed", "Hours changed"]);
  });

  it("counts the scenes gained and lost, singular and plural", () => {
    expect(dayChangeLabels({ num: 1, unit: "Main", kind: "changed", gained: ["1/3"], lost: ["1/1", "1/2"] }))
      .toEqual(["+1 scene", "−2 scenes"]);
  });

  it("is empty for a day with nothing to report", () => {
    expect(dayChangeLabels({ num: 1, unit: "Main", kind: "changed" })).toEqual([]);
  });
});

describe("sceneChangeLabel — the chip on a scene row", () => {
  it("says Added for a new scene", () => {
    expect(sceneChangeLabel({ key: "9/1", kind: "added" })).toBe("Added");
  });

  it("says where a moved scene came from", () => {
    expect(sceneChangeLabel({ key: "9/1", kind: "movedIn", fromDay: 18 })).toBe("Moved here from D18");
  });

  it("still says it moved when the old day number is unknown", () => {
    expect(sceneChangeLabel({ key: "9/1", kind: "movedIn" })).toBe("Moved here");
  });

  it("leads with the crowd change, which is the one that costs money", () => {
    expect(sceneChangeLabel({ key: "9/1", kind: "changed", crowd: { before: 20, after: 200 } }))
      .toBe("Crowd 20 → 200");
  });

  it("joins several changes with a separator", () => {
    expect(
      sceneChangeLabel({
        key: "9/1", kind: "changed",
        crowd: { before: 20, after: 200 },
        stunt: { before: 2, after: 6 },
        castAdded: ["31"], castDropped: ["24"],
      })
    ).toBe("Crowd 20 → 200 · Stunts 2 → 6 · Cast added 31 · Cast dropped 24");
  });

  it("names the old scene number for a renumbered scene", () => {
    expect(sceneChangeLabel({ key: "45", kind: "changed", newKey: "45a" })).toBe("Renumbered from 45");
  });

  it("falls back to the set change, then to a bare Changed", () => {
    expect(sceneChangeLabel({ key: "9/1", kind: "changed", slugChanged: true })).toBe("Set changed");
    expect(sceneChangeLabel({ key: "9/1", kind: "changed" })).toBe("Changed");
  });

  it("does not mention the set when there is something costlier to say", () => {
    expect(sceneChangeLabel({ key: "9/1", kind: "changed", crowd: { before: 1, after: 2 }, slugChanged: true }))
      .toBe("Crowd 1 → 2");
  });
});

const dayHeads = (d: ShootDay) => d.scenes.reduce((a, s) => a + sceneCrowdHeads(s), 0) * 100;

describe("compactRevisionDiff — a diff that survives storage", () => {
  const build = () => {
    const o = model([
      dayOf(1, "Monday 6th July 2026", [richScene("1/1", { sa: 20 }), scene("1/2")], { loc: "Barbican" }),
      // ahead of the new start — a real cut
      dayOf(2, "Wednesday 15th July 2026", [richScene("2/1", { sa: 40 })], { loc: "Soho" }),
    ]);
    const n = model([
      dayOf(1, "Wednesday 8th July 2026", [richScene("1/1", { sa: 200 }), scene("1/3")], { loc: "Silvertown" }),
      day(9, "Friday 10th July 2026", ["9/1"], "Ealing"),
    ]);
    return diffRevisions(o, n);
  };
  const sd = () =>
    compactRevisionDiff(build(), {
      prevLabel: "Blue", at: "2026-07-15T09:00:00.000Z",
      oldDayMoney: dayHeads, newDayMoney: dayHeads,
    });

  it("round-trips through JSON unchanged — it is stored on the device and on the account", () => {
    const a = sd();
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
  });

  it("contains no Dates, Maps, Sets or model objects that JSON would silently flatten", () => {
    const walk = (v: unknown, path: string): void => {
      if (v === null || typeof v !== "object") return;
      expect(v, path).not.toBeInstanceOf(Date);
      expect(v, path).not.toBeInstanceOf(Map);
      expect(v, path).not.toBeInstanceOf(Set);
      if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${path}[${i}]`));
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) walk(x, `${path}.${k}`);
    };
    walk(sd(), "sd");
  });

  it("stamps the revision it is compared against and when it was taken", () => {
    expect(sd().v).toBe(1);
    expect(sd().prevLabel).toBe("Blue");
    expect(sd().at).toBe("2026-07-15T09:00:00.000Z");
  });

  it("defaults the timestamp to now when none is given", () => {
    const at = compactRevisionDiff(build(), { prevLabel: "Blue" }).at;
    expect(Number.isNaN(Date.parse(at))).toBe(false);
  });

  it("records the changed day with its labels, review reasons and scene changes", () => {
    const d = sd().days.find((x) => x.id === "M1")!;
    expect(d.kind).toBe("changed");
    expect(d.daysShifted).toBe(2);
    expect(d.locBefore).toBe("Barbican");
    expect(d.gained).toEqual(["1/3"]);
    expect(d.lost).toEqual(["1/2"]);
    expect(d.labels).toEqual(["2 days later", "New location", "+1 scene", "−1 scene"]);
    expect(d.needsReview).toBe(true);
    expect(d.reviewReasons!.join(" ")).toContain("picked up 1 scene and lost 1 scene");
    // 1/1 slipped with its day (so it reads as a move) and also trebled its
    // crowd; 1/3 is new to the day
    // 1/1 did NOT move anywhere — it is on the day it was always on, and that
    // day slipped two days. Saying "Moved here from D1" on D1 reads as nonsense
    // to an AD, and it also hid the crowd change behind the move.
    expect(d.scenes.map((s) => s.label)).toEqual(["Day moved · Crowd 20 → 200", "Added"]);
    expect(d.scenes[0].sameDay).toBe(true);
    expect(d.scenes[0].crowd).toEqual({ before: 20, after: 200 });
  });

  it("records the added day and the scenes on it", () => {
    const d = sd().days.find((x) => x.id === "M9")!;
    expect(d.kind).toBe("new");
    expect(d.labels).toEqual(["New day"]);
    expect(d.scenes.map((s) => s.key)).toEqual(["9/1"]);
    expect(d.scenes[0].kind).toBe("added");
  });

  it("records the cut day with everything the board needs to explain it", () => {
    expect(sd().cutDays).toEqual([
      { num: 2, unit: "Main", date: "Wednesday 15th July 2026", loc: "Soho", scenes: ["2/1"], money: -4000 },
    ]);
  });

  it("records each cut scene with the crowd that went with it", () => {
    const o = model([
      day(1, "Monday 6th July 2026", ["1/1"]),
      dayOf(2, "Wednesday 15th July 2026", [richScene("2/1", { sa: 120 })], { loc: "Soho" }),
    ]);
    const n = model([day(1, "Monday 6th July 2026", ["1/1"])]);
    const s = compactRevisionDiff(diffRevisions(o, n), { prevLabel: "Blue" });
    expect(s.cutScenes).toEqual([{ key: "2/1", fromDay: 2, crowd: 120 }]);
  });

  it("counts what happened, so the strip can be rendered without the model", () => {
    expect(sd().counts).toEqual({
      daysNew: 1, daysChanged: 1, daysCut: 1, daysShot: 0,
      scenesAdded: 2, scenesMoved: 1, scenesCut: 2, scenesChanged: 1,
      crowdBefore: 60, crowdAfter: 200,
    });
  });

  it("carries the whole plain-English account, uncapped", () => {
    const g = sd().groups;
    expect(g.map((x) => x.label)).toContain("Day 1 — 8 Jul");
    expect(g.flatMap((x) => x.lines).join("\n")).toContain("crowd up from 20 to 200");
  });

  it("marks a carried already-shot day as history rather than as a new day", () => {
    const o = model([day(1, "Monday 6th July 2026", ["1/1"])]);
    const n = model([
      dayOf(1, "Monday 6th July 2026", [scene("1/1")], { carried: true, fromRev: "Blue" }),
      day(2, "Tuesday 7th July 2026", ["2/2"]),
    ]);
    // the carried day here is unmatched, so it arrives as an added day
    const s = compactRevisionDiff(
      diffRevisions(model([day(9, "Friday 10th July 2026", ["9/9"])]), n),
      { prevLabel: "Blue" }
    );
    const carried = s.days.find((d) => d.kind === "shot")!;
    expect(carried.labels).toEqual(["Already shot"]);
    expect(s.counts.daysNew).toBe(1); // the carried day is not counted as new
    void o;
  });

  it("says nothing about a day that did not change", () => {
    const mk = () => model([day(1, "Monday 6th July 2026", ["1/1"], "Barbican")]);
    const s = compactRevisionDiff(diffRevisions(mk(), mk()), { prevLabel: "Blue" });
    expect(s.days).toEqual([]);
    expect(s.groups).toEqual([]);
  });
});

describe("compactRevisionDiff — money", () => {
  const build = () => {
    const o = model([
      dayOf(1, "Monday 6th July 2026", [richScene("1/1", { sa: 20 })]),
      dayOf(2, "Wednesday 15th July 2026", [richScene("2/1", { sa: 50 })]), // cut
    ]);
    const n = model([
      dayOf(1, "Monday 6th July 2026", [richScene("1/1", { sa: 200 })]),
      dayOf(9, "Friday 10th July 2026", [richScene("9/1", { sa: 10 })]),
    ]);
    return diffRevisions(o, n);
  };
  const heads = (d: ShootDay) => d.scenes.reduce((a, s) => a + sceneCrowdHeads(s), 0) * 100;
  const sd = () =>
    compactRevisionDiff(build(), { prevLabel: "Blue", oldDayMoney: heads, newDayMoney: heads });

  it("prices a changed day as the difference between the two schedules", () => {
    expect(sd().days.find((d) => d.id === "M1")!.money).toBe(18000);
  });

  it("prices an added day as its whole cost", () => {
    expect(sd().days.find((d) => d.id === "M9")!.money).toBe(1000);
  });

  it("prices a cut day as a negative — a cut scene with 50 crowd is not the same as one with none", () => {
    expect(sd().cutDays[0].money).toBe(-5000);
  });

  it("storedDiffMoney totals the days and the cuts together", () => {
    expect(storedDiffMoney(sd())).toBe(18000 + 1000 - 5000);
  });

  it("hangs the money off the plain-English group for the day it belongs to", () => {
    expect(sd().groups.find((g) => g.dayId === "M1")!.money).toBe(18000);
  });

  it("is zero throughout when no money function is supplied", () => {
    const s = compactRevisionDiff(build(), { prevLabel: "Blue" });
    expect(storedDiffMoney(s)).toBe(0);
  });

  it("rounds to whole pounds", () => {
    const s = compactRevisionDiff(build(), {
      prevLabel: "Blue",
      oldDayMoney: () => 100.4,
      newDayMoney: () => 250.6,
    });
    expect(s.days.find((d) => d.id === "M1")!.money).toBe(150);
    expect(Number.isInteger(storedDiffMoney(s))).toBe(true);
  });
});

describe("storedDiffHeadline — one line an AD can read at arm's length", () => {
  const counts = (over: Partial<Record<string, number>> = {}) => ({
    v: 1 as const, prevLabel: "Blue", at: "", days: [], cutDays: [], cutScenes: [], groups: [],
    counts: {
      daysNew: 0, daysChanged: 0, daysCut: 0, daysShot: 0,
      scenesAdded: 0, scenesMoved: 0, scenesCut: 0, scenesChanged: 0,
      crowdBefore: 0, crowdAfter: 0, ...over,
    },
  });

  it("says so plainly when nothing about the schedule moved", () => {
    expect(storedDiffHeadline(counts())).toBe("No changes to the schedule itself.");
  });

  it("uses the singular for one of each", () => {
    expect(storedDiffHeadline(counts({ daysNew: 1, daysChanged: 1, daysCut: 1, scenesMoved: 1 })))
      .toBe("1 new day · 1 changed day · 1 dropped day · 1 scene moved");
  });

  it("uses the plural for more than one", () => {
    expect(storedDiffHeadline(counts({ daysNew: 2, scenesAdded: 3, scenesCut: 4 })))
      .toBe("2 new days · 3 scenes added · 4 scenes cut");
  });

  it("mentions no day numbers, ids or jargon", () => {
    const line = storedDiffHeadline(counts({ daysChanged: 2, scenesMoved: 5 }));
    expect(line).not.toMatch(/\bM\d|\boverlap\b|uid/i);
  });
});

describe("storedDiffByDay / storedCutByDay — the board's indexes", () => {
  const sd = () => {
    const o = model([
      dayOf(1, "Monday 6th July 2026", [scene("1/1"), scene("1/2")], { loc: "Barbican" }),
      day(2, "Wednesday 15th July 2026", ["2/1"], "Soho"),
    ]);
    const n = model([
      dayOf(1, "Monday 6th July 2026", [scene("1/1"), scene("1/3")], { loc: "Silvertown" }),
    ]);
    return compactRevisionDiff(diffRevisions(o, n), { prevLabel: "Blue" });
  };

  it("indexes each changed day under its own id", () => {
    const m = storedDiffByDay(sd());
    expect(m.get("M1")!.locBefore).toBe("Barbican");
  });

  it("indexes the scenes lost off a day that still exists, so they can be named", () => {
    expect(storedCutByDay(sd()).get("M1")).toEqual(["1/2"]);
  });

  it("holds no entry for a day that lost nothing", () => {
    const mk = () => model([dayOf(1, "Monday 6th July 2026", [scene("1/1")], { loc: "A" })]);
    const n = model([dayOf(1, "Monday 6th July 2026", [scene("1/1")], { loc: "B" })]);
    const s = compactRevisionDiff(diffRevisions(mk(), n), { prevLabel: "Blue" });
    expect(storedCutByDay(s).size).toBe(0);
  });

  it("returns empty maps for a missing diff rather than throwing on first load", () => {
    expect(storedDiffByDay(null).size).toBe(0);
    expect(storedDiffByDay(undefined).size).toBe(0);
    expect(storedCutByDay(null).size).toBe(0);
    expect(storedCutByDay(undefined).size).toBe(0);
  });

  it("still indexes correctly after a round trip through storage", () => {
    const restored = JSON.parse(JSON.stringify(sd()));
    expect(storedDiffByDay(restored).get("M1")!.labels).toEqual(storedDiffByDay(sd()).get("M1")!.labels);
    expect(storedCutByDay(restored).get("M1")).toEqual(["1/2"]);
  });
});

// ===========================================================================
// 8 · end to end — a realistic mid-shoot revision
// ===========================================================================

describe("end to end — a real Blue → Pink revision, with nothing dropped", () => {
  // Blue, issued 3 July. D3 is a genuine future day and will be cut.
  const v1 = () =>
    model([
      dayOf(1, "Monday 6th July 2026", [richScene("45", { sa: 20 }), scene("46"), scene("47")], {
        loc: "Barbican", hours: "0700–1900", type: "CWD",
      }),
      dayOf(2, "Tuesday 7th July 2026", [scene("50"), scene("51")], { loc: "Soho" }),
      dayOf(3, "Wednesday 8th July 2026", [richScene("60", { sa: 30 }), scene("61")], { loc: "Ealing" }),
    ]);
  // Pink: D1 slipped two days to Silvertown, 45 became 45A and its crowd went
  // 20 → 200, 47 moved to D2, D3 was cut and D4 was added.
  const v2 = () =>
    model([
      dayOf(1, "Wednesday 8th July 2026", [richScene("45A", { sa: 200 }), scene("46")], {
        loc: "Silvertown", hours: "0700–1900", type: "CWD",
      }),
      dayOf(2, "Thursday 9th July 2026", [scene("50"), scene("51"), scene("47")], { loc: "Soho" }),
      dayOf(4, "Friday 10th July 2026", [scene("70"), scene("71")], { loc: "Pinewood Stage 5" }),
    ]);

  const heads = (d: ShootDay) => d.scenes.reduce((a, s) => a + sceneCrowdHeads(s), 0) * 100;
  const diff = () => diffRevisions(v1(), v2());
  const sd = () =>
    compactRevisionDiff(diff(), {
      prevLabel: "Blue", at: "2026-07-15T09:00:00.000Z",
      oldDayMoney: heads, newDayMoney: heads,
    });

  it("pairs each surviving day with the day its scenes went to", () => {
    const d = diff();
    expect(d.matches.map((m) => [m.oldDay.num, m.newDay.num]).sort()).toEqual([[1, 1], [2, 2]]);
    expect(d.cutDays.map((x) => x.num)).toEqual([3]);
    expect(d.addedDays.map((x) => x.num)).toEqual([4]);
    expect(d.shotDays).toEqual([]);
  });

  it("follows scene 45 to 45A rather than cutting it and adding a stranger", () => {
    const d = diff();
    expect(d.scenes.renumbered).toMatchObject([{ oldKey: "45", newKey: "45a" }]);
    expect(d.sceneKeyMap.get("45")).toBe("45a");
    expect(d.scenes.cut.map((x) => x.key).sort()).toEqual(["60", "61"]);
    expect(d.scenes.added.map((x) => x.key).sort()).toEqual(["70", "71"]);
  });

  it("reports scene 47 moving from D1 to D2", () => {
    const move = diff().scenes.moved.find((m) => m.key === "47")!;
    expect(move.oldDay.num).toBe(1);
    expect(move.newDay.num).toBe(2);
  });

  it("reports the crowd going 20 → 200 on the renumbered scene", () => {
    const c = diff().sceneChanges.find((x) => x.key === "45")!;
    expect(c.newKey).toBe("45a");
    expect(c.crowd).toEqual({ before: 20, after: 200 });
  });

  it("every old day is accounted for — matched, cut or kept as history", () => {
    const before = v1();
    const d = diffRevisions(before, v2());
    const targets = dayCarryTargets(d);
    const accountedFor = (day: ShootDay) => {
      const plain = (day.unit || "Main") + "|" + day.num;
      return (
        targets.map.has(plain) ||
        targets.collisions.some((c) => c.from === plain) ||
        d.cutDays.includes(day) ||
        d.supersededDays.includes(day)
      );
    };
    for (const day of before.days) expect(accountedFor(day), `day ${day.num}`).toBe(true);
  });

  it("every old scene is accounted for — carried, cut or shot", () => {
    const d = diff();
    for (const key of sceneIndexAllOf(v1()).keys()) {
      const accounted =
        d.sceneKeyMap.has(key) ||
        d.scenes.cut.some((c) => c.key === key) ||
        d.scenes.shot.some((c) => c.key === key);
      expect(accounted, `scene ${key}`).toBe(true);
    }
  });

  it("sends each surviving day's work to the right new day", () => {
    const t = dayCarryTargets(diff());
    expect(t.map.get("Main|1")).toBe("Main|1");
    expect(t.map.get("Main|2")).toBe("Main|2");
    expect(t.map.has("Main|3")).toBe(false); // the cut day has no target
    expect(t.collisions).toEqual([]);
  });

  it("sends each surviving scene's work to its new day and position", () => {
    const n = v2();
    const target = (key: string) => {
      const [t] = sceneCarryTargets(n, key);
      return t ? sceneSlotKey(t.day, t.idx) : null;
    };
    expect(target("45a")).toBe("Main|1|45A||#0"); // 45's work, on its renumbered scene
    expect(target("46")).toBe("Main|1|46||#0");
    expect(target("47")).toBe("Main|2|47||#0"); //  moved day, work follows
    expect(target("50")).toBe("Main|2|50||#0");
    expect(target("60")).toBeNull(); //             genuinely cut
  });

  it("flags D1 for review, naming every carried-over setting that moved underneath it", () => {
    const d = sd().days.find((x) => x.id === "M1")!;
    expect(d.needsReview).toBe(true);
    const text = d.reviewReasons!.join("\n");
    expect(text).toContain("picked up 1 scene and lost 2 scenes");
    expect(text).toContain("The location changed from Barbican to Silvertown");
    expect(text).toContain("Only 25% of this day's scenes are the same as before");
    expect(text).not.toContain("The hours changed"); // hours did not move
    expect(d.labels).toEqual(["2 days later", "New location", "+1 scene", "−2 scenes"]);
  });

  it("flags the receiving day for the scene it picked up, and for nothing else", () => {
    const d = sd().days.find((x) => x.id === "M2")!;
    expect(d.labels).toEqual(["2 days later", "+1 scene"]);
    expect(d.needsReview).toBe(true);
    expect(d.reviewReasons).toEqual([
      "This day picked up 1 scene, so the crowd numbers may no longer be right.",
    ]);
  });

  it("prices the revision: the crowd rise, the new day and the cut day", () => {
    const s = sd();
    expect(s.days.find((d) => d.id === "M1")!.money).toBe(18000); // 20 → 200 heads
    expect(s.days.find((d) => d.id === "M4")!.money).toBe(0); //    new day, no crowd yet
    expect(s.cutDays[0].money).toBe(-3000); //                     30 heads gone
    expect(storedDiffMoney(s)).toBe(15000);
  });

  it("counts the revision the way the strip reads it", () => {
    expect(sd().counts).toEqual({
      daysNew: 1, daysChanged: 2, daysCut: 1, daysShot: 0,
      scenesAdded: 2, scenesMoved: 5, scenesCut: 2, scenesChanged: 5,
      crowdBefore: 50, crowdAfter: 200,
    });
    expect(storedDiffHeadline(sd())).toBe(
      "1 new day · 2 changed days · 1 dropped day · 5 scenes moved · 2 scenes added · 2 scenes cut"
    );
  });

  it("names the cut day and the scenes that went with it, so nothing just vanishes", () => {
    const s = sd();
    expect(s.cutDays).toEqual([
      { num: 3, unit: "Main", date: "Wednesday 8th July 2026", loc: "Ealing", scenes: ["60", "61"], money: -3000 },
    ]);
    expect(s.cutScenes).toEqual([
      { key: "60", fromDay: 3, crowd: 30 },
      { key: "61", fromDay: 3, crowd: 0 },
    ]);
    expect(storedCutByDay(s).get("M1")).toEqual(["45", "47"]);
  });

  it("survives being stored and read back — the board renders from storage, weeks later", () => {
    const s = sd();
    const restored = JSON.parse(JSON.stringify(s));
    expect(restored).toEqual(s);
    expect(storedDiffMoney(restored)).toBe(storedDiffMoney(s));
    expect(storedDiffHeadline(restored)).toBe(storedDiffHeadline(s));
    expect([...storedDiffByDay(restored).keys()]).toEqual([...storedDiffByDay(s).keys()]);
  });

  it("explains the whole revision in plain English, grouped by day", () => {
    const text = sd().groups.flatMap((g) => [g.label, ...g.lines]).join("\n");
    expect(text).toContain("Moved 2 days later, to 8 Jul.");
    expect(text).toContain("Location changed from Barbican to Silvertown.");
    expect(text).toContain("Scene 45 is now scene 45a.");
    expect(text).toContain("Scene 45 crowd up from 20 to 200 — 180 more.");
    expect(text).toContain("Scene 47 moved from Day 1 (6 Jul) to Day 2 (9 Jul).");
    expect(text).toContain("New shoot day added at Pinewood Stage 5.");
    expect(text).toContain("Day dropped from the schedule (was Ealing).");
    expect(text).not.toMatch(/…|\.\.\.|and \d+ more/); // nothing capped
  });

  it("day-level slot keys migrated before the revision still resolve afterwards", () => {
    // the user's work was filed under array positions on Blue's D1; after the
    // migration each key follows its own scene into Pink, where 47 has left
    const blueD1 = v1().days[0];
    const legacy = blueD1.scenes.map((_, i) => `Main|1|${blueD1.scenes[i].num}||${i}`);
    const migrated = applyPlan(legacy, planSlotMigration(legacy, () => blueD1));
    expect(migrated).toEqual(["Main|1|45||#0", "Main|1|46||#0", "Main|1|47||#0"]);

    const pinkD1 = v2().days[0], pinkD2 = v2().days[1];
    const resolveOn = (d: ShootDay, k: string) => {
      const [, , sNum, sPart, last] = k.split("|");
      return slotIndexOn(d, sNum, sPart, last);
    };
    expect(resolveOn(pinkD1, "Main|1|46||#0")).toBe(1); // 46 slid up, key still finds it
    expect(resolveOn(pinkD1, "Main|1|47||#0")).toBe(-1); // 47 has left D1…
    expect(resolveOn(pinkD2, "Main|2|47||#0")).toBe(2); // …and the diff points at D2
  });
});

// ===========================================================================
// KNOWN BUG — reported, not fixed (this suite does not own lib/engine/carry.ts)
// ===========================================================================

describe("compactRevisionDiff — a zero-cost cut day stores negative zero", () => {
  // carry.ts:520  `money: -Math.round(oldMoney(d))`
  // When a cut day costs nothing (or no money function was supplied) this is
  // -0, which JSON.stringify writes as `0`. The stored diff is therefore NOT
  // byte-identical after a round trip through localStorage / the account.
  // Harmless arithmetically (-0 === 0), but it breaks the "what we stored is
  // what we read back" invariant and any equality check built on it.
  it("round-trips a zero-cost cut day unchanged", () => {
    const o = model([
      day(1, "Monday 6th July 2026", ["1/1"]),
      day(2, "Wednesday 15th July 2026", ["2/1"], "Soho"),
    ]);
    const n = model([day(1, "Monday 6th July 2026", ["1/1"])]);
    const s = compactRevisionDiff(diffRevisions(o, n), { prevLabel: "Blue" });
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});

describe("slotIndexOn — a malformed legacy last segment lands on scene 0", () => {
  // carry.ts:108  `const i = +last;`
  // `+""` and `+" "` are 0, not NaN, so a truncated or corrupted five-segment
  // key ("Main|1|45||") resolves to the FIRST scene on the day instead of
  // being reported unresolved. planSlotMigration then moves that key's work
  // onto whatever scene happens to sit at the top of the day — the exact
  // silent mis-attachment the #ordinal keys exist to prevent.
  //
  // Related, same line: a fractional index ("…|1.5") passes the range check
  // and is returned as 1.5, and planSlotMigration then reads
  // `day.scenes[1.5]` (undefined) and throws on `at.num`.
  const d: SlotDay = { num: 1, scenes: [{ num: "45" }, { num: "46" }, { num: "45" }] };

  it("returns -1 for an empty or whitespace last segment", () => {
    expect(slotIndexOn(d, "45", "", "")).toBe(-1);
    expect(slotIndexOn(d, "45", "", " ")).toBe(-1);
  });

  it("returns -1 for a fractional index rather than a half-position", () => {
    expect(slotIndexOn(d, "45", "", "1.5")).toBe(-1);
  });

  it("does not throw when migrating a key with a fractional index", () => {
    expect(() => planSlotMigration(["Main|1|45||1.5"], () => d)).not.toThrow();
  });
});

describe("compactRevisionDiff — leftover scene changes attach to the wrong day", () => {
  // carry.ts:501
  //   const first = diff.sceneChanges.find((c) => dayUid(c.newDay) === dayUid(c.newDay));
  // compares a value with itself, so the predicate is always true and the
  // branch always picks sceneChanges[0] — i.e. the FIRST scene change's day —
  // rather than the day the leftover group is actually keyed under. It should
  // be comparing against the map key (the uid the group was filed under).
  //
  // Not currently reachable: the two loops above it delete every uid from
  // `byNewDay` before this runs (the `delete` happens before the `continue`),
  // and every scene change's newDay is either a matched day or an added day.
  // So today it is dead code — but if either loop ever stops draining the map,
  // it will silently file one day's scene changes under another day's id and
  // put someone else's crowd change on the wrong day card.
  it("files a leftover scene change under the day it actually happened on", () => {
    // no reachable fixture — see comment above
  });
});

// ===========================================================================
// REGRESSIONS FIXED — the migration must never destroy or re-attach work
// ===========================================================================

describe("planSlotMigration — a legacy key must never overwrite a migrated one", () => {
  // THE data-loss bug. `taken` was filled as the walk went along, so a clash
  // with an ALREADY-MIGRATED key was only noticed when that key happened to
  // come first in key order. Legacy keys are older, so in practice they came
  // first, the clash went unseen, and the caller's rename deleted the user's
  // migrated edit. Same two keys, opposite outcome, purely on key order.
  const dayA = slotDay(12, [{ num: "45" }, { num: "46" }]);
  const lookup = (u: string, n: string): SlotDay | null => (u === "Main" && n === "12" ? dayA : null);
  const legacy = "Main|12|45||0", migrated = "Main|12|45||#0";

  it("parks the legacy key on a spare ordinal whichever order the keys arrive in", () => {
    for (const keys of [[legacy, migrated], [migrated, legacy]]) {
      const plan = planSlotMigration(keys, lookup);
      expect(plan.moves, keys.join(" , ")).toEqual([{ from: legacy, to: "Main|12|45||#1" }]);
      expect(plan.collisions).toEqual([
        { from: legacy, wanted: migrated, parked: "Main|12|45||#1" },
      ]);
    }
  });

  it("keeps BOTH pieces of work in either order — nothing is silently deleted", () => {
    const a = applyPlan([legacy, migrated], planSlotMigration([legacy, migrated], lookup));
    const b = applyPlan([migrated, legacy], planSlotMigration([migrated, legacy], lookup));
    expect(new Set(a)).toEqual(new Set(["Main|12|45||#0", "Main|12|45||#1"]));
    expect(new Set(b)).toEqual(new Set(a)); // identical, non-destructive result
    expect(new Set(a).size).toBe(2);
  });
});

describe("planSlotMigration — the key's own scene beats the stored position", () => {
  // A legacy key resolved purely by array position re-attaches the edit to
  // whatever scene now sits there. Live, that was a recoverable lookup
  // artefact; migrating WRITES it into storage for good.
  it("follows the scene the key names, not the scene now at that position", () => {
    const day = slotDay(1, [{ num: "12" }, { num: "9" }]); // 9 was 1st, is now 2nd
    const plan = planSlotMigration(["Main|1|9||0"], () => day);
    expect(plan.moves).toEqual([{ from: "Main|1|9||0", to: "Main|1|9||#0" }]);
    expect(plan.guessed).toEqual([]); // no guessing was needed
  });

  it("tracks a scene reordered anywhere on the day", () => {
    const day = slotDay(1, [{ num: "12" }, { num: "13" }, { num: "9", part: "pt1" }]);
    const plan = planSlotMigration(["Main|1|9|Pt 1|0"], () => day);
    expect(plan.moves).toEqual([{ from: "Main|1|9|Pt 1|0", to: "Main|1|9|pt1|#0" }]);
    expect(plan.guessed).toEqual([]);
  });

  it("falls back to the position when the scene has genuinely gone, and reports it", () => {
    const day = slotDay(1, [{ num: "12" }, { num: "13" }]);
    const plan = planSlotMigration(["Main|1|9||0"], () => day);
    expect(plan.moves).toEqual([{ from: "Main|1|9||0", to: "Main|1|12||#0" }]);
    expect(plan.guessed).toEqual([
      { from: "Main|1|9||0", to: "Main|1|12||#0", wantedScene: "9", usedScene: "12" },
    ]);
  });

  it("gives two edits on a twice-listed scene one ordinal each, not the same one", () => {
    const day = slotDay(1, [{ num: "9" }, { num: "12" }, { num: "9" }]);
    const plan = planSlotMigration(["Main|1|9||0", "Main|1|9||2"], () => day);
    expect(plan.moves.map((m) => m.to)).toEqual(["Main|1|9||#0", "Main|1|9||#1"]);
    expect(plan.collisions).toEqual([]);
    expect(plan.guessed).toEqual([]);
  });

  it("is still idempotent, and still leaves other productions alone", () => {
    const day = slotDay(1, [{ num: "12" }, { num: "9" }]);
    const keys = ["p1|Main|1|9||0", "p2|Main|1|9||0"];
    const plan = planSlotMigration(keys, () => day, { prefix: "p1|" });
    const once = applyPlan(keys, plan);
    expect(once).toEqual(["p1|Main|1|9||#0", "p2|Main|1|9||0"]);
    expect(planSlotMigration(once, () => day, { prefix: "p1|" }).moves).toEqual([]);
  });
});

// ===========================================================================
// A shot day whose number the new schedule reuses
// ===========================================================================

/** Blue: D12 shot on 1 Jul, D13 still ahead. Pink starts on 10 Jul and reuses
 *  day number 12 for a completely different day. */
const blueRev = () =>
  model([
    dayOf(12, "Wednesday 1st July 2026", [richScene("100", { sa: 10 })], { loc: "Woolwich" }),
    dayOf(13, "Friday 10th July 2026", [richScene("1/1", { sa: 5 })], { loc: "Soho" }),
  ]);
const pinkRawDays = () => [
  dayOf(12, "Sunday 12th July 2026", [richScene("5/1", { sa: 20 })], { loc: "Ealing" }),
  dayOf(13, "Friday 10th July 2026", [richScene("1/1", { sa: 5 })], { loc: "Soho" }),
];

describe("a carried, collided shot day keeps its own identity end to end", () => {
  const diff = () => diffRevisions(blueRev(), model(pinkRawDays()));

  it("is classified as a collision, not as a cut", () => {
    const d = diff();
    expect(d.collisions.map((x) => x.num)).toEqual([12]);
    expect(d.cutDays).toEqual([]);
  });

  it("prepModel PRESERVES the suffixed id instead of rebuilding it from the day number", () => {
    const recs = carriedDayRecords(diff(), "Blue");
    expect(recs.map((r) => r.id)).toEqual(["M12-Blue"]);
    const stitched = prepModel(
      JSON.parse(JSON.stringify({ days: [...recs, ...pinkRawDays()], castMap: {}, notes: [] })),
      "Main"
    );
    expect(stitched.days.map((d) => d.id)).toEqual(["M12-Blue", "M12", "M13"]);
    expect(new Set(stitched.days.map((d) => d._uid)).size).toBe(3);
    expect(stitched.days[0].carried).toBe(true);
    expect(stitched.days[0].collided).toBe(true);
  });

  it("costs each day exactly once — the day column foots to the grand total", () => {
    const recs = carriedDayRecords(diff(), "Blue");
    const stitched = prepModel(
      JSON.parse(JSON.stringify({ days: [...recs, ...pinkRawDays()], castMap: {}, notes: [] })),
      "Main"
    );
    const costs = computeCrowdCosts(stitched);
    // three day rows, not two: the shot day is not swallowed by the live D12
    expect(Object.keys(costs.perDay).sort()).toEqual(["M12", "M12-Blue", "M13"]);
    const column = Object.values(costs.perDay).reduce((a, e) => a + e.cost, 0);
    expect(Math.round(column * 100) / 100).toBe(costs.grand);
    // and the heads are each day's own, not one day's twice
    expect(costs.perDay["M12-Blue"].sa).toBe(10);
    expect(costs.perDay["M12"].sa).toBe(20);
  });

  it("carries the shot day's own day-level work to its suffixed identity", () => {
    const t = dayCarryTargets(diff(), [], { fromRev: "Blue" });
    expect(t.map.get("Main|12")).toBe("Main|12-Blue");
    expect(t.collisions).toEqual([]);
    // and that identity is the same one the stitched record is filed under
    expect(carriedDayId({ id: "M12" }, "Blue")).toBe("M12-Blue");
  });

  it("says in plain English that the day is kept, and under what", () => {
    const text = describeRevision(diff()).flatMap((g) => g.lines).join("\n");
    expect(text).toContain("Already shot, and the new schedule reuses day number 12");
  });
});

describe("compactRevisionDiff — money follows the day RECORD, not its number", () => {
  // describeRevision groups by the record's uid; the money join used `id`
  // (unit+number), so on a stitched model holding two days numbered 12 both
  // groups were handed the FIRST match's money.
  const build = () => {
    const oldM = model([
      dayOf(12, "Monday 6th July 2026", [richScene("1/1", { sa: 10 })], { loc: "Soho" }),
      dayOf(13, "Tuesday 7th July 2026", [richScene("2/1", { sa: 10 })], { loc: "Ealing" }),
    ]);
    const newM = model([
      dayOf(12, "Monday 6th July 2026", [richScene("1/1", { sa: 100 })], { loc: "Soho" }),
      dayOf(12, "Tuesday 7th July 2026", [richScene("2/1", { sa: 10 })], { loc: "Ealing" }),
    ]);
    return diffRevisions(oldM, newM);
  };
  const sd = () =>
    compactRevisionDiff(build(), {
      prevLabel: "Blue",
      oldDayMoney: (d) => d.scenes.reduce((a, s) => a + sceneCrowdHeads(s), 0) * 100,
      newDayMoney: (d) => d.scenes.reduce((a, s) => a + sceneCrowdHeads(s), 0) * 100,
    });

  it("gives each day record its own money even when two share a day number", () => {
    const s = sd();
    expect(s.days.map((d) => d.money)).toEqual([9000, 0]);
    // Both records are numbered 12. They used to report the same id "M12" and
    // only the uid told them apart; prepModel now suffixes the second as well.
    expect(s.days.map((d) => d.id)).toEqual(["M12", "M12-MAIN"]);
    expect(new Set(s.days.map((d) => d.uid)).size).toBe(2);
    const withMoney = s.groups.filter((g) => g.money);
    expect(withMoney).toHaveLength(1);
    expect(withMoney[0].money).toBe(9000);
    expect(withMoney[0].label).toContain("Day 12");
  });

  it("still survives storage — the uid round-trips with everything else", () => {
    const s = sd();
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});

describe("a scene that slipped with its own day is not described as having moved", () => {
  const build = () =>
    diffRevisions(
      model([dayOf(1, "Monday 6th July 2026", [richScene("45", { sa: 20 })])]),
      model([dayOf(1, "Wednesday 8th July 2026", [richScene("45", { sa: 20 })])])
    );

  it("says the DAY moved, in the plain-English account", () => {
    const text = describeRevision(build()).flatMap((g) => g.lines).join("\n");
    expect(text).toContain("Scene 45 stays on Day 1, which moved from 6 Jul to 8 Jul.");
    expect(text).not.toContain("moved from Day 1 (6 Jul) to Day 1");
  });

  it("labels the board chip accurately, and keeps saying what else changed", () => {
    expect(sceneChangeLabel({ key: "45", kind: "movedIn", fromDay: 1, sameDay: true })).toBe(
      "Day moved"
    );
    expect(
      sceneChangeLabel({
        key: "45", kind: "movedIn", fromDay: 1, sameDay: true,
        crowd: { before: 20, after: 200 },
      })
    ).toBe("Day moved · Crowd 20 → 200");
    // a genuine move still reads as one
    expect(sceneChangeLabel({ key: "45", kind: "movedIn", fromDay: 2 })).toBe("Moved here from D2");
  });
});

describe("cdayKey — a collided already-shot day keeps its own settings", () => {
  // A collided day is stitched back in under the SAME unit and number as a live
  // day in the new schedule — that reuse is exactly what made it a collision.
  // Sharing one config key priced the shot day with the live day's crowd
  // numbers and dropped one of the two out of the day column entirely.
  it("suffixes a collided day with the revision it was shot under", () => {
    expect(cdayKey({ unit: "Main", num: 12 })).toBe("Main|12");
    expect(cdayKey({ unit: "Main", num: 12, collided: true, fromRev: "Blue" })).toBe("Main|12-Blue");
  });

  it("keeps the live day and the collided day on separate keys", () => {
    const live = { unit: "Main", num: 12 };
    const shot = { unit: "Main", num: 12, collided: true, fromRev: "Blue Pages" };
    expect(cdayKey(shot)).not.toBe(cdayKey(live));
    expect(cdayKey(shot)).toBe("Main|12-BluePages");
  });

  it("matches the identity carriedDayId stitches the day in under", () => {
    const shot = { id: "M12", unit: "Main", num: 12, collided: true, fromRev: "Blue" };
    expect(cdayKey(shot).split("|")[1]).toBe(carriedDayId(shot, "").replace(/^M/, ""));
  });
});

// ---------------------------------------------------------------------------
// The key that has to MEET the index
// ---------------------------------------------------------------------------
//
// Regression origin (FML, August 2026): carrySceneKey joined a scene's number
// and part with nothing between them ("875/7") while sceneIndexAllOf — the
// index it is used to look work up in — files scenes under the engine's
// sceneKey ("87pt5/7"). The two could never meet, so on every revision every
// scene with a part number found no target and its crowd work was stranded.
// Silent, and about half the scenes on a schedule that splits parts.
describe("carrySceneKey", () => {
  it("produces the same key sceneIndexAllOf files a scene under", () => {
    const cases: [string, string][] = [
      ["87", "5/7"], ["55", "15/29"], ["10", "1"], ["2", "3/3"], ["43", ""],
    ];
    for (const [num, part] of cases) {
      expect(carrySceneKey(num, part)).toBe(sceneKey({ num, part }));
    }
    // and the value itself is the joined form, not the old concatenation
    expect(carrySceneKey("87", "5/7")).toBe("87pt5/7");
  });

  it("finds a part-numbered scene's work in the next revision", () => {
    const sc = (num: string, part = "") => ({
      num, part, ie: "INT", slug: "", tod: "", scriptDay: "", pages: "",
      unit: "Main", desc: "", sa: 0, veh: 0, pod: false, cast: [], tags: [],
    });
    const next: ScheduleModel = {
      days: [{ num: 9, date: "", sr: "", ss: "", loc: "", hours: "", type: "",
               cams: "", pages: "", unit: "Main", scenes: [sc("87", "5/7")] }],
      castMap: {}, notes: [],
    };
    // the schedule moved 87pt5/7 from day 2 to day 9 — the work must follow
    const hits = sceneCarryTargets(next, carrySceneKey("87", "5/7"));
    expect(hits).toHaveLength(1);
    expect(hits[0].day.num).toBe(9);
  });
});
