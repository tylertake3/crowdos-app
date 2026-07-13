// Schedule text → model parser, ported verbatim from the prototype.
// Two formats: the One-Line Schedule (Piccadilly-style conventions) and the
// Expanded / "Full Fat" schedule. parseAny() picks the right one.

import type {
  CastToken,
  NamedCount,
  ScheduleModel,
  ScheduleNote,
  Scene,
  ShootDay,
} from "./types";

// ---- One-Line Schedule parser (Piccadilly-style conventions) ----
const RX = {
  day: /^-{1,}\s*Day\s+(\d+)\s*-\s*(.+?)\s*-{2,}\s*SR\s*([\d:]+)\s*\/\s*SS\s*([\d:]+)/i,
  endDay: /^-{2,}\s*End of Day\s+(\d+)\s*-{2,}\s*(.+?)\s*-{2,}\s*([\d\s\/]+)\s*Pages?/i,
  loc: /^-{2,}\s*(.+?)\s*-{1,}\s*(\d{3,4})\s*-\s*(\d{3,4})\s*(?:-{2,}\s*(CWD|CWN|SCWD))?/,
  scene: /^(\d+\/\d+[A-Z]?)\s*(?:Pt\s*(\d\s*\/\s*\d)|(\d\/\d))?\s+(INT|EXT|I\/E)\s+(.+)$/,
  detail: /^(.*?)\s+(Day|Night|Dawn|Dusk|Dusk\/Night)\s+([A-Z0-9]+)\s+((?:\d+\s+)?(?:\d\/8)?)\s*pgs\.\s*(.*)$/,
  unit: /^[-=\s]*((?:Splinter|CCTV|Stills|2nd)\s*Unit)[-=\s]*$/i,
  cameras: /^-{2,}\s*(\d)\s*Cameras\s*-{2,}$/i,
  hiatus: /HIATUS/i,
  rest: /Rest Day/i,
  sa: /SA'?s:\s*(\d+)/i,
  veh: /(Pod\s+)?Veh:\s*(\d+)/i,
  castCode: /^(?:\d+(?:sd|cd|dd|oc|d)?|st\d+|ST\d*)$/i,
  tagLine:
    /^(Move(?:\s+(?:Set|Downstairs|Upstairs))?|Set Move|Trolley Push\??|Drone(?:\s+U\s*Crane)?|U Crane|Array|Low Loader|Pod|Green Screen|Travel (?:To|From) .+)$/i,
};

export function classifyToken(t: string): CastToken | null {
  const tok = t.trim();
  if (!tok) return null;
  if (/^ST$/i.test(tok)) return { code: "ST", type: "stuntCoord" };
  if (/^st\d+$/i.test(tok)) return { code: tok.toLowerCase(), type: "stuntPerf" };
  if (/^\d+sd$/i.test(tok)) return { code: tok.toLowerCase(), type: "stuntDbl" };
  if (/^\d+(cd|dd|d)$/i.test(tok)) return { code: tok.toLowerCase(), type: "double" };
  if (/^\d+oc$/i.test(tok)) return { code: tok.toLowerCase(), type: "offCam" };
  if (/^\d+$/.test(tok)) return { code: tok, type: "cast" };
  return null;
}

function parseCastList(lines: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  const codeRx =
    /(\d+(?:sd|cd|dd|oc|d)?|st\d+|ST\d*)\.\s*([^]+?)(?=\s+(?:\d+(?:sd|cd|dd|oc|d)?|st\d+|ST\d*)\.|\s*$)/g;
  let inCast = false;
  for (const ln of lines) {
    if (/^CAST MEMBERS/i.test(ln)) { inCast = true; continue; }
    if (inCast && /^==/.test(ln)) break;
    if (!inCast) continue;
    let m;
    while ((m = codeRx.exec(ln)) !== null) {
      const code = m[1];
      const name = m[2].trim().replace(/\s{2,}/g, " ");
      if (name) map[code] = name;
    }
  }
  return map;
}

export function parseSchedule(text: string): ScheduleModel {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .filter(
      (l) =>
        !/^TILLY KENNINGTON/i.test(l) &&
        !/^Registered Address/i.test(l) &&
        !/^\*+CONFIDENTIAL\*+$/i.test(l) &&
        !/^={3,}$/.test(l) &&
        !/^\*{3,}$/.test(l) &&
        l !== "rd"
    );

  const castMap = parseCastList(lines);
  const days: ShootDay[] = [];
  const notes: ScheduleNote[] = [];
  let day: ShootDay | null = null;
  let scene: Scene | null = null;
  let unit = "Main";
  let pendingCastWrap = false;

  const pushScene = () => {
    if (scene && day) day.scenes.push(scene);
    scene = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    let m;

    if ((m = ln.match(RX.day))) {
      pushScene();
      if (day) days.push(day);
      day = {
        num: +m[1],
        date: m[2].trim().replace(/-+$/, "").trim(),
        sr: m[3], ss: m[4],
        loc: "", hours: "", type: "", cams: "", scenes: [], pages: "",
      };
      unit = "Main";
      continue;
    }
    if ((m = ln.match(RX.endDay))) {
      pushScene();
      if (day) { day.pages = m[3].trim(); days.push(day); day = null; }
      continue;
    }
    if (day && !day.loc && (m = ln.match(RX.loc))) {
      day.loc = m[1].replace(/-+$/, "").trim();
      day.hours = m[2] + "–" + m[3];
      day.type = m[4] || "";
      continue;
    }
    if (day && (m = ln.match(RX.cameras))) { day.cams = m[1]; continue; }
    if ((m = ln.match(RX.unit))) { pushScene(); unit = m[1].replace(/\s+/g, " "); continue; }
    if (RX.hiatus.test(ln)) {
      notes.push({
        type: "hiatus",
        text: ln.replace(/\*/g, "").trim(),
        afterDay: day ? day.num : days.length ? days[days.length - 1].num : null,
      });
      continue;
    }
    if (RX.rest.test(ln)) {
      notes.push({
        type: "rest",
        text: ln.replace(/[=\-]/g, "").trim(),
        afterDay: days.length ? days[days.length - 1].num : null,
      });
      continue;
    }

    if (day && (m = ln.match(RX.scene))) {
      pushScene();
      const slugRest = m[5];
      const d = slugRest.match(RX.detail);
      scene = {
        num: m[1],
        part: (m[2] || m[3] || "").replace(/\s/g, ""),
        ie: m[4],
        unit, tags: [], desc: "", sa: 0, veh: 0, pod: false,
        cast: [], pages: "", tod: "", scriptDay: "",
      };
      if (d) {
        scene.slug = d[1].trim();
        scene.tod = d[2];
        scene.scriptDay = d[3];
        scene.pages = (d[4] || "").trim().replace(/\s+/g, " ");
        let rest = d[5] || "";
        const saM = rest.match(RX.sa);
        if (saM) scene.sa = +saM[1];
        const vM = rest.match(RX.veh);
        if (vM) { scene.veh = +vM[2]; scene.pod = !!vM[1]; }
        rest = rest.replace(RX.sa, "").replace(RX.veh, "");
        const toks = rest.split(",").map((s) => s.trim()).filter(Boolean);
        // mark wrap if the token list (pre-SA) ended with a comma
        const pre = d[5].split(/SA'?s:|Pod\s+Veh:|Veh:/)[0];
        pendingCastWrap = /,\s*$/.test(pre);
        for (const t of toks) {
          const c = classifyToken(t);
          if (c) scene.cast.push(c);
        }
      } else {
        scene.slug = slugRest.trim();
      }
      continue;
    }

    if (scene && RX.tagLine.test(ln)) { scene.tags.push(ln); continue; }
    if (day && !scene && RX.tagLine.test(ln)) { continue; }

    // description line (may carry wrapped cast tokens at its tail)
    if (scene && !scene.desc) {
      let desc = ln;
      if (pendingCastWrap) {
        const tail = desc.match(
          /((?:\s*,?\s*(?:\d+(?:sd|cd|dd|oc|d)?|st\d+|ST\d*))+)\s*$/
        );
        if (tail) {
          const toks = tail[1].split(",").map((s) => s.trim()).filter(Boolean);
          if (toks.every((t) => RX.castCode.test(t))) {
            for (const t of toks) {
              const c = classifyToken(t);
              if (c) scene.cast.push(c);
            }
            desc = desc.slice(0, tail.index).replace(/[,\s]+$/, "");
          }
        }
        pendingCastWrap = false;
      }
      scene.desc = desc;
      continue;
    }
    // stray continuation of cast tokens on their own line
    if (scene) {
      const toks = ln.split(",").map((s) => s.trim()).filter(Boolean);
      if (toks.length && toks.every((t) => RX.castCode.test(t))) {
        for (const t of toks) {
          const c = classifyToken(t);
          if (c) scene.cast.push(c);
        }
        continue;
      }
    }
  }
  pushScene();
  if (day) days.push(day);
  return { days, castMap, notes };
}

// ---- Expanded / Full Fat schedule parser ----
const CATEGORIES = new Set([
  "Cast Members", "Background Actors", "Featured Background Actors",
  "Stunt Performers", "Spacts", "Pod Cars", "Vehicles", "Props", "Camera",
  "Grips", "Drone", "Armourer", "Special Effects", "Wardrobe",
  "Art Department", "Makeup/Hair", "Screens", "Notes", "Home Economist",
  "Visual Effects", "Special Equipment", "Photos / Images", "Animals",
  "Additional Labor", "Livestock", "Security", "Set Dressing", "Costumes",
  "Sound", "Music", "Mechanical Effects", "Greenery", "Electric",
  "Miscellaneous", "Optical FX", "Painting", "Construction", "Special FX",
  "Video", "Communications", "Stand Ins",
]);
const SKIP_RX =
  /^(TILLY KENNINGTON|Registered Address|PICCADILLY \/\/|Printed on |\(Continued on next page\)|'CLOWN TOWN'|\*\*2ND UNIT\*\*|2U Director|Schedule Issued|Script Versions|rd$|\d{2}-[A-Za-z]{3}-\d{4}$|\*+CONFIDENTIAL)/i;
const TAG_RX =
  /^(-{0,2}\s*)?(Move(?:\s+(?:Set|Downstairs|Upstairs))?|Set Move|Trolley Push\??|U Crane|Array|Low Loader|Pod|Green Screen|LOCATION MOVE|Travel (?:To|From) .+?)(\s*-{0,2})?$/i;
const OL_DAY_RX =
  /^-{1,}\s*Day\s+(\d+)\s*-\s*(.+?)\s*-{2,}\s*SR\s*([\d:]+)\s*\/\s*SS\s*([\d:]+)/i;
const OL_LOC_RX =
  /^-{2,}\s*(.+?)\s*-{1,}\s*(\d{3,4})\s*-\s*(\d{3,4})\s*(?:-{2,}\s*(CWD|CWN|SCWD))?/;
const OL_CAM_RX = /^-{2,}\s*(\d)\s*Cameras\s*-{2,}$/i;

function parenCount(str: string): NamedCount {
  const m = str.match(/\((\d+)\)\s*$/);
  return m
    ? { name: str.replace(/\s*\(\d+\)\s*$/, "").trim(), count: +m[1] }
    : { name: str.trim(), count: 1 };
}

interface PendingMeta {
  sr: string;
  ss: string;
  loc?: string;
  hours?: string;
  type?: string;
  cams?: string;
}

export function parseExpanded(text: string): ScheduleModel {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !SKIP_RX.test(l));
  const days: ShootDay[] = [];
  const notes: ScheduleNote[] = [];
  const castMap: Record<string, string> = {};
  let day: ShootDay | null = null;
  let scene: Scene | null = null;
  let block: string | null = null;
  let strand = "";
  let pendingMeta: PendingMeta | null = null;
  let pendingSection = "";
  const seenDays = new Set<number>();
  let skipDupe = false;

  const pushScene = () => {
    if (scene && day) day.scenes.push(scene);
    scene = null;
    block = null;
  };

  for (const ln of lines) {
    let m;
    // duplicate-document guard (2nd unit PDF repeats itself)
    if (skipDupe) {
      if (/^End Day #/i.test(ln)) skipDupe = false;
      continue;
    }
    // one-liner style meta that precedes Shoot Day # in the main expanded doc
    if ((m = ln.match(OL_DAY_RX))) { pendingMeta = { sr: m[3], ss: m[4] }; continue; }
    if (pendingMeta && !pendingMeta.loc && (m = ln.match(OL_LOC_RX))) {
      pendingMeta.loc = m[1].replace(/-+$/, "").trim();
      pendingMeta.hours = m[2] + "–" + m[3];
      pendingMeta.type = m[4] || "";
      continue;
    }
    if (pendingMeta && (m = ln.match(OL_CAM_RX))) { pendingMeta.cams = m[1]; continue; }

    if ((m = ln.match(/^Shoot Day #\s*(\d+)\s+(.+)$/i))) {
      pushScene();
      const num = +m[1];
      if (seenDays.has(num)) {
        skipDupe = true;
        if (day) { days.push(day); day = null; }
        continue;
      }
      seenDays.add(num);
      if (day) days.push(day);
      day = {
        num,
        date: m[2].trim(),
        sr: pendingMeta?.sr || "",
        ss: pendingMeta?.ss || "",
        loc: pendingMeta?.loc || pendingSection || "",
        hours: pendingMeta?.hours || "",
        type: pendingMeta?.type || "",
        cams: pendingMeta?.cams || "",
        scenes: [],
        pages: "",
      };
      pendingMeta = null;
      continue;
    }
    if ((m = ln.match(/^End Day #\s*(\d+)\s+.+?--\s*Total Pages:\s*(.+)$/i))) {
      pushScene();
      if (day) { day.pages = m[2].trim(); days.push(day); day = null; }
      continue;
    }
    if ((m = ln.match(/^==\s*(.+?)\s*==$/))) {
      pendingSection = m[1].trim();
      if (day && !day.loc) day.loc = pendingSection;
      if (!day && /HIATUS|Rest Day/i.test(m[1]))
        notes.push({
          type: "note",
          text: m[1],
          afterDay: days.length ? days[days.length - 1].num : null,
        });
      continue;
    }
    if (/^Chase #|^Sequence/i.test(ln)) {
      strand = ln.replace(/\s*Cont'd\.?$/i, "").trim();
      continue;
    }

    if (
      (m = ln.match(
        /^Scene\s*#?\s*(\d+\/\d+[A-Za-z]?)\s*(?:Pt\s*(\d\s*\/\s*\d)|(\d\/\d)|(pt))?\s+(INT|EXT|I\/E)\s+(.+?)\s*pgs\.\s*$/i
      ))
    ) {
      pushScene();
      let body = m[6].trim(), tod = "", scriptDay = "", pages = "";
      const tm = body.match(
        /\s+(Day|Night|Dawn|Dusk)(?:\s+([A-Z0-9]+))?(?:\s+((?:\d+\s+)?\d\/8|\d+))?$/i
      );
      if (tm) {
        tod = tm[1];
        scriptDay = tm[2] || "";
        pages = (tm[3] || "").trim();
        body = body.slice(0, tm.index).trim();
      }
      scene = {
        num: m[1],
        part: (m[2] || m[3] || "").replace(/\s/g, "") || (m[4] ? "pt" : ""),
        ie: m[5].toUpperCase(),
        slug: body,
        tod, scriptDay, pages,
        unit: "Main", desc: "", sa: 0, veh: 0, pod: false, podVeh: 0,
        cast: [], extras: [], spacts: [], featured: [], vehNames: [],
        tags: strand ? [strand] : [],
      };
      block = null;
      continue;
    }
    if (scene && TAG_RX.test(ln)) {
      scene.tags.push(ln.replace(/^-+\s*|\s*-+$/g, ""));
      continue;
    }
    if (!scene && day && TAG_RX.test(ln)) continue;

    if (CATEGORIES.has(ln)) { block = ln; continue; }

    if (scene && !scene.desc && !block) { scene.desc = ln; continue; }
    if (!scene || !block) continue;

    // block content
    if (block === "Cast Members") {
      const cm = ln.match(/^(\d+(?:sd|cd|dd|oc|d)?|st\d+|ST\d*|ST)\.\s*(.+)$/i);
      if (cm) {
        const tok = classifyToken(cm[1]);
        if (tok) {
          scene.cast.push(tok);
          if (cm[2]) castMap[tok.code] = castMap[tok.code] || cm[2].trim();
        }
      }
      continue;
    }
    if (block === "Background Actors") {
      const bm = ln.match(/^(\d+)\s*[xX]\s*C$/);
      if (bm) scene.sa = Math.max(scene.sa, +bm[1]);
      else if ((m = ln.match(/^Crowd\s*\((\d+)\)$/i)))
        scene.sa = Math.max(scene.sa, +m[1]);
      else scene.featured!.push(parenCount(ln));
      continue;
    }
    if (block === "Featured Background Actors") { scene.featured!.push(parenCount(ln)); continue; }
    if (block === "Stunt Performers") { scene.extras!.push(parenCount(ln)); continue; }
    if (block === "Spacts") { scene.spacts!.push(parenCount(ln)); continue; }
    if (block === "Pod Cars") {
      scene.pod = true;
      scene.podVeh! += parenCount(ln).count;
      continue;
    }
    if (block === "Vehicles") {
      const v = parenCount(ln);
      scene.veh += v.count;
      scene.vehNames!.push(ln);
      continue;
    }
    // other categories ignored
  }
  pushScene();
  if (day) days.push(day);
  return { days, castMap, notes };
}

export function parseAny(text: string): ScheduleModel {
  if (/^Shoot Day #/m.test(text)) return parseExpanded(text);
  return parseSchedule(text);
}
