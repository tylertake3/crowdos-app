// Revision diffing — comparing two revisions of the SAME production/unit so
// a new upload can (a) show exactly what changed, (b) carry the user's work
// forward, and (c) keep already-shot history.
//
// Identity model (validated against the real Piccadilly S8 corpus:
// Shooting 2026-06-18 → Blue 2026-07-03 → Pink 2026-07-15):
// · SCENES are the stable anchor — script scene numbers (9/34) never renumber
//   when the schedule reshuffles. Scene-keyed work follows its scene.
// · DAYS are matched by CONTENT (scene overlap), never by number or date:
//   mid-shoot revisions renumber whole blocks (Blue D37–41 became Pink
//   D38–42) and swap days outright (two Stokenchurch days traded contents).
// · A vanished day dated before the new schedule's start was SHOT, not cut —
//   mid-shoot revisions only cover the remaining days. Shot days are carried
//   into the new revision so the production keeps its full timeline & spend.
//
// EVERY name and field this module exported before is still exported with the
// same meaning; everything below is additive, because the board renders from
// this shape.

import type { NamedCount, Scene, ScheduleModel, ShootDay } from "./types";
import { sceneKey } from "./merge";

// The stable identity of a day RECORD. `d.id` is only unit+number, so two
// records can share it (duplicate day numbers across a stitch, a thin parse,
// a carried collision). Matching on `id` made one day block the other and let
// dayMap silently overwrite; every internal bookkeeping key below is a uid.
export function dayUid(d: ShootDay, idx?: number): string {
  return d._uid || (d.id || "d") + "@" + (idx ?? 0);
}

// A day pairing between revisions, found by scene overlap.
export interface DayMatch {
  oldDay: ShootDay;
  newDay: ShootDay;
  overlap: number; //   Jaccard on scene keys, 0..1
  renumbered: boolean;
  dateMoved: boolean;
  // ---- additive: stable identity of each side of the pairing ----
  oldUid: string;
  newUid: string;
  /** how the pairing was found — scene content, or a fallback for a day with
   *  no parsed scenes (travel days, holidays, thin parses). */
  matchedBy: "scenes" | "date" | "number" | "location";
  // ---- additive: what actually changed about the day ----
  /** whole days the shoot day moved, signed (+3 = three days later).
   *  null when either side has no parseable date. */
  daysShifted: number | null;
  locChanged: { before: string; after: string } | null;
  /** day type — weather cover, CWD ↔ CWN, SCWD … */
  typeChanged: { before: string; after: string } | null;
  hoursChanged: { before: string; after: string } | null;
  scenesGained: string[];
  scenesLost: string[];
}

export interface SceneMove {
  key: string;
  oldDay: ShootDay;
  newDay: ShootDay;
}

/** A scene the new schedule gave a new number (45 → 45A on pink pages). */
export interface SceneRenumber {
  oldKey: string;
  newKey: string;
  oldDay: ShootDay;
  newDay: ShootDay;
}

/** A scene key that appears on more than one day in one revision. Only the
 *  first occurrence anchors the diff; the rest are reported here rather than
 *  dropped, because each extra occurrence is a real day's worth of work. */
export interface SceneDuplicate {
  key: string;
  side: "old" | "new";
  days: ShootDay[];
}

/** Content diff for a scene present in BOTH revisions. Without this a scene
 *  going 20 supporting artists → 200 reads as "unchanged". */
export interface SceneChange {
  key: string;
  /** set when the new revision also renumbered it (45 → 45A) */
  newKey?: string;
  oldDay: ShootDay;
  newDay: ShootDay;
  crowd: { before: number; after: number } | null;
  castAdded: string[];
  castDropped: string[];
  slugChanged: { before: string; after: string } | null;
  locChanged: { before: string; after: string } | null;
  stuntChanged: { before: number; after: number } | null;
  /** the scene is on a different shoot day than it was */
  moved: boolean;
}

export interface RevisionDiff {
  matches: DayMatch[];
  dayMap: Map<string, ShootDay>; // old day id → matched new day
  /** the same pairing keyed on the stable per-record uid. `dayMap` cannot
   *  represent two old days that share a number; this can. */
  dayMapByUid: Map<string, ShootDay>;
  shotDays: ShootDay[]; //  vanished days dated before the new schedule starts
  supersededDays: ShootDay[]; // past days whose scenes reappear ahead — replanned, NOT shot
  cutDays: ShootDay[]; //   vanished days that should still be ahead — real cuts
  collisions: ShootDay[]; // shot days that can't carry (day number taken in new)
  addedDays: ShootDay[]; // new days with no old counterpart
  scenes: {
    same: number;
    moved: SceneMove[];
    added: { key: string; day: ShootDay }[];
    cut: { key: string; day: ShootDay }[]; //  gone, and its day wasn't shot
    shot: { key: string; day: ShootDay }[]; // gone with its already-shot day
    /** additive: scenes the new revision renumbered rather than cut+added */
    renumbered: SceneRenumber[];
  };
  /** additive: old scene key → new scene key, for every scene that survived
   *  (identity for most, 45 → 45a for renumbers). Scene-keyed work follows it. */
  sceneKeyMap: Map<string, string>;
  /** additive: per-scene content changes (crowd, cast, slug, location, stunts) */
  sceneChanges: SceneChange[];
  /** additive: scene keys appearing on more than one day in either revision */
  duplicateScenes: SceneDuplicate[];
  newStart: Date | null; // first dated day of the new revision
}

// Below this share of common scenes two days are not "the same day" — the
// real corpus matched true pairs at 18–100% and noise stayed under this.
const MIN_OVERLAP = 0.15;

const dayKeys = (d: ShootDay) => new Set(d.scenes.map(sceneKey).filter(Boolean));

const sameDate = (a: ShootDay, b: ShootDay) =>
  a._date && b._date
    ? a._date.toDateString() === b._date.toDateString()
    : (a.date || "") === (b.date || "");

// Same shoot day, not merely the same calendar date: a scene that stayed on
// 14 July but moved from D18 to D19 has a different carry target and is NOT
// unchanged. Unit matters too — Main D18 and 2nd-unit D18 are different days.
const sameDayIdentity = (a: ShootDay, b: ShootDay) =>
  a.num === b.num && (a.unit || "Main") === (b.unit || "Main");

const norm = (s: string | undefined | null) => (s || "").trim();
const normLoose = (s: string | undefined | null) =>
  norm(s).toLowerCase().replace(/\s+/g, " ");

const MS_DAY = 86400000;
// Whole days between two shoot dates. Both are local midnights, so comparing
// UTC-noon anchors keeps a DST boundary inside the span from producing 2.96
// days and rounding to 3 by luck rather than by arithmetic.
function daysBetween(a: Date, b: Date): number {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / MS_DAY);
}

const headsOf = (g: NamedCount[] | undefined) =>
  (g || []).reduce((a, x) => a + (+x.count || 0), 0);

/** Everyone this scene puts in front of camera as background/crowd. */
export function sceneCrowdHeads(s: Scene): number {
  return (
    (+s.sa || 0) + headsOf(s.saChars) + headsOf(s.featured) + headsOf(s.spacts)
  );
}

/** Stunt bodies on the scene — the named "Stunt Performers" block plus any
 *  stunt-typed cast tokens. */
export function sceneStuntHeads(s: Scene): number {
  const tokens = (s.cast || []).filter(
    (c) => c.type === "stuntPerf" || c.type === "stuntDbl" || c.type === "stuntCoord"
  ).length;
  return headsOf(s.extras) + tokens;
}

const castCodes = (s: Scene) =>
  (s.cast || []).map((c) => c.code).filter(Boolean);

// scene key → the day (and scene position) it lives on in a model.
// Kept at FIRST occurrence for backwards compatibility — callers rewriting
// scene-keyed work want one anchor. Use sceneIndexAllOf when you need to know
// a scene shoots twice.
export function sceneIndexOf(model: ScheduleModel): Map<string, { day: ShootDay; scene: Scene; idx: number }> {
  const map = new Map<string, { day: ShootDay; scene: Scene; idx: number }>();
  for (const [k, occ] of sceneIndexAllOf(model)) map.set(k, occ[0]);
  return map;
}

/** Every occurrence of every scene key. A scene scheduled on two days used to
 *  lose one of them silently, taking that day's edit set with it. */
export function sceneIndexAllOf(
  model: ScheduleModel
): Map<string, { day: ShootDay; scene: Scene; idx: number }[]> {
  const map = new Map<string, { day: ShootDay; scene: Scene; idx: number }[]>();
  for (const d of model.days)
    d.scenes.forEach((s, idx) => {
      const k = sceneKey(s);
      if (!k) return;
      const arr = map.get(k) || [];
      arr.push({ day: d, scene: s, idx });
      map.set(k, arr);
    });
  return map;
}

// Base scene number, ignoring a trailing part/letter suffix — the same fuzzy
// fallback mergeDetail uses to pair "10 pt 1" with "10". Pink pages renumber
// 45 to 45A; treating that as a cut plus an add strands every edit on it.
export function baseSceneKey(k: string): string {
  return k.replace(/pt\d+[a-z]?$/, "").replace(/[a-z]+$/, "");
}

function duplicatesOf(
  idx: Map<string, { day: ShootDay; scene: Scene; idx: number }[]>,
  side: "old" | "new"
): SceneDuplicate[] {
  const out: SceneDuplicate[] = [];
  for (const [key, occ] of idx) {
    // the same scene listed twice on ONE day is a page split, not a second
    // day's work — merge.ts already combines those
    const days: ShootDay[] = [];
    const seen = new Set<string>();
    for (const o of occ) {
      const u = dayUid(o.day);
      if (seen.has(u)) continue;
      seen.add(u);
      days.push(o.day);
    }
    if (days.length > 1) out.push({ key, side, days });
  }
  return out;
}

export function diffRevisions(oldM: ScheduleModel, newM: ScheduleModel): RevisionDiff {
  const oldUid = (d: ShootDay, i: number) => dayUid(d, i);
  const uidOld = new Map<ShootDay, string>();
  const uidNew = new Map<ShootDay, string>();
  oldM.days.forEach((d, i) => uidOld.set(d, oldUid(d, i)));
  newM.days.forEach((d, i) => uidNew.set(d, oldUid(d, i)));

  // ---- one-to-one day matching, best overlap first (handles swaps) ----
  const pairs: { a: ShootDay; b: ShootDay; j: number }[] = [];
  for (const a of oldM.days) {
    const ka = dayKeys(a);
    if (!ka.size) continue;
    for (const b of newM.days) {
      const kb = dayKeys(b);
      if (!kb.size) continue;
      let inter = 0;
      for (const k of ka) if (kb.has(k)) inter++;
      const j = inter / (ka.size + kb.size - inter);
      if (j >= MIN_OVERLAP) pairs.push({ a, b, j });
    }
  }
  pairs.sort((x, y) => y.j - x.j);
  // Keyed on the stable per-record uid, NOT on d.id: two days sharing a number
  // used to block each other, and dayMap overwrote one with the other.
  const usedOld = new Set<string>(), usedNew = new Set<string>();
  const matches: DayMatch[] = [];
  const dayMap = new Map<string, ShootDay>();
  const dayMapByUid = new Map<string, ShootDay>();

  const record = (a: ShootDay, b: ShootDay, j: number, how: DayMatch["matchedBy"]) => {
    usedOld.add(uidOld.get(a)!);
    usedNew.add(uidNew.get(b)!);
    matches.push(buildDayMatch(a, b, j, how, uidOld.get(a)!, uidNew.get(b)!));
    // first pairing wins the legacy id key — never overwrite, or a duplicated
    // day number would silently steal the other day's mapping
    if (!dayMap.has(a.id!)) dayMap.set(a.id!, b);
    dayMapByUid.set(uidOld.get(a)!, b);
  };

  for (const { a, b, j } of pairs) {
    if (usedOld.has(uidOld.get(a)!) || usedNew.has(uidNew.get(b)!)) continue;
    record(a, b, j, "scenes");
  }

  // ---- fallback matching for days scene-overlap can never pair ----
  // A travel day, a holiday, a unit-move day or a thin parse has NO scenes, so
  // the Jaccard test above skips it entirely and it was reported as cut AND
  // re-added on every single revision, stranding all its day-level work each
  // time. Match those on date, then day number, then location — only ever
  // against an equally unmatched day, and only when one side genuinely has no
  // scenes (a day with scenes has already had its fair content test).
  const unmatchedOld = () => oldM.days.filter((d) => !usedOld.has(uidOld.get(d)!));
  const unmatchedNew = () => newM.days.filter((d) => !usedNew.has(uidNew.get(d)!));
  const eligible = (a: ShootDay, b: ShootDay) => !dayKeys(a).size || !dayKeys(b).size;

  const fallbackPass = (
    how: DayMatch["matchedBy"],
    hit: (a: ShootDay, b: ShootDay) => boolean
  ) => {
    for (const a of unmatchedOld()) {
      if (usedOld.has(uidOld.get(a)!)) continue;
      const b = unmatchedNew().find(
        (x) => !usedNew.has(uidNew.get(x)!) && eligible(a, x) && hit(a, x)
      );
      if (b) record(a, b, 0, how);
    }
  };
  fallbackPass("date", (a, b) => !!(a._date && b._date) && sameDate(a, b));
  fallbackPass("number", (a, b) => sameDayIdentity(a, b));
  fallbackPass(
    "location",
    (a, b) => !!normLoose(a.loc) && normLoose(a.loc) === normLoose(b.loc)
  );

  // ---- vanished old days: shot history vs replanned vs real cuts ----
  const newStart = newM.days.reduce<Date | null>(
    (min, d) => (d._date && (!min || d._date < min) ? d._date : min),
    null
  );
  const newNums = new Set(newM.days.map((d) => (d.unit || "Main") + "|" + d.num));
  const allNewKeys = new Set(newM.days.flatMap((d) => d.scenes.map(sceneKey).filter(Boolean)));
  const shotDays: ShootDay[] = [], supersededDays: ShootDay[] = [], cutDays: ShootDay[] = [], collisions: ShootDay[] = [];
  for (const d of oldM.days) {
    if (usedOld.has(uidOld.get(d)!)) continue;
    const past = !!(d._date && newStart && d._date < newStart);
    if (!past) { cutDays.push(d); continue; }
    // A past day whose scenes largely REAPPEAR later in the new schedule
    // wasn't shot — its plan was superseded. Stitching it would put the same
    // scenes on the board twice (old D18 Woolwich vs Pink's D24 in the real
    // corpus). Its scene work follows the scenes; the day itself is history.
    const keys = [...dayKeys(d)];
    const reappear = keys.length ? keys.filter((k) => allNewKeys.has(k)).length / keys.length : 0;
    if (reappear >= 0.5) { supersededDays.push(d); continue; }
    if (newNums.has((d.unit || "Main") + "|" + d.num)) collisions.push(d);
    else shotDays.push(d);
  }
  const addedDays = newM.days.filter((d) => !usedNew.has(uidNew.get(d)!));

  // ---- scene-level diff ----
  const oldAll = sceneIndexAllOf(oldM), newAll = sceneIndexAllOf(newM);
  const oldIdx = new Map([...oldAll].map(([k, v]) => [k, v[0]]));
  const newIdx = new Map([...newAll].map(([k, v]) => [k, v[0]]));
  // Collisions are carried too (see carriedDayRecords) — their scenes are shot
  // history exactly like a plain shot day's.
  const shotUids = new Set([...shotDays, ...collisions].map((d) => uidOld.get(d)!));
  const scenes: RevisionDiff["scenes"] = { same: 0, moved: [], added: [], cut: [], shot: [], renumbered: [] };
  const sceneKeyMap = new Map<string, string>();
  const sceneChanges: SceneChange[] = [];

  const survivors: { oldKey: string; newKey: string }[] = [];
  for (const k of oldIdx.keys()) if (newIdx.has(k)) survivors.push({ oldKey: k, newKey: k });

  // Renumber fallback: an old key with no exact match, whose BASE number has
  // exactly one unmatched candidate on each side, is the same scene renumbered
  // (45 → 45A on pink pages). Ambiguity is never guessed — the same rule
  // mergeDetail uses for base-number matching.
  const lostKeys = [...oldIdx.keys()].filter((k) => !newIdx.has(k));
  const gainedKeys = [...newIdx.keys()].filter((k) => !oldIdx.has(k));
  const byBase = <T>(keys: string[]) => {
    const m = new Map<string, string[]>();
    for (const k of keys) {
      const b = baseSceneKey(k);
      m.set(b, [...(m.get(b) || []), k]);
    }
    return m;
  };
  const lostByBase = byBase(lostKeys), gainedByBase = byBase(gainedKeys);
  const renumberedOld = new Set<string>(), renumberedNew = new Set<string>();
  for (const [base, olds] of lostByBase) {
    const news = gainedByBase.get(base);
    if (!news || olds.length !== 1 || news.length !== 1) continue;
    const o = oldIdx.get(olds[0])!, n = newIdx.get(news[0])!;
    renumberedOld.add(olds[0]);
    renumberedNew.add(news[0]);
    scenes.renumbered.push({ oldKey: olds[0], newKey: news[0], oldDay: o.day, newDay: n.day });
    survivors.push({ oldKey: olds[0], newKey: news[0] });
  }

  for (const { oldKey, newKey } of survivors) {
    const o = oldIdx.get(oldKey)!, n = newIdx.get(newKey)!;
    sceneKeyMap.set(oldKey, newKey);
    // "same" means the scene is still on the SAME shoot day, not merely the
    // same calendar date: a move from D18 to D19 on 14 July changes the carry
    // target and used to be reported as unchanged.
    if (sameDate(o.day, n.day) && sameDayIdentity(o.day, n.day)) scenes.same++;
    else scenes.moved.push({ key: oldKey, oldDay: o.day, newDay: n.day });
    const ch = buildSceneChange(oldKey, newKey, o, n);
    if (ch) sceneChanges.push(ch);
  }

  for (const [k, o] of oldIdx) {
    if (newIdx.has(k) || renumberedOld.has(k)) continue;
    if (shotUids.has(uidOld.get(o.day)!)) scenes.shot.push({ key: k, day: o.day });
    else scenes.cut.push({ key: k, day: o.day });
  }
  for (const [k, n] of newIdx)
    if (!oldIdx.has(k) && !renumberedNew.has(k)) scenes.added.push({ key: k, day: n.day });

  const duplicateScenes = [
    ...duplicatesOf(oldAll, "old"),
    ...duplicatesOf(newAll, "new"),
  ];

  return {
    matches, dayMap, dayMapByUid, shotDays, supersededDays, cutDays, collisions,
    addedDays, scenes, sceneKeyMap, sceneChanges, duplicateScenes, newStart,
  };
}

function buildDayMatch(
  a: ShootDay,
  b: ShootDay,
  overlap: number,
  matchedBy: DayMatch["matchedBy"],
  oldUidV: string,
  newUidV: string
): DayMatch {
  const ka = [...dayKeys(a)], kb = new Set(dayKeys(b));
  const kaSet = new Set(ka);
  const change = (x: string, y: string) =>
    normLoose(x) === normLoose(y) ? null : { before: norm(x), after: norm(y) };
  return {
    oldDay: a,
    newDay: b,
    overlap,
    renumbered: a.num !== b.num,
    dateMoved: !sameDate(a, b),
    oldUid: oldUidV,
    newUid: newUidV,
    matchedBy,
    daysShifted: a._date && b._date ? daysBetween(a._date, b._date) : null,
    locChanged: change(a.loc, b.loc),
    typeChanged: change(a.type, b.type),
    hoursChanged: change(a.hours, b.hours),
    scenesGained: [...kb].filter((k) => !kaSet.has(k)),
    scenesLost: ka.filter((k) => !kb.has(k)),
  };
}

function buildSceneChange(
  key: string,
  newKey: string,
  o: { day: ShootDay; scene: Scene },
  n: { day: ShootDay; scene: Scene }
): SceneChange | null {
  const crowdB = sceneCrowdHeads(o.scene), crowdA = sceneCrowdHeads(n.scene);
  const stuntB = sceneStuntHeads(o.scene), stuntA = sceneStuntHeads(n.scene);
  const oc = new Set(castCodes(o.scene)), nc = new Set(castCodes(n.scene));
  const castAdded = [...nc].filter((c) => !oc.has(c));
  const castDropped = [...oc].filter((c) => !nc.has(c));
  const slugB = norm(o.scene.slug), slugA = norm(n.scene.slug);
  const locB = norm(o.day.loc), locA = norm(n.day.loc);
  const moved = !(sameDate(o.day, n.day) && sameDayIdentity(o.day, n.day));
  const change =
    crowdB !== crowdA ||
    stuntB !== stuntA ||
    castAdded.length > 0 ||
    castDropped.length > 0 ||
    normLoose(slugB) !== normLoose(slugA) ||
    normLoose(locB) !== normLoose(locA) ||
    moved ||
    key !== newKey;
  if (!change) return null;
  return {
    key,
    ...(key !== newKey ? { newKey } : {}),
    oldDay: o.day,
    newDay: n.day,
    crowd: crowdB !== crowdA ? { before: crowdB, after: crowdA } : null,
    castAdded,
    castDropped,
    slugChanged: normLoose(slugB) !== normLoose(slugA) ? { before: slugB, after: slugA } : null,
    locChanged: normLoose(locB) !== normLoose(locA) ? { before: locB, after: locA } : null,
    stuntChanged: stuntB !== stuntA ? { before: stuntB, after: stuntA } : null,
    moved,
  };
}

// ---------------------------------------------------------------------------
// Plain-English change list.
//
// An AD and a producer read this — on screen, on paper, or pasted into an
// email. So: no jargon, no ids, no truncation. Every change is listed, grouped
// by the day it happened on, in new-schedule order.
// ---------------------------------------------------------------------------

export interface ChangeGroup {
  /** the day this group is about, as the reader would say it */
  label: string;
  /** stable id of the day the group hangs off, where there is one */
  dayId?: string;
  dayUid?: string;
  lines: string[];
}

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function niceDate(d: ShootDay): string {
  if (d._date) return `${d._date.getDate()} ${MONTHS_SHORT[d._date.getMonth()]}`;
  return norm(d.date);
}

function dayLabel(d: ShootDay): string {
  const unit = d.unit && d.unit !== "Main" ? ` (${d.unit})` : "";
  const date = niceDate(d);
  return `Day ${d.num}${unit}${date ? ` — ${date}` : ""}`;
}

const sceneWord = (n: number) => (n === 1 ? "scene" : "scenes");
const list = (xs: string[]) =>
  xs.length <= 2 ? xs.join(" and ") : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1];

/**
 * A complete, ordered, UNCAPPED plain-English account of a revision, grouped
 * by day. Suitable for the change panel, for print, and for export.
 */
export function describeRevision(diff: RevisionDiff): ChangeGroup[] {
  const groups: ChangeGroup[] = [];
  const push = (label: string, lines: string[], d?: ShootDay) => {
    if (lines.length) groups.push({ label, lines, dayId: d?.id, dayUid: d ? dayUid(d) : undefined });
  };

  // scene content changes hang off the day the scene now shoots on
  const changesByDay = new Map<string, SceneChange[]>();
  for (const c of diff.sceneChanges) {
    const u = dayUid(c.newDay);
    changesByDay.set(u, [...(changesByDay.get(u) || []), c]);
  }

  for (const m of diff.matches) {
    const lines: string[] = [];
    if (m.daysShifted != null && m.daysShifted !== 0) {
      const n = Math.abs(m.daysShifted);
      lines.push(
        `Moved ${n} day${n === 1 ? "" : "s"} ${m.daysShifted > 0 ? "later" : "earlier"}, to ${niceDate(m.newDay)}.`
      );
    } else if (m.dateMoved) {
      lines.push(`Date changed to ${niceDate(m.newDay) || "an unstated date"}.`);
    }
    if (m.renumbered) lines.push(`Renumbered from Day ${m.oldDay.num} to Day ${m.newDay.num}.`);
    if (m.locChanged)
      lines.push(
        `Location changed from ${m.locChanged.before || "(none stated)"} to ${m.locChanged.after || "(none stated)"}.`
      );
    if (m.typeChanged)
      lines.push(
        `Day type changed from ${m.typeChanged.before || "(none stated)"} to ${m.typeChanged.after || "(none stated)"}.`
      );
    if (m.hoursChanged)
      lines.push(
        `Hours changed from ${m.hoursChanged.before || "(none stated)"} to ${m.hoursChanged.after || "(none stated)"}.`
      );
    if (m.scenesGained.length)
      lines.push(`Picked up ${m.scenesGained.length} ${sceneWord(m.scenesGained.length)}: ${list(m.scenesGained)}.`);
    if (m.scenesLost.length)
      lines.push(`Lost ${m.scenesLost.length} ${sceneWord(m.scenesLost.length)}: ${list(m.scenesLost)}.`);
    if (m.matchedBy !== "scenes" && lines.length)
      lines.push(`Matched to the previous schedule by ${m.matchedBy}, as this day lists no scenes.`);

    for (const c of changesByDay.get(dayUid(m.newDay)) || []) lines.push(...sceneLines(c));
    changesByDay.delete(dayUid(m.newDay));
    push(dayLabel(m.newDay), lines, m.newDay);
  }

  for (const d of diff.addedDays) {
    const lines = [`New shoot day added${d.loc ? ` at ${d.loc}` : ""}.`];
    if (d.scenes.length)
      lines.push(
        `${d.scenes.length} ${sceneWord(d.scenes.length)} scheduled: ${list(d.scenes.map(sceneKey).filter(Boolean))}.`
      );
    for (const c of changesByDay.get(dayUid(d)) || []) lines.push(...sceneLines(c));
    changesByDay.delete(dayUid(d));
    push(dayLabel(d), lines, d);
  }

  // any remaining scene changes landed on a day with no other news
  for (const [, cs] of changesByDay) {
    const d = cs[0].newDay;
    push(dayLabel(d), cs.flatMap(sceneLines), d);
  }

  for (const d of diff.cutDays)
    push(dayLabel(d), [
      `Day dropped from the schedule${d.loc ? ` (was ${d.loc})` : ""}.`,
      ...(d.scenes.length
        ? [`${d.scenes.length} ${sceneWord(d.scenes.length)} no longer scheduled: ${list(d.scenes.map(sceneKey).filter(Boolean))}.`]
        : []),
    ], d);

  for (const d of diff.supersededDays)
    push(dayLabel(d), [`Day replanned — its scenes now shoot later in the schedule.`], d);

  for (const d of diff.shotDays)
    push(dayLabel(d), [`Already shot — kept in the schedule for the record.`], d);

  for (const d of diff.collisions)
    push(dayLabel(d), [
      `Already shot, and the new schedule reuses day number ${d.num} for a different day. Kept separately so the day is not lost.`,
    ], d);

  const dup = diff.duplicateScenes.filter((x) => x.side === "new");
  if (dup.length)
    groups.push({
      label: "Scenes scheduled more than once",
      lines: dup.map(
        (x) => `Scene ${x.key} appears on ${x.days.length} days: ${list(x.days.map((d) => `Day ${d.num}`))}.`
      ),
    });

  return groups;
}

function sceneLines(c: SceneChange): string[] {
  const who = `Scene ${c.key}`;
  const out: string[] = [];
  if (c.newKey) out.push(`${who} is now scene ${c.newKey}.`);
  if (c.moved) {
    // A scene that is still on the same shoot day, whose DAY has been moved to
    // a new date, has not gone anywhere. "Scene 45 moved from Day 1 to Day 1"
    // reads as nonsense to an AD; say what actually happened.
    if (sameDayIdentity(c.oldDay, c.newDay)) {
      const from = niceDate(c.oldDay), to = niceDate(c.newDay);
      out.push(
        from && to
          ? `${who} stays on Day ${c.newDay.num}, which moved from ${from} to ${to}.`
          : `${who} stays on Day ${c.newDay.num}, which moved to a new date.`
      );
    } else {
      out.push(`${who} moved from Day ${c.oldDay.num} (${niceDate(c.oldDay)}) to Day ${c.newDay.num} (${niceDate(c.newDay)}).`);
    }
  }
  if (c.crowd) {
    const { before, after } = c.crowd;
    out.push(
      after > before
        ? `${who} crowd up from ${before} to ${after} — ${after - before} more.`
        : `${who} crowd down from ${before} to ${after} — ${before - after} fewer.`
    );
  }
  if (c.stuntChanged)
    out.push(`${who} stunt performers changed from ${c.stuntChanged.before} to ${c.stuntChanged.after}.`);
  if (c.castAdded.length) out.push(`${who} adds cast ${list(c.castAdded)}.`);
  if (c.castDropped.length) out.push(`${who} drops cast ${list(c.castDropped)}.`);
  if (c.slugChanged)
    out.push(`${who} set changed from ${c.slugChanged.before || "(none stated)"} to ${c.slugChanged.after || "(none stated)"}.`);
  if (c.locChanged)
    out.push(`${who} location changed from ${c.locChanged.before || "(none stated)"} to ${c.locChanged.after || "(none stated)"}.`);
  return out;
}

/** The same account as a flat, ordered list of sentences (print / paste). */
export function revisionChangeLines(diff: RevisionDiff): string[] {
  return describeRevision(diff).flatMap((g) => [g.label, ...g.lines.map((l) => "  " + l)]);
}

// Cast numbers are a PERMANENT label for the production, not for one document.
// A new schedule routinely omits the cast list (issue 1 prints "9. Tony Banks",
// issue 2 just references "9") — but "9" still means Tony Banks. Carry every
// known code→name forward when publishing a new revision so a document that
// drops the list doesn't blank the board's names. The new document's own names
// win where it does give them (a genuine recast or correction takes effect);
// anything it leaves unnamed falls back to what we already knew.
export function carryCastMap(
  prev: Record<string, string> | undefined | null,
  next: Record<string, string> | undefined | null
): Record<string, string> {
  const out: Record<string, string> = { ...(prev || {}) };
  for (const [code, name] of Object.entries(next || {})) {
    if (name != null && String(name).trim()) out[code] = name; // new doc wins where named
  }
  return out;
}

// Plain day records for the shot days, ready to stitch into the new
// revision's stored model (aiModel) — cloned, non-serialisable fields
// dropped, flagged so views can tell history from the live document.
//
// Collisions are carried too. A shot day whose number the new schedule reuses
// used to be dropped outright: the production lost a real day off its timeline
// and its spend off the budget. It is kept under a suffixed id so it cannot
// collide with the live day of the same number, and flagged so the UI can
// explain why the id looks different.
/** The label a carried day is filed under when the new schedule reuses its
 *  number — the revision it was shot in, with the spaces taken out so it is
 *  safe in an id and in a storage key. */
export function carriedDaySuffix(d: Pick<ShootDay, "fromRev">, fromRev: string): string {
  return (d.fromRev || fromRev || "prev").replace(/\s+/g, "");
}

/** The id a collided shot day is stitched in under (`M12` → `M12-Blue`).
 *  Everything that has to agree on that identity — the stitched record, the
 *  day-level carry target, the cost row — derives it from here. */
export function carriedDayId(d: Pick<ShootDay, "id" | "fromRev">, fromRev: string): string {
  return (d.id || "") + "-" + carriedDaySuffix(d, fromRev);
}

export function carriedDayRecords(diff: RevisionDiff, fromRev: string): ShootDay[] {
  const plain = (d: ShootDay): ShootDay => {
    const rec = JSON.parse(JSON.stringify({ ...d, _date: undefined }));
    delete rec._date;
    rec.carried = true;
    // a day already carried from an earlier revision keeps its original
    // label — across a 20-revision chain each day remembers where it was shot
    rec.fromRev = d.fromRev || fromRev;
    return rec;
  };
  const out = diff.shotDays.map(plain);
  for (const d of diff.collisions) {
    const rec = plain(d);
    rec.id = carriedDayId({ id: d.id, fromRev: rec.fromRev }, fromRev);
    rec._uid = rec.id;
    rec.collided = true;
    out.push(rec);
  }
  return out;
}
