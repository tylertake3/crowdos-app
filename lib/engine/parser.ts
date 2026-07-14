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
  if (/^SC$/i.test(tok)) return { code: "SC", type: "stuntCoord" };
  if (/^xx\d+$/i.test(tok)) return { code: tok.toUpperCase(), type: "cast" };
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
  "Video", "Communications", "Stand Ins", "SA's", "SAs", "Supporting Artists",
  "Stunts", "Background",
]);
const SKIP_RX =
  /^(TILLY KENNINGTON|Registered Address|PICCADILLY \/\/|Printed on |\(Continued on next page\)|'CLOWN TOWN'|\*\*2ND UNIT\*\*|2U Director|Schedule Issued|Script Versions|rd$|th$|\d{2}-[A-Za-z]{3}-\d{4}$|\*+CONFIDENTIAL|©|Production Office:|This document is highly confidential|Therefore, please ensure|Dated:?$|FULL FAT|INTERIM SHOOTING SCHEDULE|SHOOTING$|Shooting Schedule$|SHOOT SCHED)/i;
// page headers repeat on every page of real schedules — always noise
const PAGE_RX = /Page\s*#?\s*:?\s*\d+\s*$/;
const TAG_RX =
  /^(-{0,2}\s*)?(Move(?:\s+(?:Set|Downstairs|Upstairs))?|Set Move|Trolley Push\??|U Crane|Array|Low Loader|Pod|Green Screen|LOCATION MOVE|Travel (?:To|From) .+?)(\s*-{0,2})?$/i;
const OL_DAY_RX =
  /^-{1,}\s*Day\s+(\d+)\s*-\s*(.+?)\s*-{2,}\s*SR\s*([\d:]+)\s*\/\s*SS\s*([\d:]+)/i;
const OL_LOC_RX =
  /^-{2,}\s*(.+?)\s*-{1,}\s*(\d{3,4})\s*-\s*(\d{3,4})\s*(?:-{2,}\s*(CWD|CWN|SCWD))?/;
const OL_CAM_RX = /^-{2,}\s*(\d)\s*Cameras\s*-{2,}$/i;
// Victura-style day banner: "DAY 1 - CALL 11:30 - 21:30 WRAP -SCWD - SR 05:17 / SS 20:43"
const V_DAY_RX =
  /^-{0,2}\s*DAY\s+(\d+)\s*[-–]\s*CALL\s*([\d:]+)\s*[-–]\s*([\d:]+)\s*WRAP\s*[-–]*\s*(CWD EARLY|CWD|SCWD|SWD|CWN)?/i;
// Emb-style day line: "SHOOT DAY 2: TUESDAY 24 SEPTEMBER 2024 | 07:00-16:00 CWD EARLY"
const EMB_DAY_RX =
  /^SHOOT DAY\s+(\d+)\s*:\s*(.+?)(?:\s*\|\s*([\d:]+)\s*[-–]\s*([\d:]+)\s*(CWD EARLY|CWD|SCWD|SWD|CWN)?.*)?$/i;
// Victura scene pair: an INT/EXT line first, then "Scene # 7.73A <description>"
const IE_LINE_RX =
  /^(INT\/EXT|EXT\/INT|INT|EXT|I\/E)\s+(Morning|Afternoon|Evening|Day|Night|Dawn|Dusk)\s+(.+)$/i;
const V_SCENE_RX = /^Scene\s*#\s*([\d][\d.\/]*[A-Za-z]?)\s*(.*)$/i;
// Emb scene line: "310.25 INT 1/8 pgs LOC:" or "312.64pt2 INT THE PARK - THE HUB 2/8 pgs"
const EMB_SCENE_RX = /^(\d+\.\d+(?:\s*(?:pt\d+|[A-Za-z]))?)\s+(INT\/EXT|EXT\/INT|INT|EXT|I\/E)\b\s*(.*)$/i;
// Generic scene lines (DD/POP-style Full Fats): "Scene # 7 INT SLUG Day",
// "Sc 3 EXT. BUS STOP (DFN) NIGHT FF1 2/8 pgs", or a bare "Sc 24" whose
// INT/EXT line follows. Integer scene numbers, no "pgs." required.
const GEN_SCENE_RX =
  /^(?:Scene\s*#|Sc)\s+(\d+[A-Za-z]?(?:\/\d+[A-Za-z]?)?)\s*(?:Pt\s*(\d\s*\/\s*\d))?\s*(.*)$/i;
// day-meta shapes seen around these banners
const SUN_RX = /SUNRISE:?\s*([\d:]+).*?SUNSET:?\s*([\d:]+)/i;
const TYPE_HOURS_RX = /^(CWD EARLY|CWD|SCWD|SWD|CWN)\s*[-–]\s*(\d{3,4})\s*[-–]\s*(\d{3,4})$/i;
const HOURS_TYPE_RX = /^(\d{3,4})\s*[-–]\s*(\d{3,4})\s+(CWD EARLY|CWD|SCWD|SWD|CWN)$/i;
const POP_DAY_RX = /^DAY\s+\d+:\s*[A-Z].*?\s[-–]\s+(.+)$/;

// Parse the remainder of a generic scene line: optional INT/EXT (with or
// without dots), (DFN) day-for-night markers, trailing time-of-day +
// script-day + page count (with or without "pgs").
function applySceneHead(scene: Scene, text: string): void {
  let body = text.trim();
  const ieM = body.match(/^(INT\.?\s*\/\s*EXT\.?|EXT\.?\s*\/\s*INT\.?|I\/E|INT\b\.?|EXT\b\.?)\s*(.*)$/i);
  if (ieM) {
    scene.ie = ieM[1].toUpperCase().replace(/\./g, "").replace(/\s/g, "");
    body = ieM[2];
  }
  if (/\(DFN\)/i.test(body)) {
    scene.tod = scene.tod || "Night";
    body = body.replace(/\(DFN\)/gi, " ").replace(/\s{2,}/g, " ").trim();
  }
  const pgs = body.match(/\s((?:\d+\s+)?\d\/8|\d+)\s*pgs\.?\s*$/i);
  if (pgs) { scene.pages = pgs[1].replace(/\s+/g, " "); body = body.slice(0, pgs.index).trim(); }
  else {
    const frac = body.match(/\s((?:\d+\s+)?\d\/8)\s*$/);
    if (frac) { scene.pages = frac[1].replace(/\s+/g, " "); body = body.slice(0, frac.index).trim(); }
  }
  const tm = body.match(/\s+(Day|Night|Dawn|Dusk|Morning|Afternoon|Evening)(?:\s+([A-Z0-9]{1,6}))?\s*$/i);
  if (tm) {
    scene.tod = tm[1][0].toUpperCase() + tm[1].slice(1).toLowerCase();
    scene.scriptDay = tm[2] || scene.scriptDay;
    body = body.slice(0, tm.index).trim();
  }
  if (body) scene.slug = body;
}

// People-block entries arrive in several shapes; junk (page headers, merged
// vehicle columns) must not become phantom artists. A bare name is only
// accepted if it has no digits and at least one lowercase letter.
function pushCrowdEntry(list: NamedCount[], ln: string): void {
  const pc = ln.match(/\((\d+)\)\s*$/);
  if (pc) { list.push(parenCount(ln)); return; }
  const sq = ln.match(/^(.+?)\s*\[(\d+)\]$/);
  if (sq) { list.push({ name: sq[1].trim(), count: +sq[2] }); return; }
  const nx = ln.match(/^(\d+)\s*[xX]\s+(.+)$/);
  if (nx) {
    // a merged neighbouring column can append e.g. "3 x Military cars" —
    // keep only the first entry's name
    const name = nx[2].split(/\s+\d+\s*[xX]\s/)[0].trim();
    list.push({ name, count: +nx[1] });
    return;
  }
  if (!/\d/.test(ln) && /[a-z]/.test(ln) && ln.length <= 40) list.push({ name: ln.trim(), count: 1 });
}

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

// One-liner day delimiters that mark the END of a day with no start header:
//   "End of DAY 1 Wednesday, 10 September 2025 3 5/8pgs"           (Project 12)
//   "--- END OF DAY 7 -- Saturday, 28 March 2026 -- 4/8 pgs. ..."  (Victura draft)
const END_OF_DAY_RX = /^-*\s*End of DAY\s+(\d+)\b(.*)$/i;
// IE-leading one-liner scene, number optional:
//   "EXT LONDON STADIUM - PITCH Day 4/29PT 1/8"          (TL3)
//   "7 07 INT HALSTEAD MANOR - SITTING ROOM 29 1 7/8pgs 5, 6, 7 FE :"  (Project 12)
//   "INT HALSTEAD MANOR - MAIN STAIRCASE 29 1/8pgs 5, 6 FE :"          (Project 12, no number)
const OL_SCENE_RX =
  /^(?:(\d+)\s+)?(?:(\d+[A-Za-z]?(?:pt\d+)?)\s+)?(INT\/EXT|EXT\/INT|INT|EXT|I\/E)\b\s+(.+)$/i;

const blankScene = (unit: string, strand: string): Scene => ({
  num: "", part: "", ie: "", slug: "", tod: "", scriptDay: "", pages: "",
  unit, desc: "", sa: 0, veh: 0, pod: false, podVeh: 0,
  cast: [], extras: [], spacts: [], featured: [], vehNames: [],
  tags: strand ? [strand] : [],
});

// Pull a trailing comma-separated cast-number list ("… 5, 6, 7, 13") off the
// tail of a line, returning the cast tokens and the line with them removed.
function takeCastTail(s: string): { cast: CastToken[]; rest: string } {
  const m = s.match(/\s((?:\d+[a-z]{0,3})(?:\s*,\s*\d+[a-z]{0,3})*)\s*$/i);
  if (!m || !m[1].includes(",") && !/^\d+[a-z]{0,3}$/i.test(m[1].trim()))
    return { cast: [], rest: s };
  const cast: CastToken[] = [];
  for (const t of m[1].split(",")) {
    const c = classifyToken(t.trim());
    if (c) cast.push(c);
  }
  return { cast, rest: s.slice(0, m.index).trim() };
}

// Category cells can merge with a neighbouring column during PDF text
// extraction ("Cast Members Props") — match on the known prefix. Only
// multi-word categories are prefix-matched: single words like "Security"
// would swallow real content ("Security Guard" is a featured artist).
function categoryOf(ln: string): string | null {
  if (CATEGORIES.has(ln)) return ln;
  for (const c of CATEGORIES)
    if (c.includes(" ") && ln.startsWith(c + " ")) return c;
  return null;
}

export function parseExpanded(text: string): ScheduleModel {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !SKIP_RX.test(l) && !PAGE_RX.test(l));
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
  // Victura writes the INT/EXT line before its "Scene #" line — stash it
  let pendingIE: { ie: string; tod: string; slug: string; pages: string; scriptDay: string } | null = null;
  // Emb sometimes puts the set name on the line after "LOC:"
  let wantSlug = false;
  // POP writes "Sc 24" alone — its INT/EXT line follows
  let genWaitIE = false;

  // Only headerless one-liners (no "Shoot Day #" / "SHOOT DAY N:") open days
  // implicitly on their first scene; header-based schedules must not.
  const implicitDays =
    !/^Shoot Day #/m.test(text) && !/^SHOOT DAY\s+\d+\s*:/m.test(text);
  let implicitNum = 0;
  const pushScene = () => {
    if (scene && day) day.scenes.push(scene);
    scene = null;
    block = null;
  };
  // one-liners with no "Shoot Day #" header open a day implicitly on the
  // first scene; the "End of DAY" line supplies its number and date
  const ensureDay = () => {
    if (day) return;
    day = { num: ++implicitNum, date: "", sr: "", ss: "", loc: pendingSection || "", hours: "", type: "", cams: "", scenes: [], pages: "" };
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
    // Victura-style banner: call/wrap hours and day type live here
    if ((m = ln.match(V_DAY_RX))) {
      const srss = ln.match(/SR\s*([\d:]+)\s*\/\s*SS\s*([\d:]+)/i);
      pendingMeta = { sr: srss?.[1] || "", ss: srss?.[2] || "", hours: m[2] + "–" + m[3], type: (m[4] || "").toUpperCase() };
      continue;
    }
    if (pendingMeta && !pendingMeta.loc && (m = ln.match(OL_LOC_RX))) {
      pendingMeta.loc = m[1].replace(/-+$/, "").trim();
      pendingMeta.hours = m[2] + "–" + m[3];
      pendingMeta.type = m[4] || "";
      continue;
    }
    if (pendingMeta && (m = ln.match(OL_CAM_RX))) { pendingMeta.cams = m[1]; continue; }
    // DD/POP day banners: sunrise/sunset, hours + day-type in either order,
    // and POP's "DAY 1: TUESDAY 20TH JULY - CAMBERWELL" location suffix
    if ((m = ln.match(SUN_RX)) && !/^Shoot Day/i.test(ln)) {
      pendingMeta = pendingMeta || { sr: "", ss: "" };
      if (!pendingMeta.sr) pendingMeta.sr = m[1];
      if (!pendingMeta.ss) pendingMeta.ss = m[2];
      continue;
    }
    if ((m = ln.match(TYPE_HOURS_RX))) {
      pendingMeta = pendingMeta || { sr: "", ss: "" };
      pendingMeta.type = m[1].toUpperCase();
      pendingMeta.hours = m[2] + "–" + m[3];
      continue;
    }
    if ((m = ln.match(HOURS_TYPE_RX))) {
      pendingMeta = pendingMeta || { sr: "", ss: "" };
      pendingMeta.hours = m[1] + "–" + m[2];
      pendingMeta.type = m[3].toUpperCase();
      continue;
    }
    if ((m = ln.match(POP_DAY_RX))) {
      pendingMeta = pendingMeta || { sr: "", ss: "" };
      if (!pendingMeta.loc) pendingMeta.loc = m[1].trim();
      continue;
    }
    // Victura: the location is a bare ALL-CAPS line under the day banner
    if (pendingMeta && !pendingMeta.loc && !day && /^[A-Z0-9 &/.,'()\-]{6,}$/.test(ln) && !/^(DAY|SHOOT|BLOCK|STUNTS?$|WEEK)\b/.test(ln)) {
      pendingMeta.loc = ln;
      continue;
    }

    // Emb-style day line carries date, hours and day type itself
    if ((m = ln.match(EMB_DAY_RX)) && !/^SHOOT DAY #/i.test(ln)) {
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
        sr: "", ss: "",
        loc: pendingSection || "",
        hours: m[3] && m[4] ? m[3] + "–" + m[4] : "",
        type: (m[5] || "").toUpperCase(),
        cams: "", scenes: [], pages: "",
      };
      pendingMeta = null;
      continue;
    }

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
    // Emb variant: "End of Day | 1 Monday, 23 September 2024 | Page Count: 2 1/8"
    if ((m = ln.match(/^End of Day\s*\|.*?(?:Page Count:\s*(.+))?$/i))) {
      pushScene();
      if (day) { day.pages = (m[1] || "").trim(); days.push(day); day = null; }
      continue;
    }
    // "End of DAY 1 Wednesday, 10 September 2025 …" — closes an implicitly
    // opened day (one-liners with no start header), supplying num + date
    if ((m = ln.match(END_OF_DAY_RX))) {
      pushScene();
      ensureDay();
      if (day) {
        day.num = +m[1];
        const dm = (m[2] || "").match(/([A-Za-z]+day,?\s+\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\s+\d{4})/);
        if (dm) day.date = dm[1];
        const pg = (m[2] || "").match(/((?:\d+\s+)?\d\/\d)\s*pgs?/i);
        if (pg) day.pages = pg[1].trim();
        days.push(day);
        day = null;
      }
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
    // Emb: scene number leads the line — "310.25 INT THE PARK - THE HUB 1 1/8 pgs"
    // (also one-liners like Victura draft "3.61B INT HARVARD", which open a
    // day implicitly since they carry no "Shoot Day #" header)
    if ((day || implicitDays) && (m = ln.match(EMB_SCENE_RX))) {
      ensureDay();
      pushScene();
      let body = m[3].replace(/\bLOC\s*:.*$/i, "").trim();
      let pages = "";
      const pm = body.match(/((?:\d+\s+)?\d\/8|\d+)\s*(?:pgs\.?)?\s*$/);
      if (pm) { pages = pm[1].replace(/\s+/g, " "); body = body.slice(0, pm.index).trim(); }
      scene = {
        num: m[1].replace(/\s+/g, " "), part: "", ie: m[2].toUpperCase(), slug: body,
        tod: "", scriptDay: "", pages,
        unit: "Main", desc: "", sa: 0, veh: 0, pod: false, podVeh: 0,
        cast: [], extras: [], spacts: [], featured: [], vehNames: [],
        tags: strand ? [strand] : [],
      };
      block = null;
      wantSlug = !body;
      continue;
    }
    // Victura: the INT/EXT line arrives before its "Scene #" line — stash it
    if (day && (m = ln.match(IE_LINE_RX))) {
      let rest = m[3].trim();
      let pages = "";
      const pm = rest.match(/((?:\d+\s+)?\d\/8|\d+\/\d+)\s*$/);
      if (pm) { pages = pm[1].replace(/\s+/g, " "); rest = rest.slice(0, pm.index).trim(); }
      let scriptDay = "";
      const sd = rest.match(/^(\d+[A-Z]?)\s+/);
      if (sd) { scriptDay = sd[1]; rest = rest.slice(sd[0].length).trim(); }
      pendingIE = { ie: m[1].toUpperCase(), tod: m[2][0].toUpperCase() + m[2].slice(1).toLowerCase(), slug: rest, pages, scriptDay };
      block = null; // the previous scene's category block is over
      continue;
    }
    // an IE line without a set name gets it from the next ALL-CAPS line
    // ("EXT Night 3/8" then "8 DUNKESWELL - AIRFIELD BENTWATERS")
    if (pendingIE && !pendingIE.slug && /^\d*\s*[A-Z0-9 &/.,'()\-]{4,}$/.test(ln)) {
      const mm = ln.match(/^(\d+[A-Z]?)\s+(.+)$/);
      if (mm) {
        pendingIE.scriptDay = pendingIE.scriptDay || mm[1];
        pendingIE.slug = mm[2].trim();
      } else pendingIE.slug = ln.trim();
      continue;
    }
    if (day && pendingIE && (m = ln.match(V_SCENE_RX))) {
      pushScene();
      scene = {
        num: m[1], part: "", ie: pendingIE.ie, slug: pendingIE.slug,
        tod: pendingIE.tod, scriptDay: pendingIE.scriptDay, pages: pendingIE.pages,
        unit: "Main", desc: m[2].trim(), sa: 0, veh: 0, pod: false, podVeh: 0,
        cast: [], extras: [], spacts: [], featured: [], vehNames: [],
        tags: strand ? [strand] : [],
      };
      pendingIE = null;
      block = null;
      if (!scene.slug) wantSlug = true; // set name may sit on the next line
      continue;
    }
    // DD/POP generic scene lines — must come after the stricter formats
    if (day && (m = ln.match(GEN_SCENE_RX)) && !/^Sc\s+\d+\s*[-–]/.test(ln)) {
      pushScene();
      scene = {
        num: m[1], part: (m[2] || "").replace(/\s/g, ""), ie: "", slug: "",
        tod: "", scriptDay: "", pages: "",
        unit: "Main", desc: "", sa: 0, veh: 0, pod: false, podVeh: 0,
        cast: [], extras: [], spacts: [], featured: [], vehNames: [],
        tags: strand ? [strand] : [],
      };
      block = null;
      applySceneHead(scene, m[3] || "");
      genWaitIE = !scene.ie; // "Sc 24" alone — INT/EXT arrives on the next line
      continue;
    }
    // the INT/EXT line following a bare "Sc 24"
    if (scene && genWaitIE) {
      genWaitIE = false;
      if (/^(INT|EXT|I\/E)/i.test(ln)) { applySceneHead(scene, ln); continue; }
    }

    // IE-leading one-liner scene (TL3, Project 12) — number optional. Only
    // fires when the line carries a page fraction, so full-fat prose/slug
    // lines that merely start with INT/EXT can't be mistaken for scenes.
    if ((day || implicitDays) && (m = ln.match(OL_SCENE_RX)) && /(?:\d+\s+)?\d\/\d/.test(m[4]) && !categoryOf(ln)) {
      ensureDay();
      pushScene();
      const s = blankScene("Main", strand);
      s.num = m[2] || (m[1] || "");
      s.ie = m[3].toUpperCase().replace(/\./g, "").replace(/\s/g, "");
      let rest = m[4].replace(/\bFE\s*:?\s*$/i, "").trim();
      const tail = takeCastTail(rest); // trailing "5, 6, 7" cast numbers
      if (tail.cast.length) { s.cast.push(...tail.cast); rest = tail.rest; }
      applySceneHead(s, rest); // slug + tod + pages from what remains
      scene = s;
      block = null;
      continue;
    }

    if (scene && TAG_RX.test(ln)) {
      scene.tags.push(ln.replace(/^-+\s*|\s*-+$/g, ""));
      continue;
    }
    if (!scene && day && TAG_RX.test(ln)) continue;

    const cat = categoryOf(ln);
    if (cat) { block = cat; continue; }

    // Emb per-scene metadata between the scene line and its categories
    if (scene && !block) {
      if (wantSlug && /^[A-Z0-9 &/.,'()\-]{4,}$/.test(ln)) { scene.slug = ln; wantSlug = false; continue; }
      if ((m = ln.match(/^(.+?)\s*\((D|N)\)$/)) && !scene.tod) { scene.tod = m[2] === "D" ? "Day" : "Night"; continue; }
      if (/^[DN]\d+[A-Z]?$/i.test(ln) && !scene.scriptDay) { scene.scriptDay = ln.toUpperCase(); continue; }
    }

    // a lone tod/pages tail line ("DAY 16 3/8 pgs") completes the scene
    // head rather than becoming its description
    if (scene && !block && !scene.tod &&
        /^(Day|Night|Dawn|Dusk|Morning|Afternoon|Evening)\b(\s+[A-Z0-9]{1,6})?(\s+(?:\d+\s+)?\d\/8)?(\s*pgs\.?)?\s*$/i.test(ln)) {
      applySceneHead(scene, ln);
      continue;
    }
    if (scene && !scene.desc && !block) {
      // one-liners often trail the scene's cast numbers on the description
      // line ("…VFX PASS 5, 10, 11, 13"); lift a clear comma-list into cast
      let d = ln;
      if (!scene.cast.length) {
        const t = takeCastTail(d);
        if (t.cast.length >= 2) { scene.cast.push(...t.cast); d = t.rest; }
      }
      scene.desc = d;
      continue;
    }
    if (!scene || !block) continue;

    // block content
    if (block === "Cast Members") {
      const cm = ln.match(/^(\d+(?:sd|cd|dd|oc|d)?|st\d+|ST\d*|ST|SC|XX\d+)\.\s*(.+)$/i);
      if (cm) {
        const tok = classifyToken(cm[1]);
        if (tok) {
          // numbered cast whose NAME says stunt ("500. STUNT CO-ORD")
          if (tok.type === "cast" && /\bSTUNT/i.test(cm[2]))
            tok.type = /CO-?ORD/i.test(cm[2]) ? "stuntCoord" : "stuntPerf";
          scene.cast.push(tok);
          if (cm[2]) castMap[tok.code] = castMap[tok.code] || cm[2].trim();
        }
      }
      continue;
    }
    if (block === "Stunts") {
      // "STUNT CO-ORDINATOR", "STUNT CO-ORDINATOR DART", "2 x stunt drivers"
      const nx = ln.match(/^(\d+)\s*[xX]\s+(.+)$/);
      if (nx) scene.extras!.push({ name: nx[2].trim(), count: +nx[1] });
      else if (!/\d/.test(ln) && ln.length <= 48) {
        // the coordinator often appears BOTH as an SC. cast line and in the
        // Stunts block — don't count them twice
        if (/CO-?ORD/i.test(ln) && scene.cast.some((c) => c.type === "stuntCoord")) continue;
        scene.extras!.push({ name: ln.trim(), count: 1 });
      }
      continue;
    }
    if (block === "Background Actors" || block === "Background") {
      // case-insensitive: the Piccadilly schedule writes both "160 x C" and
      // "160 x c" — the prototype missed the lowercase form, undercounting
      // Day 77 by 159 SAs (~£22.5k)
      const bm = ln.match(/^(\d+)\s*[xX]\s*C$/i);
      if (bm) scene.sa = Math.max(scene.sa, +bm[1]);
      else if ((m = ln.match(/^Crowd\s*\((\d+)\)$/i)))
        scene.sa = Math.max(scene.sa, +m[1]);
      else pushCrowdEntry(scene.featured!, ln);
      continue;
    }
    if (block === "SA's" || block === "SAs" || block === "Supporting Artists") {
      // Emb style: "HUB AGENTS [10]"
      pushCrowdEntry(scene.featured!, ln);
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
  // Emb-style schedules carry no day-level location — fall back to the
  // first scene's set so the travel-band auto-detect has something to read
  for (const d of days)
    if (!d.loc && d.scenes.length && d.scenes[0].slug) d.loc = d.scenes[0].slug!;
  return { days, castMap, notes };
}

export function parseAny(text: string): ScheduleModel {
  if (
    /^Shoot Day #/m.test(text) ||
    /^SHOOT DAY\s+\d+\s*:/m.test(text) ||
    /End of DAY\s+\d+/i.test(text) // one-liners delimited only by day-end lines
  )
    return parseExpanded(text);
  return parseSchedule(text);
}
