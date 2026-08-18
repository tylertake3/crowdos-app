// Lay a CROWD BREAKDOWN over a shooting schedule that is already on the board.
//
// WHY THIS IS NOT mergeDetail
//
// mergeDetail exists for a Full Fat, which carries per-scene detail and NO
// shoot days at all: it flattens the detail document, indexes it by scene
// number, and enriches the spine wherever a number matches. Two things about a
// crowd breakdown make that the wrong shape:
//
//  1. A breakdown DOES have shoot days, and the same scene legitimately appears
//     on several of them. On FML, Sc.23 appears on five days and Sc.45 and
//     Sc.53 on two each — with different crowd on each. Matching on scene
//     number alone would pool all five into one and hand Day 1 the crowd that
//     belongs to Day 4. So the match here is DAY FIRST, scene second.
//
//  2. A breakdown is not a schedule and must never be read as one. It has no
//     cast numbers, and its location cells are the crowd 2nd AD's shorthand,
//     not the schedule's. Importing one as a new revision — which is what used
//     to happen — replaced the board with a document that simply does not
//     contain most of what was on it, and the cast numbers and locations went
//     with it.
//
// THE RULE, and it has no exceptions: this merge writes CROWD and nothing else.
// Cast, locations, dates, hours, times of day, script days, page counts, scene
// descriptions and slugs on a matched day or scene are left exactly as the
// shooting schedule set them. The breakdown may only say who the background
// are and how many.
//
// WHAT DOES NOT MATCH IS KEPT, AND SAID
//
// A breakdown day or scene with no counterpart on the board is added rather
// than discarded — it is crowd somebody has booked and the production will pay
// for, and silently dropping it understates the budget. But it is stamped
// `fromBreakdown`, because the shooting schedule has not confirmed it exists,
// and every surface that shows it is expected to say so.

import { parseDayDate } from "./model";
import { sceneKey } from "./merge";
import { sceneSlotKey } from "./carry";
import type { NamedCount, Scene, ScheduleModel, ShootDay } from "./types";

export interface CrowdMergeStats {
  spineDays: number; //        days on the board
  daysMatched: number; //      breakdown days that found a day on the board
  daysAdded: number; //        breakdown days added because nothing matched
  scenesMatched: number; //    scenes whose crowd was written from the breakdown
  scenesAdded: number; //      scenes added to a matched day
  heads: number; //            total crowd heads applied, across every tier
  addedDayLabels: string[]; // the added days, as printed on the breakdown
  addedSceneLabels: string[]; // "D4 · Sc.23" for each added scene
  unmatchedSpineDays: string[]; // board days the breakdown never mentioned
  /** Scenes the user had already broken down themselves, left exactly as they
   *  were. Each says what the import would have written, so the difference can
   *  be looked at rather than silently resolved either way. */
  keptOwnWork: {
    label: string; //  "D5 · Sc.10"
    slot: string; //   the scene slot key, so the board can link to it
    mine: string; //   "Simon's Office Workers ×7, Policemen ×2"
    theirs: string; // what the breakdown says for the same scene
  }[];
}

export interface CrowdMergeOptions {
  /** Scene slot keys (unit|day|scene|part|#n) whose crowd the user has already
   *  set in the app. A breakdown import never overwrites one — the whole point
   *  of the crowd layer is that work done here outlives the documents. */
  protectedSlots?: Set<string>;
}

export interface CrowdMergeResult {
  model: ScheduleModel;
  stats: CrowdMergeStats;
}

// Every field a breakdown is allowed to write. Anything not on this list is the
// shooting schedule's to state, and is left alone. Kept as an explicit list
// rather than a spread so that adding a field to Scene cannot quietly widen
// what a breakdown overwrites.
const CROWD_FIELDS = [
  "saChars",
  "spacts",
  "featured",
  "extras",
  "children",
  "avs",
] as const;

const heads = (g: NamedCount[] | undefined) =>
  (g || []).reduce((a, x) => a + (x.count || 0), 0);

const sceneHeads = (s: Scene) =>
  CROWD_FIELDS.reduce((a, f) => a + heads(s[f]), 0);

// Does this breakdown scene actually say anything about crowd? A scene with no
// rows at all (FML's Sc.45 on Day 1 — a weather cover with no background) must
// not blank out what the schedule already had; it simply has nothing to add.
const statesCrowd = (s: Scene) =>
  sceneHeads(s) > 0 || !!s.reqStatus || !!s.contFrom || !!s.contFromRef;

// Same group named twice on one scene (a page split, a continuation block) is
// the same people — take the larger claim, never the sum.
function combineGroups(a?: NamedCount[], b?: NamedCount[]): NamedCount[] {
  const out = new Map<string, NamedCount>();
  for (const g of [...(a || []), ...(b || [])]) {
    const k = (g.name || "").toLowerCase();
    const prev = out.get(k);
    if (!prev || (g.count || 0) > (prev.count || 0)) {
      out.set(k, { ...(prev || {}), ...g, count: Math.max(prev?.count || 0, g.count || 0) });
    }
  }
  return [...out.values()];
}

// One scene printed more than once WITHIN one breakdown day.
function combineBreakdownScenes(a: Scene, b: Scene): Scene {
  const out: Scene = { ...a };
  for (const f of CROWD_FIELDS) out[f] = combineGroups(a[f], b[f]);
  out.reqStatus = a.reqStatus || b.reqStatus;
  out.contFrom = a.contFrom || b.contFrom;
  out.contFromRef = a.contFromRef || b.contFromRef;
  if (a.crowdInherited || b.crowdInherited) out.crowdInherited = true;
  out.unparsed = [...(a.unparsed || []), ...(b.unparsed || [])];
  return out;
}

// ---- keying a scene so the two documents can meet ------------------------
//
// sceneKey() is the shared, strict key. It is not enough on its own here,
// because the two documents write the same scene differently and a schedule
// parser leaves artefacts in the number that a breakdown never has:
//
//   schedule "88pt2/2 INT/EXT"   breakdown "88pt2/2"   — I/E glued to the number
//   schedule "6"                 breakdown "06"        — leading zero
//   schedule "55pt7/29"          breakdown "55pt07/29" — leading zero in the part
//
// Each of those cost a real scene's crowd on FML: it went unmatched, and was
// then re-added to the same day as a duplicate "Breakdown only" scene — the
// same background booked twice on one day. So there is a LOOSE key too, used
// only after the strict key has failed and only where it picks out exactly one
// scene. Ambiguity is left unmatched and reported, never guessed.

// Trailing interior/exterior, which belongs in the I/E column and not the
// number: "88pt2/2int/ext", "3ext", "57i/e".
const IE_TAIL_RX = /(?:int|ext|i|e)(?:\/(?:int|ext|i|e))*$/;
// Leading zeros, on the scene number and inside a part: "06" → "6",
// "55pt07/29" → "55pt7/29".
const stripZeros = (k: string) => k.replace(/(^|[a-z/])0+(\d)/g, "$1$2");

function looseKey(sc: Pick<Scene, "num" | "part">): string {
  const k = sceneKey(sc);
  const noIe = k.replace(IE_TAIL_RX, "");
  return stripZeros(noIe || k);
}

// "87pt5/7" → "87". Parts are written "pt2", "pt5/7", "pt2a" or a bare "pt".
const PART_SUFFIX_RX = /pt[\d/]*[a-z]?$/;

// ---- weather cover -------------------------------------------------------
//
// A breakdown prints its weather cover as a banner row ("WEATHER COVER") with
// the covering scenes beneath it, and the reader keeps that banner as a
// locBlock rather than marking the scenes. That is fine while the breakdown
// stands alone, but adding those scenes to a day is not: FML covers Sc.23/24/25
// on four separate days, and 60 Wedding Guests (BBQ) costed on each of them is
// four days of crowd for a day's work that only ever happens once. Weather
// cover is scheduled precisely because it may never be shot.
const WEATHER_COVER_RX = /\bWEATHER\s*COVER\b/i;

// Resolve each scene's weather-cover state from the day's banners, BEFORE any
// day records are flattened together (the banners index into that record's own
// scene list, so the indices stop meaning anything once lists are joined).
function markWeatherCover(d: ShootDay): ShootDay {
  const blocks = d.locBlocks || [];
  if (!blocks.some((b) => WEATHER_COVER_RX.test(b.loc || ""))) return d;
  const from = blocks.map((b) => ({ at: b.from, wc: WEATHER_COVER_RX.test(b.loc || "") }));
  return {
    ...d,
    scenes: d.scenes.map((sc, i) => {
      const active = from.filter((b) => b.at <= i).pop();
      return active?.wc && !sc.status ? { ...sc, status: "weatherCover" as const } : sc;
    }),
  };
}

// Local YYYY-MM-DD. Never toISOString() — that converts to UTC and moves every
// British Summer Time date back a day (see weekKey in model.ts for the same
// trap).
function dateKey(d: Pick<ShootDay, "date">): string | null {
  const dt = parseDayDate(d);
  if (!dt) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return dt.getFullYear() + "-" + p(dt.getMonth() + 1) + "-" + p(dt.getDate());
}

// Write the breakdown's crowd onto a schedule scene, and nothing else.
function applyCrowd(spineSc: Scene, bdSc: Scene): Scene {
  const merged: Scene = { ...spineSc };
  for (const f of CROWD_FIELDS) merged[f] = (bdSc[f] || []).map((g) => ({ ...g }));
  // Every head now lives in a named tier array. The one-liner's anonymous
  // bucket ("SA's 12") describes the SAME people the breakdown has just named
  // ("2 Padel Staff, 8 Padel Players") — leaving it set would count them twice.
  merged.sa = 0;
  merged.saAbove = false;
  if (bdSc.reqStatus) merged.reqStatus = bdSc.reqStatus;
  if (bdSc.contFrom) merged.contFrom = bdSc.contFrom;
  if (bdSc.contFromRef) merged.contFromRef = bdSc.contFromRef;
  // The rows just written are the covering scene's people, marked as carried.
  // Say so, so nothing downstream mistakes them for this scene's own booking.
  if (bdSc.crowdInherited) merged.crowdInherited = true;
  if ((bdSc.unparsed || []).length) merged.unparsed = bdSc.unparsed;
  // This scene's crowd is now the crowd side's, not the schedule's.
  merged.crowdSource = "breakdown_import";
  return merged;
}

const listGroups = (sc: Scene): string =>
  CROWD_FIELDS.flatMap((f) => (sc[f] || []).map((g) => `${g.name || "SA"} \u00d7${g.count}`)).join(", ") ||
  "nothing";

export function mergeCrowdBreakdown(
  spine: ScheduleModel,
  breakdown: ScheduleModel,
  opts: CrowdMergeOptions = {}
): CrowdMergeResult {
  const mine = opts.protectedSlots || new Set<string>();
  const stats: CrowdMergeStats = {
    spineDays: spine.days.length,
    daysMatched: 0,
    daysAdded: 0,
    scenesMatched: 0,
    scenesAdded: 0,
    heads: 0,
    addedDayLabels: [],
    addedSceneLabels: [],
    unmatchedSpineDays: [],
    keptOwnWork: [],
  };

  // ---- pair the days up -------------------------------------------------
  // Calendar date is the only trustworthy key: a breakdown and the schedule it
  // was built from agree on dates far more reliably than on day numbering,
  // which drifts the moment either document gains or loses a day. Day number is
  // the fallback, and only where a date is missing on one side.
  //
  // A date can carry several day RECORDS (main + splinter + 2nd unit), so the
  // buckets are queues and each breakdown day takes the first record still
  // free — never one already claimed by an earlier breakdown day.
  const byDate = new Map<string, ShootDay[]>();
  const byNum = new Map<number, ShootDay[]>();
  for (const d of spine.days) {
    const k = dateKey(d);
    if (k) {
      const arr = byDate.get(k) || [];
      arr.push(d);
      byDate.set(k, arr);
    }
    if (d.num != null) {
      const arr = byNum.get(d.num) || [];
      arr.push(d);
      byNum.set(d.num, arr);
    }
  }
  const claimed = new Set<ShootDay>();

  // spine day → every breakdown day that landed on it
  const pairs = new Map<ShootDay, ShootDay[]>();
  const orphanDays: ShootDay[] = [];
  const attach = (target: ShootDay, bd: ShootDay) => {
    claimed.add(target);
    const arr = pairs.get(target) || [];
    arr.push(bd);
    pairs.set(target, arr);
  };
  for (const bd of breakdown.days) {
    const k = dateKey(bd);
    const onDate = k ? byDate.get(k) : undefined;
    if (onDate && onDate.length) {
      // One calendar date can hold several day RECORDS on either side (a main
      // and a splinter block; a day the reader split at a page break). Pair
      // them off in order, and where the breakdown has MORE records than the
      // board does, the surplus folds into the last board day on that date
      // rather than becoming a day of its own.
      //
      // This matters on a real document: FML's breakdown prints six of its
      // shoot days across two blocks. Treating each second block as a new day
      // would have put six shoot days on the board that the production does
      // not have — and put a "Breakdown only" warning on days that are simply
      // page two of a day the schedule already knows about.
      attach(onDate.find((d) => !claimed.has(d)) || onDate[onDate.length - 1], bd);
      continue;
    }
    // No board day on that date — fall back to the day number, but ONLY onto a
    // board day that has no date of its own to contradict it. Matching a
    // numbered day onto a dated one is how a breakdown that is a revision
    // behind moves crowd onto the wrong date.
    const byNumCands = bd.num != null ? (byNum.get(bd.num) || []).filter((d) => !claimed.has(d)) : [];
    const target = byNumCands.find((d) => !k || !dateKey(d));
    if (target) attach(target, bd);
    else orphanDays.push(bd);
  }

  // Several breakdown records for one board day read as one day's worth of
  // crowd: their scene lists are simply concatenated, and the scene indexing
  // below combines any scene the blocks both name.
  const flatten = (list: ShootDay[]): ShootDay => ({
    ...list[0],
    scenes: list.flatMap((d) => markWeatherCover(d).scenes),
    declaredTotals: list.find((d) => d.declaredTotals)?.declaredTotals,
  });

  // ---- write the crowd onto the days that paired -------------------------
  const days: ShootDay[] = spine.days.map((sd) => {
    const hits = pairs.get(sd);
    if (!hits || !hits.length) {
      stats.unmatchedSpineDays.push(sd.date || "Day " + sd.num);
      return sd;
    }
    const bd = flatten(hits);
    stats.daysMatched++;

    // Index this breakdown day's scenes — within one day, so the same scene
    // number on another day can never reach here.
    const byKey = new Map<string, Scene>();
    for (const sc of bd.scenes) {
      const k = sceneKey(sc);
      if (!k) continue;
      const prev = byKey.get(k);
      byKey.set(k, prev ? combineBreakdownScenes(prev, sc) : sc);
    }
    // The two fuzzy indexes, each mapping a relaxed key to every strict key it
    // could stand for. A relaxed key that covers more than one scene is
    // ambiguous and is never used — see looseKey.
    const index = (fn: (k: string) => string) => {
      const m = new Map<string, string[]>();
      for (const [k, sc] of byKey) {
        const lk = fn(looseKey(sc));
        if (!lk) continue;
        m.set(lk, [...(m.get(lk) || []), k]);
      }
      return m;
    };
    const byLoose = index((k) => k);
    const byBase = index((k) => k.replace(PART_SUFFIX_RX, ""));
    // Uniqueness has to hold on BOTH sides. One breakdown scene "55" against a
    // day of 55pt8/29 and 55pt9/29 is unique on the breakdown's side and still
    // ambiguous — it would hand the same crowd to every part of scene 55 on the
    // day. Count the schedule's side too, and match only where each names one.
    const spineLoose = new Map<string, number>();
    const spineBase = new Map<string, number>();
    for (const sc of sd.scenes) {
      const lk = looseKey(sc);
      if (!lk) continue;
      spineLoose.set(lk, (spineLoose.get(lk) || 0) + 1);
      const bk = lk.replace(PART_SUFFIX_RX, "");
      spineBase.set(bk, (spineBase.get(bk) || 0) + 1);
    }
    const unique = (m: Map<string, string[]>, mine: Map<string, number>, k: string) => {
      const hit = m.get(k);
      return hit && hit.length === 1 && mine.get(k) === 1 ? hit[0] : null;
    };
    const used = new Set<string>();

    const scenes = sd.scenes.map((sc, i) => {
      const strict = sceneKey(sc);
      const loose = looseKey(sc);
      // Strict key, then the loose key, then the base number — each step only
      // taken when the one before found nothing, and the last two only when
      // they name exactly one scene on this day.
      const hit =
        (byKey.has(strict) && strict) ||
        unique(byLoose, spineLoose, loose) ||
        unique(byBase, spineBase, loose.replace(PART_SUFFIX_RX, ""));
      const bdSc = hit ? byKey.get(hit) : null;
      if (!bdSc || !statesCrowd(bdSc)) return sc;
      used.add(hit as string);
      // The user has broken this scene down themselves. Their work stands, and
      // the disagreement is reported — an import that quietly replaced it would
      // be the same failure as a schedule wiping the breakdown.
      const slot = sceneSlotKey(sd, i);
      if (mine.has(slot)) {
        // Only a DISAGREEMENT is worth printing. Re-importing the breakdown a
        // scene was built from agrees with it on almost every row, and listing
        // all 99 of those as "kept" buries the handful that actually differ —
        // which are the only ones there is anything to decide about.
        const ours = listGroups(sc);
        const theirs = listGroups(bdSc);
        if (ours !== theirs && theirs !== "nothing") {
          stats.keptOwnWork.push({
            label: "D" + sd.num + " \u00b7 Sc." + sc.num + (sc.part || ""),
            slot,
            mine: ours,
            theirs,
          });
        }
        return sc;
      }
      stats.scenesMatched++;
      stats.heads += sceneHeads(bdSc);
      return applyCrowd(sc, bdSc);
    });

    // Scenes the breakdown has crowd for that this day does not list. Kept —
    // it is booked crowd — but stamped, because the schedule does not have it.
    for (const [k, bdSc] of byKey) {
      if (used.has(k) || !statesCrowd(bdSc)) continue;
      stats.scenesAdded++;
      stats.heads += sceneHeads(bdSc);
      stats.addedSceneLabels.push("D" + sd.num + " · Sc." + bdSc.num + (bdSc.part || ""));
      scenes.push({ ...bdSc, unit: sd.unit || bdSc.unit, fromBreakdown: true, crowdSource: "breakdown_import" });
    }

    return {
      ...sd,
      scenes,
      // The breakdown's own printed footer totals, kept so the review screen
      // can diff them against what the rows add up to. Not a cost input.
      declaredTotals: bd.declaredTotals || sd.declaredTotals,
    };
  });

  // ---- days the breakdown has that the board does not --------------------
  // Inserted in CALENDAR POSITION, not appended. A board is read top to bottom
  // as the shoot runs, and a day parked at the end after day 35 reads as a day
  // 36 that does not exist. The whole list is never re-sorted — that would
  // reorder days the schedule deliberately placed — only the new day is slotted
  // in after the last dated day that precedes it.
  for (const bd of orphanDays) {
    if (!bd.scenes.some(statesCrowd)) continue;
    stats.daysAdded++;
    stats.heads += bd.scenes.reduce((a, s) => a + sceneHeads(s), 0);
    stats.addedDayLabels.push(bd.date || "Day " + bd.num);
    const day: ShootDay = {
      ...bd,
      unit: spine.days[0]?.unit || bd.unit,
      fromBreakdown: true,
      // Not in the schedule document, so it survives the next one the same way
      // a hand-added day does — see ShootDay.manual.
      manual: true,
      scenes: markWeatherCover(bd).scenes.map((s) => ({ ...s, fromBreakdown: true, crowdSource: "breakdown_import" as const })),
    };
    const k = dateKey(bd);
    let at = days.length;
    if (k) {
      at = 0;
      days.forEach((d, i) => {
        const dk = dateKey(d);
        if (dk && dk <= k) at = i + 1;
      });
    }
    days.splice(at, 0, day);
  }

  return {
    // castMap is the schedule's. A breakdown has no cast numbers, so there is
    // nothing here it could add and everything it could destroy.
    model: { days, castMap: spine.castMap, notes: spine.notes || [] },
    stats,
  };
}
