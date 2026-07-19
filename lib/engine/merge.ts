// Merge a Full Fat / Expanded schedule's per-scene DETAIL onto a one-liner's
// day SPINE, matching on scene number.
//
// Why: in practice the one-liner carries the shooting days (dates, day numbers,
// which scenes shoot when) plus a bare SA total per scene, while the Full Fat
// carries the per-scene breakdown (named SA groups, SPACTs, stunts, stand-ins,
// vehicles) but often no shoot days at all. Costing needs both.
//
// Rule that keeps the money right: when a detail scene matches, its background
// breakdown REPLACES the spine scene's cruder counts (the one-liner's "SAs: 58"
// and the Full Fat's "15 pedestrians + 20 SAs + 20 kids + 3 teachers" describe
// the SAME people — adding them would double-count heads).

import type { NamedCount, Scene, ScheduleModel } from "./types";

export interface MergeStats {
  spineScenes: number; //   scenes on the spine's days
  matched: number; //       spine scenes that found Full Fat detail
  bgReplaced: number; //    matched scenes whose background was replaced
  saHeads: number; //       heads applied from detail, by tier
  spactHeads: number;
  featuredHeads: number;
  stuntHeads: number;
  unmatchedSpine: string[]; //  spine scene numbers with no detail found
  unmatchedDetail: string[]; // detail scene numbers not on any spine day
}

export interface MergeResult {
  model: ScheduleModel;
  stats: MergeStats;
}

// "10 pt 1" / "10pt1" / "10 PT.1" → "10pt1"
export function sceneKey(sc: Pick<Scene, "num" | "part">): string {
  return ((sc.num || "") + (sc.part || "")).toLowerCase().replace(/[\s.]+/g, "");
}

const heads = (g: NamedCount[] | undefined) =>
  (g || []).reduce((a, x) => a + (x.count || 0), 0);

// Combine two named-count lists: same name → the larger claim (it's the same
// group of people, not two groups).
function combineGroups(a: NamedCount[] | undefined, b: NamedCount[] | undefined): NamedCount[] {
  const out = new Map<string, NamedCount>();
  for (const g of [...(a || []), ...(b || [])]) {
    const k = (g.name || "").toLowerCase();
    const prev = out.get(k);
    if (!prev || g.count > prev.count) out.set(k, { name: prev?.name || g.name, count: Math.max(prev?.count || 0, g.count) });
  }
  return [...out.values()];
}

// The Full Fat often lists the same scene more than once (continuation blocks,
// page splits) — combine the instances instead of picking one, so a split
// block's background isn't lost.
function combineScenes(a: Scene, b: Scene): Scene {
  const codes = new Set((a.cast || []).map((c) => c.code));
  return {
    ...a,
    saChars: combineGroups(a.saChars, b.saChars),
    spacts: combineGroups(a.spacts, b.spacts),
    featured: combineGroups(a.featured, b.featured),
    extras: combineGroups(a.extras, b.extras),
    cast: [...(a.cast || []), ...(b.cast || []).filter((c) => !codes.has(c.code))],
    veh: Math.max(a.veh || 0, b.veh || 0),
    podVeh: Math.max(a.podVeh || 0, b.podVeh || 0),
    desc: a.desc || b.desc,
    slug: a.slug || b.slug,
    ie: a.ie || b.ie,
    tod: a.tod || b.tod,
    scriptDay: a.scriptDay || b.scriptDay,
    pages: a.pages || b.pages,
    vehNames: (a.vehNames || []).length ? a.vehNames : b.vehNames,
  };
}

export function mergeDetail(spine: ScheduleModel, detail: ScheduleModel): MergeResult {
  // Index detail scenes by key (the detail model's "days" are often pseudo-days
  // — one per scene — so flatten and ignore its day structure entirely).
  const detailScenes = detail.days.flatMap((d) => d.scenes);
  const byKey = new Map<string, Scene>();
  const byBase = new Map<string, Scene[]>(); // "10pt1" → base "10"
  for (const sc of detailScenes) {
    const k = sceneKey(sc);
    if (!k) continue;
    const prev = byKey.get(k);
    byKey.set(k, prev ? combineScenes(prev, sc) : sc);
  }
  for (const [k, sc] of byKey) {
    const base = k.replace(/pt\d+[a-z]?$/, "");
    if (base !== k) {
      const arr = byBase.get(base) || [];
      arr.push(sc);
      byBase.set(base, arr);
    }
  }

  const used = new Set<string>();
  const stats: MergeStats = {
    spineScenes: 0, matched: 0, bgReplaced: 0,
    saHeads: 0, spactHeads: 0, featuredHeads: 0, stuntHeads: 0,
    unmatchedSpine: [], unmatchedDetail: [],
  };

  const days = spine.days.map((d) => ({
    ...d,
    scenes: d.scenes.map((sc) => {
      stats.spineScenes++;
      const k = sceneKey(sc);
      // exact match first; else a base-number match, but only when unambiguous
      let det = byKey.get(k);
      if (!det) {
        const cands = byBase.get(k) || [];
        if (cands.length === 1) det = cands[0];
      }
      if (!det) {
        // spine "10 pt 1" may need detail "10" (a Full Fat that didn't split parts)
        const base = k.replace(/pt\d+[a-z]?$/, "");
        if (base !== k) det = byKey.get(base);
      }
      if (!det) {
        stats.unmatchedSpine.push(sc.num + (sc.part || ""));
        return sc;
      }
      stats.matched++;
      used.add(sceneKey(det));

      const merged: Scene = { ...sc };
      // Background: the detail's tiered breakdown replaces the spine's counts.
      const hasBg = heads(det.saChars) + heads(det.spacts) + heads(det.featured) > 0;
      if (hasBg) {
        stats.bgReplaced++;
        merged.sa = 0; // all heads now live in the tier arrays — never double-count
        merged.saChars = det.saChars || [];
        merged.spacts = det.spacts || [];
        merged.featured = det.featured || [];
        stats.saHeads += heads(det.saChars);
        stats.spactHeads += heads(det.spacts);
        stats.featuredHeads += heads(det.featured);
      }
      // Stunts: detail wins when present.
      if (heads(det.extras) > 0) {
        merged.extras = det.extras || [];
        stats.stuntHeads += heads(det.extras);
      }
      // Cast: union by code (spine order first).
      const codes = new Set((sc.cast || []).map((c) => c.code));
      merged.cast = [...(sc.cast || []), ...(det.cast || []).filter((c) => !codes.has(c.code))];
      // Vehicles: take the larger claim.
      merged.veh = Math.max(sc.veh || 0, det.veh || 0);
      if (det.podVeh) merged.podVeh = Math.max(sc.podVeh || 0, det.podVeh);
      // Fill gaps only — the spine's own text stays authoritative.
      if (!merged.desc && det.desc) merged.desc = det.desc;
      if (!merged.slug && det.slug) merged.slug = det.slug;
      if (!merged.ie && det.ie) merged.ie = det.ie;
      if (!merged.tod && det.tod) merged.tod = det.tod;
      if (!merged.scriptDay && det.scriptDay) merged.scriptDay = det.scriptDay;
      if (!merged.pages && det.pages) merged.pages = det.pages;
      if ((det.vehNames || []).length && !(merged.vehNames || []).length) merged.vehNames = det.vehNames;
      return merged;
    }),
  }));

  for (const [k, sc] of byKey) if (!used.has(k)) stats.unmatchedDetail.push(sc.num + (sc.part || ""));

  // Cast map: spine entries win; detail fills the gaps.
  const castMap = { ...detail.castMap, ...spine.castMap };

  return { model: { days, castMap, notes: spine.notes || [] }, stats };
}
