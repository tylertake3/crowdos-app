// "HOD Schedule" parser — the ruled-table shooting schedule.
//
// This layout (Farewell My Lovely and friends) is a Word/Excel TABLE, not the
// monospaced text of a one-liner or the stacked category blocks of a Full Fat.
// Every scene is one table ROW whose cells are:
//
//   Loc | Sc. <num> | INT/EXT | Set / slug | Day D4 | 1 3/8 Pgs | cast | SA's | Est.T
//   <description spans the width underneath>
//
// Reading it as flowed text is hopeless: the cells are vertically centred, so
// a single scene's tokens arrive on three or four different y bands and in
// column order rather than reading order ("Sc." on one line, its number on the
// next). Both text parsers therefore found ZERO shoot days here, the import
// fell through to the AI reader, and the days came back out of order.
//
// So this parser never looks at flowed text. It works on the raw pdf.js items
// and their coordinates: detect where each column lives, cut the page into
// scene blocks at the "SA's" marker that heads every row, then read each block
// cell by cell. Day banners, sunrise/sunset, day totals and the centred
// instruction lines ("LOCATION MOVE TO", "Weather Cover") are full-width rows
// and are picked off separately.
//
// The SA's column is the production's OWN crowd number for the scene, so it
// lands on scene.sa and the day board shows the real crowd immediately; the
// per-scene crowd editor then breaks it down / corrects it as usual.

import type {
  CastToken,
  ScheduleModel,
  ScheduleNote,
  Scene,
  SceneStatus,
  ShootDay,
} from "./types";

export interface LayoutItem {
  str: string;
  x: number;
  y: number;
  w: number;
}

// "Day 1 - Monday 7th Sep - (0800-1830) - SCWD"   (the type and the dash
// before it are both optional; "(0800- 1830)" happens too)
const DAY_RX =
  /^\**\s*Day\s+(\d+)\s*[-–]\s*(.+?)\s*[-–]\s*\(\s*(\d{3,4})\s*[-–]\s*(\d{3,4})\s*\)\s*[-–]?\s*(SCWD|CWD|CWN|SWD)?\s*\**\s*$/i;
const SUN_RX = /^Sunrise\s*([\d:]+)\s*Sunset\s*([\d:]+)/i;
const TOTAL_RX = /Total Pages\s*[-–]?\s*((?:\d+\s+)?\d\/\d|\d+)/i;
const WEEK_RX = /SHOOT WEEK\s+\d+/i;
const OFF_RX = /^\**\s*Days? off\b/i;
const IE_RX = /^(INT\/EXT|EXT\/INT|INT|EXT|I\/E)\.?$/i;
const TOD_RX = /^(Day|Night|Evening|Dawn|Dusk|Morning|Afternoon)$/i;
const SCRIPTDAY_RX = /^[A-Z]\d+[A-Z]?$/;

// Per-scene location, kept as a tag: Scene has no location field, and this
// template's Loc column is genuinely per scene (a day can hop three units).
const LOC_TAG = "Loc: ";

const ROW_TOL = 5; // y spread within one visual row of a ruled table cell
const CENTRE_TOL = 22; // how far off page centre a full-width banner may sit

function mode(xs: number[]): number | null {
  if (!xs.length) return null;
  const counts = new Map<number, number>();
  for (const x of xs) counts.set(x, (counts.get(x) || 0) + 1);
  let best = xs[0], n = 0;
  for (const [x, c] of counts) if (c > n) { best = x; n = c; }
  return best;
}
function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[s.length >> 1];
}

interface Row {
  y: number;
  items: LayoutItem[];
  text: string;
  centred: boolean;
}

// Cluster items into visual rows. A ruled row's cells are centred within the
// cell height, so tokens of one row differ by a few points of y — but the
// description underneath sits a clear line below.
function toRows(items: LayoutItem[]): Row[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: Row[] = [];
  let cur: LayoutItem[] = [];
  let top = 0;
  const flush = () => {
    if (!cur.length) return;
    cur.sort((a, b) => a.x - b.x);
    rows.push({
      y: top,
      items: cur,
      text: cur.map((i) => i.str.trim()).join(" ").replace(/\s{2,}/g, " ").trim(),
      centred: false,
    });
    cur = [];
  };
  for (const it of sorted) {
    if (cur.length && top - it.y > ROW_TOL) flush();
    if (!cur.length) top = it.y;
    cur.push(it);
  }
  flush();
  return rows;
}

// Column boundaries, learned from the document rather than hard-coded: the
// same template is re-typed per production and the columns shift.
interface Cols {
  locEnd: number;
  numEnd: number;
  slugStart: number;
  slugEnd: number;
  todEnd: number;
  sdEnd: number;
  pagesEnd: number;
  castEnd: number;
  saEnd: number;
}

function detectCols(all: LayoutItem[]): Cols | null {
  const at = (pred: (s: string) => boolean) =>
    all.filter((i) => pred(i.str.trim())).map((i) => i.x);
  const xSc = mode(at((s) => /^Sc\.?$/i.test(s)));
  const xIE = mode(at((s) => IE_RX.test(s)));
  const xTod = mode(at((s) => TOD_RX.test(s)));
  const xPgs = mode(at((s) => /^Pgs\.?$/i.test(s)));
  const xSA = mode(at((s) => /^SA'?s$/i.test(s)));
  const xEst = mode(at((s) => /^Est\.?T$/i.test(s)));
  if (xSc == null || xIE == null || xTod == null || xPgs == null || xSA == null)
    return null;
  return {
    locEnd: xSc - 5,
    numEnd: xIE - 5,
    slugStart: xIE + 18,
    slugEnd: xTod - 6,
    todEnd: xTod + 14,
    sdEnd: xPgs - 20,
    pagesEnd: xPgs + 14,
    castEnd: xSA - 10,
    saEnd: (xEst ?? xSA + 20) - 8,
  };
}

// ".J" / ".N" are this template's leads; "SC***" is the stunt coordinator.
function hodToken(raw: string): CastToken | null {
  const t = raw.trim().replace(/[.,]+$/, "");
  if (!t) return null;
  if (/^SC\**$/i.test(t)) return { code: "SC", type: "stuntCoord" };
  if (/^ST\**$/i.test(t)) return { code: "ST", type: "stuntCoord" };
  if (/^\.[A-Za-z]{1,2}$/.test(t))
    return { code: t.slice(1).toUpperCase(), type: "cast" };
  if (/^st\d+$/i.test(t)) return { code: t.toLowerCase(), type: "stuntPerf" };
  if (/^\d+sd$/i.test(t)) return { code: t.toLowerCase(), type: "stuntDbl" };
  if (/^\d+(cd|dd|d)$/i.test(t)) return { code: t.toLowerCase(), type: "double" };
  if (/^\d+oc$/i.test(t)) return { code: t.toLowerCase(), type: "offCam" };
  if (/^\d+$/.test(t)) return { code: t, type: "cast" };
  return null;
}

// The cast page: "  .J. Jay        19. Ava (American Wedding Guest)  ...".
// Codes are their own pdf.js item and end in a full stop, so read code/name
// pairs straight off each row.
function parseHodCast(rows: Row[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const row of rows) {
    let code: string | null = null;
    let name: string[] = [];
    const close = () => {
      if (code && name.length) {
        const n = name.join(" ").replace(/\s{2,}/g, " ").trim();
        if (n) map[code] = map[code] || n;
      }
      code = null;
      name = [];
    };
    for (const it of row.items) {
      const s = it.str.trim();
      const m = s.match(/^(\.?[A-Za-z0-9]{1,4}\**)\.$/);
      if (m) {
        close();
        const tok = hodToken(m[1]);
        code = tok ? tok.code : null;
        continue;
      }
      if (code) name.push(s);
    }
    close();
  }
  return map;
}

const blankScene = (): Scene => ({
  num: "", part: "", ie: "", slug: "", tod: "", scriptDay: "", pages: "",
  unit: "Main", desc: "", sa: 0, veh: 0, pod: false, podVeh: 0,
  cast: [], extras: [], spacts: [], saChars: [], featured: [], vehNames: [],
  tags: [],
});

// A centred instruction line above a scene usually says something about that
// scene: weather cover, a part-scene to finish, a location move.
function statusFor(tags: string[]): SceneStatus | undefined {
  const t = tags.join(" ");
  if (/weather\s*cover/i.test(t)) return "weatherCover";
  if (/to\s*comp(lete)?\b/i.test(t)) return "toComplete";
  if (/to\s*start\b/i.test(t)) return "toStart";
  return undefined;
}

// The template prints "7th Sep" with no year. Take the year from the schedule
// header ("HOD Schedule # 4 - 12/8/26") and roll it forward whenever the month
// goes backwards down the document, so a Dec→Jan shoot doesn't collapse.
const MONTHS = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
function monthOf(date: string): number | null {
  const m = date.match(/\d{1,2}(?:st|nd|rd|th)?\s+([A-Za-z]{3})/i);
  if (!m) return null;
  const i = MONTHS.indexOf(m[1].toLowerCase());
  return i < 0 ? null : i;
}
function baseYear(rows: Row[]): number {
  for (const r of rows.slice(0, 40)) {
    const m = r.text.match(/\b\d{1,2}\/\d{1,2}\/(\d{2}|\d{4})\b/);
    if (m) return m[1].length === 2 ? 2000 + +m[1] : +m[1];
  }
  return new Date().getFullYear();
}

/**
 * Parse a HOD ruled-table schedule from per-page pdf.js layout items.
 * Returns null when the document is not this format, so callers can fall
 * through to the existing text parsers.
 */
export function parseHOD(pages: LayoutItem[][]): ScheduleModel | null {
  const all = pages.flat();
  const cols = detectCols(all);
  if (!cols) return null;

  const pageRows: Row[][] = [];
  for (const items of pages) {
    const rows = toRows(items);
    // Full-width banners are single-cell rows sitting on the table's centre
    // line; the median centre of all single-item rows finds that line.
    const singles = rows.filter((r) => r.items.length === 1);
    const centre =
      median(singles.map((r) => r.items[0].x + r.items[0].w / 2)) ?? 0;
    for (const r of rows)
      r.centred =
        r.items.length === 1 &&
        Math.abs(r.items[0].x + r.items[0].w / 2 - centre) <= CENTRE_TOL;
    pageRows.push(rows);
  }
  const flatRows = pageRows.flat();
  if (flatRows.filter((r) => DAY_RX.test(r.text)).length < 2) return null;

  const castMap = parseHodCast(flatRows);
  const days: ShootDay[] = [];
  const notes: ScheduleNote[] = [];
  let day: ShootDay | null = null;
  let scene: Scene | null = null;
  let block: LayoutItem[] = [];
  let pendingTags: string[] = [];

  const finishScene = () => {
    if (scene && block.length) {
      readBlock(scene, block, cols);
      // A row with neither a number nor a set name is a marker the template
      // draws in the scene grid ("Sc. 2nd unit — 2ND UNIT FILMING TODAY*"),
      // not a scene: nothing can match, cost or edit it, so it would only sit
      // on the day board as a phantom.
      if (day && (scene.num || scene.slug)) day.scenes.push(scene);
    }
    scene = null;
    block = [];
  };
  const finishDay = () => {
    finishScene();
    if (day) days.push(day);
    day = null;
  };

  for (const row of flatRows) {
    let m;
    if (row.centred || !row.items.length) {
      if ((m = row.text.match(DAY_RX))) {
        finishDay();
        pendingTags = [];
        day = {
          num: +m[1],
          date: m[2].trim(),
          sr: "", ss: "",
          loc: "", hours: m[3] + "–" + m[4],
          type: (m[5] || "").toUpperCase(),
          cams: "", scenes: [], pages: "",
        };
        continue;
      }
      if (day && (m = row.text.match(SUN_RX))) {
        day.sr = m[1]; day.ss = m[2];
        continue;
      }
      if ((m = row.text.match(TOTAL_RX))) {
        const pages = m[1].replace(/pgs/i, "").trim();
        finishScene();
        if (day) day.pages = pages;
        continue;
      }
      const clean = row.text.replace(/^\**\s*|\s*\**$/g, "").trim();
      if (!clean) continue;
      if (WEEK_RX.test(clean) || OFF_RX.test(clean)) {
        finishScene();
        notes.push({
          type: OFF_RX.test(clean) ? "rest" : "note",
          text: clean,
          afterDay: day ? day.num : days.length ? days[days.length - 1].num : null,
        });
        continue;
      }
      // any other centred line is an instruction attached to the NEXT scene
      finishScene();
      pendingTags.push(clean);
      continue;
    }
    if (!day) continue;

    // A new scene row begins at its "SA's" marker.
    const isHead = row.items.some((i) => /^SA'?s$/i.test(i.str.trim()));
    if (isHead) {
      finishScene();
      scene = blankScene();
      scene.tags = pendingTags;
      scene.status = statusFor(pendingTags);
      pendingTags = [];
    }
    if (!scene) continue;
    block.push(...row.items);
  }
  finishDay();

  // Day location: the Loc column of the first scene that names a real place.
  // "Loc tbc" / "Loc - TBC*" are the template's placeholder, so they only win
  // if nothing better is printed; the set name is the last resort.
  for (const d of days) {
    if (d.loc) continue;
    const locs = d.scenes
      .map((s) => (s.tags.find((t) => t.startsWith(LOC_TAG)) || "").slice(LOC_TAG.length).trim())
      .filter(Boolean);
    d.loc =
      locs.find((l) => !/^loc\b/i.test(l)) ||
      locs[0] ||
      d.scenes[0]?.slug ||
      "";
  }

  // resolve the printed "7th Sep" into a full date the engine can sort on
  const yr0 = baseYear(flatRows);
  let year = yr0, prevMonth = -1;
  for (const d of days) {
    const mo = monthOf(d.date);
    if (mo != null) {
      if (prevMonth >= 0 && mo < prevMonth) year++;
      prevMonth = mo;
      if (!/\b\d{4}\b/.test(d.date)) d.date = d.date + " " + year;
    }
  }
  return { days, castMap, notes };
}

// Read one scene block: every item belonging to a single table row, possibly
// spread over three or four y bands, bucketed by which column it sits in.
function readBlock(scene: Scene, items: LayoutItem[], c: Cols): void {
  const loc: string[] = [];
  const num: string[] = [];
  const slug: string[] = [];
  const desc: string[] = [];
  const tod: string[] = [];
  const sd: string[] = [];
  const pages: string[] = [];
  const cast: string[] = [];
  let sa: number | null = null;

  for (const it of [...items].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const s = it.str.trim();
    if (!s) continue;
    const x = it.x;
    if (x < c.locEnd) { loc.push(s); continue; }
    if (x < c.numEnd) {
      // the scene-number cell and the full-width description cell share this
      // column; only the description ever contains spaces
      if (/\s/.test(s)) desc.push(s);
      else if (!/^Sc\.?$/i.test(s)) num.push(s);
      continue;
    }
    if (x < c.slugStart) {
      if (IE_RX.test(s)) scene.ie = s.toUpperCase().replace(/\./g, "");
      continue;
    }
    if (x < c.slugEnd) { slug.push(s); continue; }
    if (x < c.todEnd) { if (TOD_RX.test(s)) tod.push(s); continue; }
    if (x < c.sdEnd) { if (SCRIPTDAY_RX.test(s)) sd.push(s); continue; }
    if (x < c.pagesEnd) { if (!/^Pgs\.?$/i.test(s)) pages.push(s); continue; }
    if (x < c.castEnd) { cast.push(s); continue; }
    if (x < c.saEnd) {
      if (/^\d+$/.test(s) && sa == null) sa = +s;
      continue;
    }
    // Est.T column — no home in the model, and never a cost input
  }

  const joined = (a: string[]) => a.join(" ").replace(/\s{2,}/g, " ").trim();
  const rawNum = joined(num);
  // "56pt", "55pt15/29", "87pt5/7" — the part goes in its own field
  const pm = rawNum.match(/^(.+?)pt\s*(\d+\/\d+|\d+)?$/i);
  if (pm) { scene.num = pm[1]; scene.part = pm[2] || "pt"; }
  else scene.num = rawNum;
  scene.slug = joined(slug);
  scene.desc = joined(desc);
  scene.tod = tod.length ? tod[0][0].toUpperCase() + tod[0].slice(1).toLowerCase() : "";
  scene.scriptDay = sd.length ? sd[0] : "";
  scene.pages = joined(pages);
  scene.sa = sa ?? 0;
  if (loc.length) scene.tags = [...scene.tags, LOC_TAG + joined(loc).replace(/,\s*$/, "")];
  for (const t of joined(cast).split(",")) {
    const tok = hodToken(t);
    if (tok) scene.cast.push(tok);
  }
}
