// Carrying the user's work across a revision, and describing what changed in a
// shape the board can render straight from storage.
//
// Everything here is PURE — no DOM, no stores, no engine mutation — so the
// rules that decide "does this edit follow that scene?" and "did this day
// change enough that its frozen crowd numbers are now a guess?" can be tested
// on their own. lib/board/app.js owns the stores; this file owns the thinking.
//
// Three jobs:
//  1. SCENE SLOT KEYS. Per-scene work used to be filed under the scene's ARRAY
//     POSITION on its day. Insert one scene at the top of a day and every edit
//     below it silently re-attached to the wrong scene — invisible, plausible,
//     and wrong in money. Slots are keyed on the scene itself now, with an
//     occurrence ordinal only where one day genuinely lists the same scene
//     twice.
//  2. CARRY TARGETS. Where each old day's / old scene's work lands in the new
//     revision, with every collision reported instead of one side being
//     dropped on the floor.
//  3. A COMPACT, STORABLE DIFF. The board has to show what changed days and
//     weeks after the import, on any device, so the diff is reduced to plain
//     JSON (ids, numbers and sentences) and stored with the revision.

import type { Scene, ScheduleModel, ShootDay } from "./types";
import { sceneKey } from "./merge";
import {
  dayUid,
  sceneIndexAllOf,
  sceneCrowdHeads,
  sceneStuntHeads,
  describeRevision,
  carriedDaySuffix,
} from "./revise";
import type { DayMatch, RevisionDiff } from "./revise";

// ---------------------------------------------------------------------------
// 1 · scene slot keys
// ---------------------------------------------------------------------------

/** A day, as far as slot keying is concerned. */
export interface SlotDay {
  unit?: string;
  num: number | string;
  scenes: { num?: string; part?: string }[];
}

/** The normalised scene identity used inside a slot key — the same
 *  normalisation engine sceneKey uses, so "10 Pt 1" and "10pt1" are one scene. */
export function slotSceneKey(num?: string, part?: string): string {
  return ((num || "") + (part || "")).toLowerCase().replace(/[\s.]+/g, "");
}

/** How many EARLIER scenes on this day carry the same scene identity. Almost
 *  always 0; only a day that genuinely lists a scene twice goes further. */
export function sceneOrdinal(day: SlotDay, idx: number): number {
  const me = slotSceneKey(day.scenes[idx]?.num, day.scenes[idx]?.part);
  let n = 0;
  for (let i = 0; i < idx && i < day.scenes.length; i++)
    if (slotSceneKey(day.scenes[i].num, day.scenes[i].part) === me) n++;
  return n;
}

/** The last segment of a scene slot key. `#0` for the ordinary case. */
export function slotSuffix(ord: number): string {
  return "#" + (ord || 0);
}

/**
 * The stable, position-independent key for one scene's work on one day:
 *   unit | day number | scene number | scene part | #occurrence
 * Shape-compatible with the old `unit|num|scene|part|index` key (still five
 * segments) so every reader that splits on "|" keeps working; only the last
 * segment changed meaning, and it is marked with "#" so the two can never be
 * confused.
 */
export function sceneSlotKey(day: SlotDay, idx: number): string {
  const s = day.scenes[idx] || {};
  return [
    day.unit || "Main",
    day.num,
    s.num || "",
    s.part || "",
    slotSuffix(sceneOrdinal(day, idx)),
  ].join("|");
}

/** True for a key still filed under an array position. */
export function isLegacySlotKey(key: string): boolean {
  const seg = key.split("|");
  if (seg.length !== 5) return false;
  const last = seg[4];
  return last !== "DAY" && !last.startsWith("#");
}

/** Resolve a slot key's last segment back to a scene index on a day.
 *  Handles both the new `#ord` form and the legacy array index. Returns -1
 *  when nothing on the day answers to it. */
export function slotIndexOn(day: SlotDay, num: string, part: string, last: string): number {
  if (last.startsWith("#")) {
    const want = +last.slice(1) || 0;
    const k = slotSceneKey(num, part);
    let seen = 0;
    for (let i = 0; i < day.scenes.length; i++) {
      if (slotSceneKey(day.scenes[i].num, day.scenes[i].part) !== k) continue;
      if (seen === want) return i;
      seen++;
    }
    return -1;
  }
  // A legacy key's last segment is an array position. Anything that is not a
  // plain whole number is a corrupted key, NOT position 0 — resolving it to the
  // first scene on the day would silently move someone's work onto the wrong
  // scene, which is the exact failure the ordinal scheme exists to prevent.
  if (!/^\d+$/.test(last.trim())) return -1;
  const i = +last;
  if (!Number.isInteger(i) || i < 0 || i >= day.scenes.length) return -1;
  return i;
}

export interface SlotMigration {
  from: string;
  to: string;
}
export interface SlotMigrationPlan {
  moves: SlotMigration[];
  /** keys whose day/scene no longer exists — left exactly where they are */
  unresolved: string[];
  /** two legacy keys that would land on one new key; the LATER one is kept
   *  under a spare ordinal rather than being overwritten */
  collisions: { from: string; wanted: string; parked: string }[];
  /** legacy keys whose OWN scene number is nowhere on the day any more, so the
   *  scene now sitting at the stored position was used instead. That is a
   *  guess, and it is the one case where migrating can attach work to a
   *  different scene — so it is reported, in plain English, for the user. */
  guessed: { from: string; to: string; wantedScene: string; usedScene: string }[];
}

/** Every position on the day that IS the scene this key names. */
function identityMatches(day: SlotDay, num: string, part: string): number[] {
  const want = slotSceneKey(num, part);
  if (!want) return [];
  const out: number[] = [];
  for (let i = 0; i < day.scenes.length; i++)
    if (slotSceneKey(day.scenes[i].num, day.scenes[i].part) === want) out.push(i);
  return out;
}

const sceneLabelOf = (s: { num?: string; part?: string } | undefined) =>
  ((s?.num || "") + (s?.part ? " " + s.part : "")).trim();

/**
 * Rewrite an existing store's position-keyed entries onto scene slot keys.
 *
 * `lookup(unit, num)` returns the day those keys belong to, or null. Keys are
 * left alone when the day is unknown (a schedule that isn't loaded) — nothing
 * is ever thrown away on an upgrade.
 */
export function planSlotMigration(
  keys: string[],
  lookup: (unit: string, num: string) => SlotDay | null,
  opts?: { prefix?: string }
): SlotMigrationPlan {
  const prefix = opts?.prefix || "";
  const plan: SlotMigrationPlan = { moves: [], unresolved: [], collisions: [], guessed: [] };
  const taken = new Set<string>();
  // FIRST PASS. Every key that is ALREADY in the new form is claimed before a
  // single move is planned. Building this set as we walked the list meant a
  // collision was only seen when the new-form key happened to come first in
  // key order — and legacy keys, being older, normally come first. A device
  // that had already migrated then re-merged an un-migrated blob and the
  // legacy key overwrote the migrated one: a user's edit, silently deleted.
  for (const key of keys) {
    if (prefix && !key.startsWith(prefix)) continue;
    const plain = prefix ? key.slice(prefix.length) : key;
    if (!isLegacySlotKey(plain)) taken.add(key);
  }
  for (const key of keys) {
    if (prefix && !key.startsWith(prefix)) continue;
    const plain = prefix ? key.slice(prefix.length) : key;
    if (!isLegacySlotKey(plain)) continue;
    const [unit, num, sNum, sPart, last] = plain.split("|");
    const day = lookup(unit, num);
    if (!day) {
      plan.unresolved.push(key);
      continue;
    }
    const posIdx = slotIndexOn(day, sNum, sPart, last);
    // The key's OWN scene number is the better evidence of what the user was
    // editing. Resolving purely by array position rebinds the edit to whatever
    // scene now sits there — and unlike the old live lookup, migration WRITES
    // that mistake into storage, permanently. So: an occurrence of the scene
    // the key names wins; the stored position only decides WHICH occurrence,
    // and is a last resort when the scene has genuinely gone.
    const own = identityMatches(day, sNum, sPart);
    let idx = -1;
    let guessedFrom = "";
    if (own.length) {
      idx = own.includes(posIdx)
        ? posIdx
        : own.find(
            (i) =>
              !taken.has(
                prefix +
                  [unit, num, day.scenes[i].num || "", day.scenes[i].part || "", slotSuffix(sceneOrdinal(day, i))].join("|")
              )
          ) ?? own[0];
    } else if (posIdx >= 0) {
      idx = posIdx;
      guessedFrom = sceneLabelOf({ num: sNum, part: sPart }) || "(not stated)";
    }
    if (idx < 0) {
      plan.unresolved.push(key);
      continue;
    }
    const at = day.scenes[idx];
    let ord = sceneOrdinal(day, idx);
    let want = prefix + [unit, num, at.num || "", at.part || "", slotSuffix(ord)].join("|");
    if (taken.has(want)) {
      const wanted = want;
      // park it on the next free ordinal instead of silently overwriting
      let spare = ord + 1;
      while (taken.has(prefix + [unit, num, at.num || "", at.part || "", slotSuffix(spare)].join("|")))
        spare++;
      want = prefix + [unit, num, at.num || "", at.part || "", slotSuffix(spare)].join("|");
      plan.collisions.push({ from: key, wanted, parked: want });
    }
    taken.add(want);
    if (guessedFrom)
      plan.guessed.push({
        from: key,
        to: want,
        wantedScene: guessedFrom,
        usedScene: sceneLabelOf(at) || "(not stated)",
      });
    if (want !== key) plan.moves.push({ from: key, to: want });
  }
  return plan;
}

// ---------------------------------------------------------------------------
// 2 · carry targets
// ---------------------------------------------------------------------------

export interface DayTargetPlan {
  /** old "unit|num" → new "unit|num" */
  map: Map<string, string>;
  /** two old days whose work wants the same new day. The best-matched one
   *  wins; the rest are reported so the user is told, never silently dropped. */
  collisions: { from: string; to: string; heldBy: string }[];
}

/**
 * Where each old day's day-level work should land.
 *
 * Matched days follow their content. Already-shot days keep their own number
 * (they are stitched into the new revision unchanged). Hand-added days keep
 * theirs too. A target claimed twice is reported rather than overwritten.
 *
 * An already-shot day whose NUMBER the new schedule reuses for a different day
 * is stitched in by carriedDayRecords under a suffixed identity (`Main|12` →
 * `Main|12-Blue`), so its day-level work is carried to that same suffixed
 * identity. Without this the day arrived on the board with its calculator,
 * stunt hours and travel band blank — a shot day that had been fully costed
 * suddenly costing nothing.
 */
export function dayCarryTargets(
  diff: Pick<RevisionDiff, "matches" | "shotDays" | "collisions">,
  manualPlains?: string[],
  opts?: { fromRev?: string }
): DayTargetPlan {
  const plain = (d: ShootDay) => (d.unit || "Main") + "|" + d.num;
  const map = new Map<string, string>();
  const owner = new Map<string, string>();
  const out: DayTargetPlan = { map, collisions: [] };
  const claim = (from: string, to: string) => {
    if (map.has(from)) return; // an old day only ever has one target
    const held = owner.get(to);
    if (held !== undefined && held !== from) {
      out.collisions.push({ from, to, heldBy: held });
      return;
    }
    owner.set(to, from);
    map.set(from, to);
  };
  // best overlap first, so the strongest pairing owns a contested target
  for (const m of [...diff.matches].sort((a, b) => b.overlap - a.overlap))
    claim(plain(m.oldDay), plain(m.newDay));
  for (const d of diff.shotDays) claim(plain(d), plain(d));
  for (const d of diff.collisions || [])
    claim(plain(d), plain(d) + "-" + carriedDaySuffix(d, opts?.fromRev || ""));
  for (const p of manualPlains || []) claim(p, p);
  return out;
}

/**
 * Every place one old scene's work could land in the new revision, best first.
 *
 * "Best" is the instance the user is about to work on: a live, still-to-shoot
 * day beats a carried already-shot day. Binding to the historical day instead
 * left the upcoming instance blank, which reads as "nobody has broken this
 * scene down yet" on a scene that has in fact been fully broken down.
 */
export function sceneCarryTargets(
  newModel: ScheduleModel,
  key: string
): { day: ShootDay; scene: Scene; idx: number }[] {
  const all = sceneIndexAllOf(newModel).get(key) || [];
  const rank = (o: { day: ShootDay }) => (o.day.carried ? 1 : 0);
  return [...all].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.day._date?.getTime() || 0) - (b.day._date?.getTime() || 0) ||
      (+a.day.num || 0) - (+b.day.num || 0)
  );
}

// ---------------------------------------------------------------------------
// 3 · is the carried day config still trustworthy?
// ---------------------------------------------------------------------------

export interface CarryReview {
  needsReview: boolean;
  /** plain-English reasons, ready to print on the day card */
  reasons: string[];
}

/**
 * A day's frozen crowd numbers, call/wrap and travel band were confirmed
 * against the OLD day. Carrying them onto a day matched at as little as 15%
 * scene overlap prices a different day's work as if someone had checked it.
 * Say which of the things they were based on has since moved.
 */
export function carryReviewReasons(m: {
  overlap: number;
  matchedBy?: DayMatch["matchedBy"];
  scenesGained: string[];
  scenesLost: string[];
  hoursChanged: { before: string; after: string } | null;
  typeChanged: { before: string; after: string } | null;
  locChanged: { before: string; after: string } | null;
}): CarryReview {
  const reasons: string[] = [];
  if (m.scenesGained.length || m.scenesLost.length) {
    const bits: string[] = [];
    if (m.scenesGained.length)
      bits.push(`picked up ${m.scenesGained.length} scene${m.scenesGained.length === 1 ? "" : "s"}`);
    if (m.scenesLost.length)
      bits.push(`lost ${m.scenesLost.length} scene${m.scenesLost.length === 1 ? "" : "s"}`);
    reasons.push(`This day ${bits.join(" and ")}, so the crowd numbers may no longer be right.`);
  }
  if (m.hoursChanged)
    reasons.push(
      `The hours changed from ${m.hoursChanged.before || "(not stated)"} to ${m.hoursChanged.after || "(not stated)"}, so the call and wrap times here are the old ones.`
    );
  if (m.typeChanged)
    reasons.push(
      `The day type changed from ${m.typeChanged.before || "(not stated)"} to ${m.typeChanged.after || "(not stated)"}.`
    );
  if (m.locChanged)
    reasons.push(
      `The location changed from ${m.locChanged.before || "(not stated)"} to ${m.locChanged.after || "(not stated)"}, so the travel band and the address here are the old ones.`
    );
  if (m.matchedBy && m.matchedBy !== "scenes")
    reasons.push(`This day lists no scenes, so it was matched to the previous schedule by ${m.matchedBy}.`);
  else if (m.overlap > 0 && m.overlap < 0.5)
    reasons.push(
      `Only ${Math.round(m.overlap * 100)}% of this day's scenes are the same as before, so it is only a partial match.`
    );
  return { needsReview: reasons.length > 0, reasons };
}

// ---------------------------------------------------------------------------
// 4 · the compact, storable diff
// ---------------------------------------------------------------------------

export interface StoredSceneChange {
  key: string;
  /** added — new to the schedule · movedIn — was on another day · changed */
  kind: "added" | "movedIn" | "changed";
  fromDay?: number | string;
  fromDate?: string;
  /** true when the "move" is the scene's own DAY slipping to a new date — the
   *  scene is still on the day it was on, so it must not be announced as
   *  having moved here from somewhere. */
  sameDay?: boolean;
  newKey?: string;
  crowd?: { before: number; after: number };
  stunt?: { before: number; after: number };
  castAdded?: string[];
  castDropped?: string[];
  slugChanged?: boolean;
  /** short label for the board chip */
  label: string;
}

export interface StoredDayChange {
  id: string;
  /** the day RECORD's own unique id. `id` is only unit+number, so a stitched
   *  model can hold two days that share it; anything joining a day to its
   *  money or its change list must use this. */
  uid?: string;
  num: number | string;
  unit: string;
  kind: "new" | "changed" | "shot";
  fromDay?: number | string;
  daysShifted?: number | null;
  locBefore?: string;
  typeBefore?: string;
  hoursBefore?: string;
  gained?: string[];
  lost?: string[];
  overlap?: number;
  matchedBy?: string;
  needsReview?: boolean;
  reviewReasons?: string[];
  /** money this day moved by, in whole pounds, if it could be worked out */
  money?: number;
  /** the board chips, already worded */
  labels: string[];
  scenes: StoredSceneChange[];
}

export interface StoredRevisionDiff {
  v: 1;
  /** the revision this one is being compared against */
  prevLabel: string;
  at: string;
  days: StoredDayChange[];
  cutDays: { num: number | string; unit: string; date: string; loc: string; scenes: string[]; money?: number }[];
  cutScenes: { key: string; fromDay: number | string; crowd: number }[];
  /** the full plain-English account, grouped by day, uncapped */
  groups: { label: string; dayId?: string; dayUid?: string; lines: string[]; money?: number }[];
  counts: {
    daysNew: number;
    daysChanged: number;
    daysCut: number;
    daysShot: number;
    scenesAdded: number;
    scenesMoved: number;
    scenesCut: number;
    scenesChanged: number;
    crowdBefore: number;
    crowdAfter: number;
  };
  money?: { before: number; after: number };
}

const plural = (n: number, one: string, many?: string) =>
  n + " " + (n === 1 ? one : many || one + "s");

/** The chips shown on a day card. Every one of them is a WORD, never a colour
 *  on its own — an AD scanning on an iPad in daylight has no colour budget. */
export function dayChangeLabels(d: Omit<StoredDayChange, "labels" | "scenes" | "id">): string[] {
  const out: string[] = [];
  if (d.kind === "new") out.push("New day");
  if (d.fromDay != null && String(d.fromDay) !== String(d.num)) out.push(`Was D${d.fromDay}`);
  if (d.daysShifted)
    out.push(
      `${Math.abs(d.daysShifted)} ${Math.abs(d.daysShifted) === 1 ? "day" : "days"} ${d.daysShifted > 0 ? "later" : "earlier"}`
    );
  if (d.locBefore != null) out.push("New location");
  if (d.typeBefore != null) out.push("Day type changed");
  if (d.hoursBefore != null) out.push("Hours changed");
  if (d.gained && d.gained.length) out.push(`+${plural(d.gained.length, "scene")}`);
  if (d.lost && d.lost.length) out.push(`−${plural(d.lost.length, "scene")}`);
  return out;
}

export function sceneChangeLabel(c: Omit<StoredSceneChange, "label">): string {
  if (c.kind === "added") return "Added";
  if (c.kind === "movedIn" && !c.sameDay)
    return c.fromDay != null ? `Moved here from D${c.fromDay}` : "Moved here";
  const bits: string[] = [];
  // the scene did not move — its day did, and it went with it
  if (c.kind === "movedIn") bits.push("Day moved");
  if (c.crowd) bits.push(`Crowd ${c.crowd.before} → ${c.crowd.after}`);
  if (c.stunt) bits.push(`Stunts ${c.stunt.before} → ${c.stunt.after}`);
  if (c.castAdded && c.castAdded.length) bits.push(`Cast added ${c.castAdded.join(", ")}`);
  if (c.castDropped && c.castDropped.length) bits.push(`Cast dropped ${c.castDropped.join(", ")}`);
  if (c.newKey) bits.push(`Renumbered from ${c.key}`);
  if (!bits.length && c.slugChanged) bits.push("Set changed");
  return bits.join(" · ") || "Changed";
}

/**
 * Reduce a live RevisionDiff to plain JSON that can sit next to the model,
 * survive a reload and a sync, and still drive every marker on the board.
 *
 * `money(day)` is optional; when supplied it is asked for each day's cost in
 * the old and the new schedule so a cut scene carrying 200 supporting artists
 * cannot read the same as a cut scene carrying none.
 */
export function compactRevisionDiff(
  diff: RevisionDiff,
  opts: {
    prevLabel: string;
    at?: string;
    oldDayMoney?: (d: ShootDay) => number;
    newDayMoney?: (d: ShootDay) => number;
  }
): StoredRevisionDiff {
  const at = opts.at || new Date().toISOString();
  const oldMoney = opts.oldDayMoney || (() => 0);
  const newMoney = opts.newDayMoney || (() => 0);

  // scene content changes hang off the day the scene now shoots on
  const byNewDay = new Map<string, StoredSceneChange[]>();
  const push = (uid: string, c: StoredSceneChange) =>
    byNewDay.set(uid, [...(byNewDay.get(uid) || []), c]);

  for (const c of diff.sceneChanges) {
    const rec: Omit<StoredSceneChange, "label"> = {
      key: c.key,
      kind: c.moved ? "movedIn" : "changed",
      ...(c.moved
        ? {
            fromDay: c.oldDay.num,
            fromDate: c.oldDay.date,
            // still the same shoot day — the DAY moved, not the scene
            ...(c.oldDay.num === c.newDay.num &&
            (c.oldDay.unit || "Main") === (c.newDay.unit || "Main")
              ? { sameDay: true }
              : {}),
          }
        : {}),
      ...(c.newKey ? { newKey: c.newKey } : {}),
      ...(c.crowd ? { crowd: c.crowd } : {}),
      ...(c.stuntChanged ? { stunt: c.stuntChanged } : {}),
      ...(c.castAdded.length ? { castAdded: c.castAdded } : {}),
      ...(c.castDropped.length ? { castDropped: c.castDropped } : {}),
      ...(c.slugChanged ? { slugChanged: true } : {}),
    };
    // a scene that moved AND changed says both; the chip leads with the move
    push(dayUid(c.newDay), { ...rec, label: sceneChangeLabel(rec) });
  }
  for (const a of diff.scenes.added) {
    const rec: Omit<StoredSceneChange, "label"> = { key: a.key, kind: "added" };
    push(dayUid(a.day), { ...rec, label: sceneChangeLabel(rec) });
  }

  const days: StoredDayChange[] = [];
  for (const m of diff.matches) {
    const review = carryReviewReasons(m);
    const changed =
      m.renumbered ||
      m.dateMoved ||
      !!m.locChanged ||
      !!m.typeChanged ||
      !!m.hoursChanged ||
      m.scenesGained.length > 0 ||
      m.scenesLost.length > 0;
    const scenes = byNewDay.get(dayUid(m.newDay)) || [];
    byNewDay.delete(dayUid(m.newDay));
    if (!changed && !scenes.length) continue;
    const core = {
      num: m.newDay.num,
      unit: m.newDay.unit || "Main",
      kind: "changed" as const,
      ...(m.renumbered ? { fromDay: m.oldDay.num } : {}),
      daysShifted: m.daysShifted,
      ...(m.locChanged ? { locBefore: m.locChanged.before } : {}),
      ...(m.typeChanged ? { typeBefore: m.typeChanged.before } : {}),
      ...(m.hoursChanged ? { hoursBefore: m.hoursChanged.before } : {}),
      ...(m.scenesGained.length ? { gained: m.scenesGained } : {}),
      ...(m.scenesLost.length ? { lost: m.scenesLost } : {}),
      overlap: m.overlap,
      matchedBy: m.matchedBy,
      needsReview: review.needsReview,
      reviewReasons: review.reasons,
      money: Math.round(newMoney(m.newDay) - oldMoney(m.oldDay)),
    };
    days.push({ id: m.newDay.id || "", uid: dayUid(m.newDay), ...core, labels: dayChangeLabels(core), scenes });
  }
  for (const d of diff.addedDays) {
    const scenes = byNewDay.get(dayUid(d)) || [];
    byNewDay.delete(dayUid(d));
    const core = {
      num: d.num,
      unit: d.unit || "Main",
      kind: (d.carried ? "shot" : "new") as "new" | "shot",
      money: Math.round(newMoney(d)),
    };
    days.push({
      id: d.id || "",
      uid: dayUid(d),
      ...core,
      labels: d.carried ? ["Already shot"] : dayChangeLabels(core as any),
      scenes,
    });
  }
  // scene changes that landed on a day with no other news
  for (const [uid, scenes] of byNewDay) {
    // Attribute the group to the day it is actually keyed under. Comparing a
    // day against itself here filed every leftover group under the first
    // change's day, which would report one day's crowd changes on another.
    const first = diff.sceneChanges.find((c) => dayUid(c.newDay) === uid);
    const d = first ? first.newDay : null;
    if (!d) continue;
    days.push({
      id: d.id || "",
      uid,
      num: d.num,
      unit: d.unit || "Main",
      kind: "changed",
      labels: [],
      scenes,
    });
  }

  const cutDays = diff.cutDays.map((d) => ({
    num: d.num,
    unit: d.unit || "Main",
    date: d.date || "",
    loc: d.loc || "",
    scenes: d.scenes.map(sceneKey).filter(Boolean),
    // `|| 0` keeps a zero-cost cut day at 0 rather than -0, which JSON writes
    // as "0" and would break the round-trip this shape promises.
    money: -Math.round(oldMoney(d)) || 0,
  }));
  const cutScenes = diff.scenes.cut.map((c) => {
    const sc = c.day.scenes.find((s) => sceneKey(s) === c.key);
    return { key: c.key, fromDay: c.day.num, crowd: sc ? sceneCrowdHeads(sc) : 0 };
  });

  const groups = describeRevision(diff).map((g) => {
    // Join on the day RECORD's uid, the same identity describeRevision groups
    // by. `id` is only unit+number, so on a stitched model holding two days
    // numbered 12 both groups were given the FIRST day's money.
    const day = days.find((d) => (g.dayUid ? d.uid === g.dayUid : !!d.id && d.id === g.dayId));
    return {
      label: g.label,
      ...(g.dayId ? { dayId: g.dayId } : {}),
      ...(g.dayUid ? { dayUid: g.dayUid } : {}),
      lines: g.lines,
      ...(day && day.money ? { money: day.money } : {}),
    };
  });

  const crowdOf = (m: ShootDay[]) =>
    m.reduce((a, d) => a + d.scenes.reduce((x, s) => x + sceneCrowdHeads(s), 0), 0);

  return {
    v: 1,
    prevLabel: opts.prevLabel,
    at,
    days,
    cutDays,
    cutScenes,
    groups,
    counts: {
      daysNew: diff.addedDays.filter((d) => !d.carried).length,
      daysChanged: days.filter((d) => d.kind === "changed").length,
      daysCut: diff.cutDays.length,
      daysShot: diff.shotDays.length,
      scenesAdded: diff.scenes.added.length,
      scenesMoved: diff.scenes.moved.length,
      scenesCut: diff.scenes.cut.length,
      scenesChanged: diff.sceneChanges.length,
      crowdBefore: crowdOf([...diff.matches.map((m) => m.oldDay), ...diff.cutDays]),
      crowdAfter: crowdOf([...diff.matches.map((m) => m.newDay), ...diff.addedDays]),
    },
  };
}

/** Total money the revision moved, in whole pounds. */
export function storedDiffMoney(sd: StoredRevisionDiff): number {
  return (
    sd.days.reduce((a, d) => a + (d.money || 0), 0) +
    sd.cutDays.reduce((a, d) => a + (d.money || 0), 0)
  );
}

/** One-line summary for the "Changes since …" strip. Plain English, no ids. */
export function storedDiffHeadline(sd: StoredRevisionDiff): string {
  const c = sd.counts;
  const bits: string[] = [];
  if (c.daysNew) bits.push(plural(c.daysNew, "new day"));
  if (c.daysChanged) bits.push(plural(c.daysChanged, "changed day"));
  if (c.daysCut) bits.push(plural(c.daysCut, "dropped day"));
  if (c.scenesMoved) bits.push(plural(c.scenesMoved, "scene") + " moved");
  if (c.scenesAdded) bits.push(plural(c.scenesAdded, "scene") + " added");
  if (c.scenesCut) bits.push(plural(c.scenesCut, "scene") + " cut");
  if (!bits.length) return "No changes to the schedule itself.";
  return bits.join(" · ");
}

/** Index the stored diff by day id, for the board. */
export function storedDiffByDay(sd: StoredRevisionDiff | null | undefined): Map<string, StoredDayChange> {
  const m = new Map<string, StoredDayChange>();
  for (const d of sd?.days || []) if (d.id) m.set(d.id, d);
  return m;
}

/** The scenes cut off each day that still exists, so the day card can say
 *  "scene 45 was here and has gone" rather than the scene vanishing. */
export function storedCutByDay(sd: StoredRevisionDiff | null | undefined): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const d of sd?.days || [])
    if (d.lost && d.lost.length) m.set(d.id, d.lost);
  return m;
}

export { sceneCrowdHeads, sceneStuntHeads };
