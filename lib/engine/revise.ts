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

import type { Scene, ScheduleModel, ShootDay } from "./types";
import { sceneKey } from "./merge";

// A day pairing between revisions, found by scene overlap.
export interface DayMatch {
  oldDay: ShootDay;
  newDay: ShootDay;
  overlap: number; //   Jaccard on scene keys, 0..1
  renumbered: boolean;
  dateMoved: boolean;
}

export interface SceneMove {
  key: string;
  oldDay: ShootDay;
  newDay: ShootDay;
}

export interface RevisionDiff {
  matches: DayMatch[];
  dayMap: Map<string, ShootDay>; // old day id → matched new day
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
  };
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

// scene key → the day (and scene position) it lives on in a model
export function sceneIndexOf(model: ScheduleModel): Map<string, { day: ShootDay; scene: Scene; idx: number }> {
  const map = new Map<string, { day: ShootDay; scene: Scene; idx: number }>();
  for (const d of model.days)
    d.scenes.forEach((s, idx) => {
      const k = sceneKey(s);
      if (k && !map.has(k)) map.set(k, { day: d, scene: s, idx });
    });
  return map;
}

export function diffRevisions(oldM: ScheduleModel, newM: ScheduleModel): RevisionDiff {
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
  const usedOld = new Set<string>(), usedNew = new Set<string>();
  const matches: DayMatch[] = [];
  const dayMap = new Map<string, ShootDay>();
  for (const { a, b, j } of pairs) {
    if (usedOld.has(a.id!) || usedNew.has(b.id!)) continue;
    usedOld.add(a.id!);
    usedNew.add(b.id!);
    matches.push({ oldDay: a, newDay: b, overlap: j, renumbered: a.num !== b.num, dateMoved: !sameDate(a, b) });
    dayMap.set(a.id!, b);
  }

  // ---- vanished old days: shot history vs replanned vs real cuts ----
  const newStart = newM.days.reduce<Date | null>(
    (min, d) => (d._date && (!min || d._date < min) ? d._date : min),
    null
  );
  const newNums = new Set(newM.days.map((d) => (d.unit || "Main") + "|" + d.num));
  const allNewKeys = new Set(newM.days.flatMap((d) => d.scenes.map(sceneKey).filter(Boolean)));
  const shotDays: ShootDay[] = [], supersededDays: ShootDay[] = [], cutDays: ShootDay[] = [], collisions: ShootDay[] = [];
  for (const d of oldM.days) {
    if (usedOld.has(d.id!)) continue;
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
  const addedDays = newM.days.filter((d) => !usedNew.has(d.id!));

  // ---- scene-level diff ----
  const oldIdx = sceneIndexOf(oldM), newIdx = sceneIndexOf(newM);
  const shotIds = new Set(shotDays.map((d) => d.id));
  const scenes: RevisionDiff["scenes"] = { same: 0, moved: [], added: [], cut: [], shot: [] };
  for (const [k, o] of oldIdx) {
    const n = newIdx.get(k);
    if (n) {
      if (sameDate(o.day, n.day)) scenes.same++;
      else scenes.moved.push({ key: k, oldDay: o.day, newDay: n.day });
    } else if (shotIds.has(o.day.id)) scenes.shot.push({ key: k, day: o.day });
    else scenes.cut.push({ key: k, day: o.day });
  }
  for (const [k, n] of newIdx) if (!oldIdx.has(k)) scenes.added.push({ key: k, day: n.day });

  return { matches, dayMap, shotDays, supersededDays, cutDays, collisions, addedDays, scenes, newStart };
}

// Plain day records for the shot days, ready to stitch into the new
// revision's stored model (aiModel) — cloned, non-serialisable fields
// dropped, flagged so views can tell history from the live document.
export function carriedDayRecords(diff: RevisionDiff, fromRev: string): ShootDay[] {
  return diff.shotDays.map((d) => {
    const rec = JSON.parse(JSON.stringify({ ...d, _date: undefined }));
    delete rec._date;
    rec.carried = true;
    // a day already carried from an earlier revision keeps its original
    // label — across a 20-revision chain each day remembers where it was shot
    rec.fromRev = d.fromRev || fromRev;
    return rec;
  });
}
