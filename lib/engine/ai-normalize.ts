// Turn the AI schedule parser's compact JSON answer into a full ScheduleModel
// the engine can cost. Kept in lib/ (not the route file) so it is unit-testable
// and Next.js does not treat it as a route export.

// Classify a raw AI background[] + stunts[] into the engine's named buckets,
// applying the deterministic guards (junk labels out, stunt-named crowd → stunts,
// crowd-named "double/stand-in" filed under stunts → back to SA). Used for both
// scene-level counts and a day-level total.
export function classifyCrowd(bgRaw: any, stuntsRaw: any, dayLevel = false) {
  const bg = Array.isArray(bgRaw) ? bgRaw : [];
  const saChars: { name: string; count: number }[] = [];
  const spacts: { name: string; count: number }[] = [];
  const featured: { name: string; count: number }[] = [];
  for (const g of bg) {
    const count = Math.max(0, Math.round(Number(g?.count) || 0));
    if (!count) continue;
    // Anonymous SA collapses into one peaked bucket ("SA"), matching the
    // regex parser's treatment of unnamed background; named groups keep
    // their names and sum.
    const tier = g?.tier === "SPACT" ? "SPACT" : g?.tier === "Featured" ? "Featured" : "SA";
    const name = String(g?.name || "").trim();
    const entry = { name: tier === "SA" ? (name || "SA") : name, count };
    if (tier === "SPACT") spacts.push(entry);
    else if (tier === "Featured") featured.push(entry);
    else saChars.push(entry);
  }
  const stunts = (Array.isArray(stuntsRaw) ? stuntsRaw : [])
    .map((s: any) => ({ name: String(s?.name || "").trim(), count: Math.max(0, Math.round(Number(s?.count) || 0)) }))
    .filter((s: any) => s.count);
  const LABEL_JUNK = /^(day|night|dawn|dusk|weapons?|props?|extras?|featured extras?|background(?: actors?)?|stunts?|stand.?ins?|vfx|sfx|special effects|additional labou?r|notes?|q'?s?|cast|vehicles?|wardrobe|make-?up(?:\/hair)?)\s*:?$/i;
  if (dayLevel) {
    // A day-level total (e.g. "Extras x 48: Stunts x 6") legitimately carries a
    // bare category name — that label IS the total, not a leaked heading. So
    // rather than delete a junk-named entry, collapse it to its anonymous
    // canonical: crowd → "SA", stunts → "Stunts". Named groups pass through.
    for (const arr of [saChars, spacts, featured]) {
      for (const e of arr) if (LABEL_JUNK.test(e.name.trim())) e.name = "SA";
    }
    for (const e of stunts) if (!e.name || LABEL_JUNK.test(e.name.trim())) e.name = "Stunts";
  } else {
    // Scene-level: category labels and prop/effects headings are never people —
    // strip them wherever the model filed them ("Weapons", "DAY", "Featured
    // Extras" showing up as stunt chips was a real leak).
    for (const arr of [saChars, spacts, featured, stunts]) {
      for (let i = arr.length - 1; i >= 0; i--) {
        if (LABEL_JUNK.test(arr[i].name.trim())) arr.splice(i, 1);
      }
    }
  }
  // Anything NAMED like a stunt ("Maia Running/Stunt Double") costs as stunts,
  // never as crowd — and a crowd-named entry the model filed under stunts (a
  // picture/child double, a stand-in) comes back to SA.
  for (const arr of [saChars, spacts, featured]) {
    for (let i = arr.length - 1; i >= 0; i--) {
      if (/stunt/i.test(arr[i].name)) { stunts.push(arr[i]); arr.splice(i, 1); }
    }
  }
  for (let i = stunts.length - 1; i >= 0; i--) {
    const n = stunts[i].name;
    if (n && !/stunt/i.test(n) && /stand.?in|double/i.test(n)) { saChars.push(stunts[i]); stunts.splice(i, 1); }
  }
  return { saChars, spacts, featured, stunts };
}

// Every background head goes through saChars/spacts/featured; scene.sa stays 0.
export function normalize(raw: any) {
  const days = (Array.isArray(raw?.days) ? raw.days : []).map((d: any) => {
    // A crowd/stunt total the schedule states for the whole day (e.g. a footer
    // "Extras x 48: Stunts x 6") without naming scenes. It applies to EVERY
    // scene in the day that carries none of its own — so a blanket day total
    // lands on the entire day, not just one scene.
    const dayCrowd = classifyCrowd(d?.background, d?.stunts, true);
    const scenes = (Array.isArray(d?.scenes) ? d.scenes : []).map((sc: any) => {
      const { saChars, spacts, featured, stunts } = classifyCrowd(sc?.background, sc?.stunts);
      // Fill scenes that specify no background of their own with the day's
      // background total, and scenes with no stunts of their own with the day's
      // stunt total. A scene that names its own counts keeps only those.
      if (!saChars.length && !spacts.length && !featured.length) {
        for (const e of dayCrowd.saChars) saChars.push({ ...e });
        for (const e of dayCrowd.spacts) spacts.push({ ...e });
        for (const e of dayCrowd.featured) featured.push({ ...e });
      }
      if (!stunts.length) {
        for (const e of dayCrowd.stunts) stunts.push({ ...e });
      }
      const cast = (Array.isArray(sc?.cast) ? sc.cast : [])
        .map((c: any) => ({ code: String(c || "").trim(), type: "cast" as const }))
        .filter((c: any) => c.code);
      return {
        num: String(sc?.num || "").trim(),
        part: "",
        ie: String(sc?.ie || "").trim(),
        slug: String(sc?.desc || "").trim(),
        tod: String(sc?.tod || "").trim(),
        scriptDay: String(sc?.scriptDay || "").trim(),
        pages: String(sc?.pages || "").trim(),
        unit: "Main",
        desc: String(sc?.desc || "").trim(),
        sa: 0,
        veh: Math.max(0, Math.round(Number(sc?.vehicles) || 0)),
        pod: false,
        podVeh: 0,
        cast,
        extras: stunts,
        spacts,
        saChars,
        featured,
        vehNames: [],
        tags: [],
      };
    });
    return {
      num: Math.max(0, Math.round(Number(d?.num) || 0)),
      date: String(d?.date || "").trim(),
      sr: "",
      ss: "",
      loc: String(d?.loc || "").trim(),
      hours: String(d?.hours || "").trim(),
      type: /night/i.test(String(d?.type || "")) ? "Night" : String(d?.type || "").trim(),
      cams: "",
      scenes,
      pages: "",
    };
  }).filter((d: any) => d.scenes.length || d.num)
    .map((d: any, i: number) => ({ ...d, num: i + 1 })); // sequential across merged chunks

  const castMap: Record<string, string> = {};
  for (const m of Array.isArray(raw?.castMap) ? raw.castMap : []) {
    const code = String(m?.code || "").trim();
    const name = String(m?.name || "").trim();
    if (code && name) castMap[code] = name;
  }

  return { days, castMap, notes: [] as any[] };
}
