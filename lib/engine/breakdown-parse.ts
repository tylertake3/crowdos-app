// Turning an already-made crowd breakdown into a ScheduleModel.
//
// This is the REVERSE of breakdown-doc.ts. That module projects the app's model
// into the crowd breakdown a production circulates; this one reads such a
// breakdown back in, so a production that has already built its breakdown by
// hand can bring it into the app instead of retyping it.
//
// It is deterministic — no AI. A crowd breakdown is a table with a fixed
// vocabulary ("SHOOT DAY 6", "As above (32)", "32 x SUPPORTING ARTISTS"), and
// breakdown-grid has already recovered its columns and colours. Reading it is
// therefore parsing, not interpretation, and parsing is free, instant, and gives
// the same answer twice. The AI reader stays where it is genuinely needed: the
// unpredictable prose of a shooting schedule.
//
// WHAT THIS DOCUMENT KNOWS THAT A SCHEDULE DOES NOT
//
// A breakdown is the richer source. It carries, per scene, exactly what the app
// otherwise asks an AD to enter by hand:
//   · named crowd groups with counts, on the right tier (the COLUMN says which)
//   · children, doubles and action vehicles (the COLOUR says which)
//   · "As above" / "(10x from above)" continuity, so the same bodies are not
//     counted twice
//   · the AD's OWN day totals, which is a second opinion on our arithmetic
//
// THREE RULES THAT CARRY THE WHOLE THING
//
// 1. NOTHING IS INVENTED. A cell that does not parse is kept verbatim on
//    `unparsed` against its scene. A colour that the document's own key does not
//    explain imports as `tierTbc` for the AD to resolve — never guessed from
//    what the colour "usually" means, because blue is doubles on this production
//    and could be SPACT on the next.
//
// 2. THE DOCUMENT'S TOTALS ARE NEVER TRUSTED, AND NEVER DISCARDED. Day totals
//    are stored on `declaredTotals` beside the derived sums, never in place of
//    them. Real breakdowns contain arithmetic slips; surfacing the difference is
//    the point of importing them at all.
//
// 3. "FROM ABOVE" MEANS THE SAME PEOPLE — AND ITS ABSENCE MEANS NEW ONES. A
//    group marked "(from above)", or a scene marked "As above (32)", is not new
//    bodies and adds nothing to the day. A group written out WITHOUT that marker
//    is a fresh booking even if an earlier scene that day names the same group,
//    because this kind of document marks its carry-overs explicitly every time.
//    That is what makes the day figures reproducible: see dayHeads.

import type {
  NamedCount,
  ReqFlag,
  ReqTier,
  ReqUnitType,
  Scene,
  ScheduleModel,
  ScheduleNote,
  ShootDay,
} from "./types";
import { cellsOf, cellOf, type BdCell, type BdGridRow } from "./breakdown-grid";

// ── Colour ─────────────────────────────────────────────────────────────────

// A colour family name, as an AD would write it in a key line.
type ColourName = "blue" | "orange" | "green" | "pink" | "red" | "yellow" | "purple" | "black" | "white";

// Which colour family a fill belongs to. Hue bands, not exact values: two
// productions' "orange" are #ff9300 and #ed7d31, and a key line that says
// ORANGE must match both. Near-grey and near-white are not colour statements —
// black is ordinary text and white is the reversed-out text of a banner — so
// they are reported as such and never carry meaning.
export function colourFamily(hex: string): ColourName | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const light = (max + min) / 2;
  const sat = max === min ? 0 : (max - min) / (1 - Math.abs(2 * light - 1));
  if (sat < 0.25) return light > 0.6 ? "white" : "black";
  let hue = 0;
  if (max === min) hue = 0;
  else if (max === r) hue = 60 * (((g - b) / (max - min)) % 6);
  else if (max === g) hue = 60 * ((b - r) / (max - min) + 2);
  else hue = 60 * ((r - g) / (max - min) + 4);
  if (hue < 0) hue += 360;
  if (hue < 15 || hue >= 345) return "red";
  if (hue < 45) return "orange";
  if (hue < 70) return "yellow";
  if (hue < 170) return "green";
  if (hue < 260) return "blue";
  if (hue < 290) return "purple";
  return "pink";
}

// What a colour, once named, does to a requirement row. `tier` replaces the
// tier the column implied; `flag` is display-only and leaves the tier alone.
interface ColourMeaning {
  tier?: ReqTier;
  flag?: ReqFlag;
  unitType?: ReqUnitType;
  label: string;
}

// The MEANINGS an AD's key line can state, matched on the words it uses. This is
// a vocabulary of meanings, not of colours — which colour carries which meaning
// is read from the document every time.
const MEANINGS: { re: RegExp; meaning: ColourMeaning }[] = [
  { re: /\bchild(ren)?\b|\bminors?\b|\bchaperone/i, meaning: { tier: "Child", label: "children" } },
  { re: /\baction\s*veh|\bAVs?\b/i, meaning: { tier: "AV", unitType: "vehicle", label: "action vehicles" } },
  { re: /\bfeatured\b/i, meaning: { tier: "Featured", label: "featured" } },
  { re: /\bdoubles?\b|\bstand[\s-]?ins?\b/i, meaning: { flag: "double", label: "doubles / stand-ins" } },
  { re: /\bstunts?\b/i, meaning: { tier: "Stunt", label: "stunts" } },
  { re: /\bSPACTs?\b|\bspecial\s*ability/i, meaning: { tier: "SPACT", label: "SPACTs" } },
];

const COLOUR_WORDS: Record<string, ColourName> = {
  blue: "blue", orange: "orange", green: "green", pink: "pink", magenta: "pink",
  red: "red", yellow: "yellow", purple: "purple", violet: "purple",
};

export interface ColourLegend {
  /** Colour family → what the document says it means. */
  byColour: Map<ColourName, ColourMeaning>;
  /** The key line as printed, for the review screen. */
  source: string;
}

// Read the document's own colour key.
//
// Both orders occur in real documents and both are accepted:
//   "BLUE - DOUBLES"        colour first
//   "FEATURED - PINK"       meaning first
// Anything the vocabulary above does not recognise is left out rather than
// guessed, which is what makes an unexplained colour import as tierTbc.
export function readColourLegend(lines: string[]): ColourLegend | null {
  const line = lines.find((l) => /COLOUR\s*KEY|COLOR\s*KEY|\bKEY\s*:/i.test(l));
  if (!line) return null;
  const body = line.replace(/^.*?(?:COLOUR|COLOR)?\s*KEY\s*[:\-]?/i, "");
  const byColour = new Map<ColourName, ColourMeaning>();
  for (const part of body.split(/,|;/)) {
    if (!part.trim()) continue;
    let colour: ColourName | null = null;
    for (const [word, fam] of Object.entries(COLOUR_WORDS)) {
      if (new RegExp("\\b" + word + "\\b", "i").test(part)) { colour = fam; break; }
    }
    if (!colour) continue;
    // Strip the colour word before matching the meaning, so "PINK - FEATURED"
    // cannot have "pink" itself read as the meaning.
    const rest = part.replace(new RegExp("\\b" + colour + "\\b", "gi"), " ");
    const hit = MEANINGS.find((m) => m.re.test(rest));
    if (hit && !byColour.has(colour)) byColour.set(colour, hit.meaning);
  }
  return byColour.size ? { byColour, source: line.trim() } : null;
}

// ── Is this document a crowd breakdown at all? ──────────────────────────────

// Told apart from a shooting schedule by the things ONLY a breakdown has: the
// requirement column headings, and the per-day crowd footer. Two independent
// signals are required, because a Full Fat schedule mentions crowd constantly and
// a one-liner can carry the word "CROWD" in a title — but neither prints
// "SPACTs CHARACTERS/REQUIREMENTS" above a column, and neither footers each day
// with "43 x SUPPORTING ARTISTS".
//
// Getting this wrong in either direction is costly, so it is deliberately strict:
// a breakdown misread as a schedule loses every crowd figure in it, and a
// schedule misread as a breakdown produces a day board with no crowd at all.
export function looksLikeBreakdown(text: string): boolean {
  let score = 0;
  if (/CROWD\s+CHARACTERS?\s*\/\s*REQUIREMENTS/i.test(text)) score += 2;
  if (/SPACTs?\s+CHARACTERS?\s*\/\s*REQUIREMENTS/i.test(text)) score += 2;
  if (/STUNTS?\s+CHARACTERS?\s*\/\s*REQUIREMENTS/i.test(text)) score += 1;
  if (/\bCROWD\s+BREAKDOWN\b/i.test(text)) score += 1;
  // The per-day footer, which a schedule never has. Needs to appear more than
  // once — a single occurrence could be a note anywhere in a document.
  const footers = text.match(/\d[\d,]*\s*x\s*(?:SUPPORTING\s+ARTISTS?|SPACTs?)\b/gi) || [];
  if (footers.length >= 3) score += 2;
  else if (footers.length) score += 1;
  return score >= 3;
}

// ── Row classification ─────────────────────────────────────────────────────

const DATE_RE =
  /^(Mon|Tues?|Wednes|Thur?s|Fri|Satur|Sun)day\s+(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s*(\d{4})?/i;
const WEEK_RE = /^\s*(?:SHOOT\s+)?WEEK\s*#?\s*(\d+)/i;
const SCENE_RE = /^\s*(?:Sc\.?|Scene)\s*(?:s\b|\.)?\s*/i;
// "32 x SUPPORTING ARTISTS", "0 xSPACTs (Special Action Extras)", "1 x STUNTS"
const TOTAL_RE = /(\d[\d,]*)\s*x\s*(SUPPORTING\s+ARTIST|SA|SPACT|STUNT|CHILD|AV|ACTION\s+VEH)/i;
// The document's closing figure for the whole shoot, as opposed to one day's.
// Named by its own wording ("CROWD TOTALS (UK):", "TOTAL CROWD", "GRAND TOTAL").
const GRAND_TOTAL_RE = /\b(?:CROWD\s+TOTALS?|TOTAL\s+CROWD|GRAND\s+TOTALS?|OVERALL\s+TOTALS?)\b/i;

export type BdRowKind = "week" | "day" | "dayTotal" | "scene" | "banner" | "cont" | "note";

export function classifyRow(row: BdGridRow): BdRowKind {
  const left = cellOf(row, "left");
  const all = row.text;
  if (WEEK_RE.test(left) || WEEK_RE.test(all.slice(0, 24))) return "week";
  if (DATE_RE.test(left)) return "day";
  // A totals row is recognised by its own wording, and must be tested before
  // "scene" because it lives in the requirement columns like any other row.
  if (TOTAL_RE.test(all) && /ARTIST|SPACT|STUNT/i.test(all)) return "dayTotal";
  const sceneish = [cellOf(row, "left"), cellOf(row, "ie")].find((t) => SCENE_RE.test(t) && /\d|tbc/i.test(t));
  if (sceneish) return "scene";
  const hasReq = !!(cellsOf(row, "crowd").length || cellsOf(row, "spact").length || cellsOf(row, "stunt").length);
  const hasBody = !!(cellOf(row, "slug") || cellOf(row, "desc"));
  if (hasReq) return "cont";
  if (hasBody) return "banner";
  return "note";
}

// ── Requirement cells ──────────────────────────────────────────────────────

// A group whose people came from an earlier scene. Both spellings occur, with or
// without a count, and the count may be written either side of the name.
const FROM_ABOVE_N = /\(\s*(\d[\d,]*)\s*x?\s*(?:from|as)\s+(above|below)[^)]*\)\s*$/i;
const FROM_ABOVE_0 = /\(\s*(?:from|as)\s+(above|below)[^)]*\)\s*$/i;
// A whole cell that is nothing but a pointer: this scene's list IS the previous
// scene's list. "As above (32)" / "As above" / "AS ABOVE (141)".
const AS_ABOVE_ONLY = /^\s*(?:as|same\s+as)\s+above\s*(?:\(\s*(\d[\d,]*)\s*\))?\s*\.?\s*$/i;
const NA_ONLY = /^\s*(?:n\s*\/\s*a|none|nil|no\s+crowd|0)\s*\.?\s*$/i;
// A leading count: "30 Will's Office Colleagues", "2 x Padel Staff".
const LEADING_N = /^\s*(\d[\d,]*)\s*(?:x\b|×)?\s*(.+)$/;

export interface ParsedReq {
  kind: "group" | "asAbove" | "na";
  /** Present on kind "group". */
  req?: NamedCount;
  /** Present on kind "asAbove": the count the pointer states, if any. */
  count?: number;
  raw: string;
}

// One requirement cell → one row of the model.
//
// `tier` is what the COLUMN implies. The colour legend may override it (an
// orange row in the crowd column is a child, not crowd) — that happens in
// applyColour, so this function stays about the words alone and is testable
// without any of the colour machinery.
export function parseReqCell(text: string, tier: ReqTier): ParsedReq {
  const raw = text.trim();
  if (!raw) return { kind: "na", raw };
  const ptr = AS_ABOVE_ONLY.exec(raw);
  if (ptr) return { kind: "asAbove", count: ptr[1] ? num(ptr[1]) : undefined, raw };
  if (NA_ONLY.test(raw)) return { kind: "na", raw };

  let body = raw;
  const flags: ReqFlag[] = [];
  let contRef: string | undefined;
  let count: number | null = null;

  // "Beach Goers (80x from above)" — the count belongs to the group, and the
  // marker says they are the same people as an earlier scene's.
  const withN = FROM_ABOVE_N.exec(body);
  const withoutN = withN ? null : FROM_ABOVE_0.exec(body);
  if (withN || withoutN) {
    flags.push("asAbove");
    contRef = (withN ? withN[0] : withoutN![0]).trim();
    if (withN) count = num(withN[1]);
    body = body.slice(0, (withN || withoutN!).index).trim();
  }

  // A leading number is the head count. Without the "from above" case above,
  // a group with no number at all is a wrap or a heading, not a booking.
  if (count === null) {
    const lead = LEADING_N.exec(body);
    if (lead) { count = num(lead[1]); body = lead[2].trim(); }
  }
  const name = body.replace(/\s+/g, " ").trim();
  if (!name) return { kind: "na", raw };
  return {
    kind: "group",
    raw,
    req: {
      name,
      count: count ?? 0,
      tier,
      ...(flags.length ? { flags } : {}),
      ...(contRef ? { contRef } : {}),
      // Stunts, children and action vehicles are imported so the document's own
      // totals can be reconciled and nothing is silently dropped — they are
      // explicitly outside the crowd budget. ("STUNTS ARE NOT A PART OF THE
      // CROWD BUDGET", in this document's own footer.)
      budgetScope: tier === "SA" || tier === "Featured" || tier === "SPACT" ? "crowd" : "reference",
      source: "breakdown_import",
    },
  };
}

function num(s: string): number {
  return Math.round(Number(String(s).replace(/,/g, "")) || 0);
}

// Apply the document's colour legend to a parsed row.
//
// COLOUR ONLY RE-TIERS A ROW IN THE CROWD COLUMN, and that restriction matters.
// The SPACT and STUNT columns are an explicit statement of tier — an AD put the
// row there — whereas the crowd column is the general one, which is exactly why
// productions colour-code inside it to pick out the children, the doubles and the
// action vehicles. A pink row in the SPACT column is a SPACT that is featured or
// has a line; re-tiering it to Featured on the strength of its colour deletes a
// SPACT from the day and moves its cost onto the wrong rate. So outside the crowd
// column the colour is recorded as a note and the column wins.
//
// An unexplained colour is NOT guessed: the row imports on its column's tier but
// flagged `tierTbc`, which is the app's "an AD must resolve this" state, and is
// reported on the review screen rather than quietly costed as ordinary crowd.
export function applyColour(
  req: NamedCount,
  fills: string[],
  legend: ColourLegend | null,
  column: "crowd" | "spact" | "stunt" = "crowd",
): NamedCount {
  const families = fills
    .map(colourFamily)
    .filter((f): f is ColourName => !!f && f !== "black" && f !== "white");
  if (!families.length) return req;
  // Red is used throughout real breakdowns for "TBC" emphasis rather than as a
  // tier, and reading it as one would re-tier half a document. It only means
  // something if the key line explicitly says so.
  const meaningful = families.filter((f) => legend?.byColour.has(f) || f !== "red");
  const fam = meaningful[0];
  if (!fam) return req;
  const meaning = legend?.byColour.get(fam);
  if (!meaning) {
    return { ...req, tierTbc: true, note: joinNote(req.note, `printed in ${fam} — colour not explained by the document's key`) };
  }
  const out: NamedCount = { ...req };
  if (meaning.tier && column === "crowd") {
    out.tier = meaning.tier;
    out.budgetScope = meaning.tier === "Stunt" || meaning.tier === "Child" || meaning.tier === "AV" ? "reference" : "crowd";
    if (meaning.unitType) out.unitType = meaning.unitType;
  } else if (meaning.tier) {
    out.note = joinNote(out.note, `printed in ${fam} (${meaning.label}) in the ${column.toUpperCase()} column`);
  }
  if (meaning.flag) out.flags = [...(out.flags || []), meaning.flag];
  return out;
}

function joinNote(a: string | undefined, b: string): string {
  return a ? `${a} · ${b}` : b;
}

// ── Day banners ────────────────────────────────────────────────────────────

export interface DayBanner {
  date: string;
  num: number | null;
  loc: string;
  hours: string;
  unitKind: NonNullable<ShootDay["unitKind"]>;
  phase: "shoot" | "prep";
  /** TRUE for a row that is not a working day at all (rest day). */
  rest: boolean;
  /** The role text exactly as printed ("SHOOT DAY 38 (& TRAVEL BACK TO UK)"). */
  role: string;
}

// What kind of day record a banner's role text describes. Order matters: a row
// reading "2ND UNIT / SPLINTER UNIT / STUNT UNIT" is one splinter day, and the
// first match wins rather than the last.
const UNIT_KINDS: { re: RegExp; kind: NonNullable<ShootDay["unitKind"]> }[] = [
  { re: /\bREHEARSAL\b/i, kind: "rehearsal" },
  { re: /\bWEATHER\s*COVER\b/i, kind: "weatherCover" },
  { re: /\bRE-?SHOOTS?\b/i, kind: "reshoot" },
  { re: /\bSPLINTER\b/i, kind: "splinter" },
  { re: /\b(2ND|SECOND|STUNT)\s*UNIT\b/i, kind: "second" },
];
const REST_RE = /\bREST\s*DAY\b|\bDAY\s*OFF\b|\bBANK\s*HOLIDAY\b/i;
const PREP_RE = /\bTRAVEL\b|\bRECCE\b|\bPREP\b|\bFITTING\b|\bTEST(S|ING)?\b/i;

export function parseDayBanner(row: BdGridRow): DayBanner | null {
  const left = cellOf(row, "left");
  const dm = DATE_RE.exec(left);
  if (!dm) return null;
  const role = [cellOf(row, "slug"), cellOf(row, "scriptDay"), cellOf(row, "ie")].filter(Boolean).join(" ").trim();
  const tail = cellOf(row, "desc");
  // "AUDLEY END ESTATE (0800 - 1745)" — hours are the trailing bracket, the
  // location is what is left. A location that is itself bracketed ("(HOURS TBC)")
  // stays with the hours, which is where an AD put it.
  const hm = /\(([^()]*\d[^()]*|[^()]*TBC[^()]*)\)\s*$/i.exec(tail);
  const hours = hm ? hm[1].trim() : "";
  const loc = (hm ? tail.slice(0, hm.index) : tail).trim();
  const nm = /\b(?:SHOOT\s*)?DAY\s*#?\s*(\d+)/i.exec(role);
  const rest = REST_RE.test(role) && !nm;
  const kindHit = UNIT_KINDS.find((k) => k.re.test(role));
  return {
    date: left.trim(),
    num: nm ? num(nm[1]) : null,
    loc,
    hours,
    unitKind: kindHit ? kindHit.kind : "main",
    phase: !nm && PREP_RE.test(role) ? "prep" : "shoot",
    rest,
    role,
  };
}

// A totals row → the categories it states. The wording varies ("SUPPORTING
// ARTISTS", "SA", "x SPACTs (Special Action Extras)") so each is matched by its
// own keyword rather than by position.
export function parseTotals(row: BdGridRow): Partial<Record<ReqTier, number>> {
  const out: Partial<Record<ReqTier, number>> = {};
  const re = new RegExp(TOTAL_RE.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(row.text))) {
    const n = num(m[1]);
    const what = m[2].toUpperCase();
    let tier: ReqTier | null = null;
    if (/ARTIST|^SA$/.test(what)) tier = "SA";
    else if (/SPACT/.test(what)) tier = "SPACT";
    else if (/STUNT/.test(what)) tier = "Stunt";
    else if (/CHILD/.test(what)) tier = "Child";
    else if (/AV|ACTION/.test(what)) tier = "AV";
    if (tier && out[tier] === undefined) out[tier] = n;
  }
  return out;
}

// ── Scene rows ─────────────────────────────────────────────────────────────

// "Sc.87 pt3/7 INT", "Sc.14 REH EXT", "Sc.23, 24, 25 INT", "Sc.tbc EXT",
// "Sc.15 & Sc.16 I/E". The scene number, its part, and the interior/exterior
// marker all arrive in one cell because the table gives them no heading of their
// own to separate on.
const IE_RE = /\b(INT\s*\/\s*EXT|I\s*\/\s*E|INT|EXT)\b\.?/i;
const PART_RE = /\bpt\.?\s*(\d+)\s*\/\s*(\d+)/i;

export interface SceneHead {
  /** Every scene number printed on the row, in order. */
  nums: string[];
  part: string;
  ie: string;
  scriptDay: string;
  slug: string;
  desc: string;
  /** "REH" and similar markers printed against the scene number. */
  tags: string[];
}

export function parseSceneHead(row: BdGridRow): SceneHead | null {
  const head = [cellOf(row, "left"), cellOf(row, "ie")].filter(Boolean).join(" ").trim();
  if (!SCENE_RE.test(head)) return null;
  const iem = IE_RE.exec(head);
  const ie = iem ? iem[1].toUpperCase().replace(/\s+/g, "").replace("INT/EXT", "I/E") : "";
  // Everything before the I/E marker is the scene identifier block.
  const idBlock = (iem ? head.slice(0, iem.index) : head).trim();
  const pm = PART_RE.exec(idBlock);
  const part = pm ? `${pm[1]}/${pm[2]}` : "";
  const tags: string[] = [];
  if (/\bREH\b/i.test(idBlock)) tags.push("REHEARSAL");
  // Strip the vocabulary, and whatever numbers remain are the scene numbers.
  const bare = idBlock
    .replace(/\bpt\.?\s*\d+\s*\/\s*\d+/gi, " ")
    .replace(/\bREH\b/gi, " ")
    .replace(/\b(?:Sc\.?|Scenes?)\b/gi, " ");
  const nums = (bare.match(/\d+[A-Za-z]?|\bTBC\b/gi) || []).map((s) => s.toUpperCase());
  if (!nums.length) return null;
  return {
    nums,
    part,
    ie,
    scriptDay: cellOf(row, "scriptDay").trim(),
    slug: cellOf(row, "slug").trim(),
    desc: cellOf(row, "desc").trim(),
    tags,
  };
}

// ── The document ───────────────────────────────────────────────────────────

export interface BreakdownParseResult {
  model: ScheduleModel;
  /** Plain-English observations for the review screen. Never thrown away. */
  warnings: string[];
  /** Cells that did not parse, with where they were, for manual triage. */
  unparsed: { day: string; scene: string; text: string }[];
  /** What the colour key was understood to mean, for display. */
  legend: { colour: string; means: string }[];
  /**
   * Every day whose printed total disagrees with its own rows. NOT an error
   * list — a real breakdown contains arithmetic slips, and this is the review
   * screen's job to show rather than ours to silently resolve.
   */
  mismatches: { day: string; category: string; printed: number; derived: number }[];
  /** Days whose printed footer states the same figure twice, differently. */
  contradictions: { day: string; category: string; first: number; then: number }[];
  /** Which reader produced this — the table parser, or the AI. */
  readBy: "parser" | "ai";
  /**
   * Notation the reader could not interpret, for the review screen. Only the AI
   * read produces these — the parser has no way to ask a question, it either
   * reads a cell or keeps it verbatim in `unparsed`.
   */
  questions?: { term: string; source?: string; question?: string; days?: number[] }[];
}

// Requirement columns, and the tier each implies before colour is considered.
const REQ_COLS: { col: "crowd" | "spact" | "stunt"; tier: ReqTier }[] = [
  { col: "crowd", tier: "SA" },
  { col: "spact", tier: "SPACT" },
  { col: "stunt", tier: "Stunt" },
];

// COLUMN OVERFLOW. A requirement whose name is longer than its column runs on
// past the column boundary, so the tail of a CROWD entry is picked up as though
// it were a SPACT:
//   crowd: "Wedding Guests (breakfast)"        spact: "(25x from above)"
//   crowd: "London Law Firm Office Workers"    spact: "(10x from above)"
// Left alone that does two wrong things at once: it invents a SPACT booking the
// document does not contain, and it strips the "same people as above" marker off
// the crowd group that owns it — so those 25 are then counted as 25 NEW bodies.
// One overflowing group name silently adds people to a day and moves them onto a
// dearer tier.
//
// A fragment is recognised by what it cannot be: a real entry never begins with
// an opening bracket. So a bracketed fragment is joined back onto the entry to
// its left, ACROSS columns, keeping that entry's own column and colour.
//
// A fragment may also have a following entry crammed in behind it —
//   "(40x from above) Alexander's Gillet Friends (chapel)"
// — so only the leading bracket is given back, and whatever follows it stays put
// as an entry in its own right.
export function stitchOverflow(cells: BdCell[]): BdCell[] {
  const out: BdCell[] = [];
  for (const c of [...cells].sort((a, b) => a.x - b.x)) {
    const prev = out[out.length - 1];
    const lead = /^\s*(\([^()]*\))\s*([\s\S]*)$/.exec(c.text);
    // A "from above" bracket is NEVER an entry in its own right — it is a marker
    // on some group — so it always belongs to the entry on its left, even when
    // that entry already ends in a bracket of its own:
    //   crowd: "Wedding Guests (breakfast)"   spact: "(25x from above)"
    // A plain bracket is more ambiguous, so it only rejoins an entry that is
    // visibly unfinished.
    const isCarryMark = !!lead && /^\(\s*\d*\s*x?\s*(?:from|as)\s+(?:above|below)/i.test(lead[1]);
    if (prev && lead && (isCarryMark || !/\)\s*$/.test(prev.text))) {
      out[out.length - 1] = {
        ...prev,
        text: `${prev.text} ${lead[1]}`.replace(/\s+/g, " ").trim(),
        fills: [...prev.fills, ...c.fills.filter((f) => !prev.fills.includes(f))],
      };
      const rest = lead[2].trim();
      if (rest) out.push({ ...c, text: rest });
      continue;
    }
    out.push(c);
  }
  return out;
}

export const EMPTY_SCENE = (): Scene => ({
  num: "", part: "", ie: "", tod: "", scriptDay: "", pages: "", unit: "", desc: "",
  sa: 0, veh: 0, pod: false, cast: [], tags: [],
  extras: [], spacts: [], saChars: [], featured: [], vehNames: [],
});

/**
 * Read a whole crowd breakdown.
 *
 * `rows` is every grid row of every page, in page order — the pages of one
 * document are one continuous table, and a day's scenes routinely run across a
 * page break, so they must not be parsed page by page.
 *
 * `lines` is the same document as plain text, used only for the things printed
 * outside the table: the colour key, the schedule revision the breakdown was
 * built from, and the closing grand totals.
 */
export function parseBreakdown(rows: BdGridRow[], lines: string[]): BreakdownParseResult {
  const legend = readColourLegend(lines);
  const warnings: string[] = [];
  const unparsed: { day: string; scene: string; text: string }[] = [];
  // Days whose own footer states a figure twice, differently.
  const contradictions: { day: string; category: string; first: number; then: number }[] = [];
  const days: ShootDay[] = [];
  const notes: ScheduleNote[] = [];

  let day: ShootDay | null = null;
  let scene: Scene | null = null;
  let week = "";
  // Which scene each named group was last seen on, so a "(from above)" marker
  // can name its source instead of pointing at nothing.
  let lastSeen = new Map<string, string>();

  // A second-unit or splinter row carries no shoot-day number of its own — it is
  // a second record against a day the main unit already numbered ("Monday 21
  // September … 2ND UNIT / SPLINTER UNIT"). Numbering it 0 would put it before
  // day 1 in every ordering the app does, so it takes the number of the day it
  // SHARES A DATE WITH, which is what an AD means by it.
  //
  // A travel or recce day is the opposite case and must NOT inherit: it is a
  // different date and not a shoot day at all. Giving it the last shoot day's
  // number puts two different days under one number and makes the shoot look a
  // day longer than it is. It keeps number 0 and `phase: "prep"`, which is the
  // app's "imported, not costed" state.
  let lastNumbered = 0;
  let lastDate = "";
  const makeDay = (b: DayBanner, inherits: boolean): ShootDay => {
    return {
      num: b.num ?? (inherits ? lastNumbered : 0),
      date: b.date,
      sr: "", ss: "",
      loc: b.loc,
      hours: b.hours,
      type: "",
      cams: "",
      scenes: [],
      pages: "",
      unitKind: b.unitKind,
      phase: b.phase,
    };
  };

  for (const row of rows) {
    const kind = classifyRow(row);
    if (kind === "week") {
      week = row.text.trim();
      notes.push({ type: "week", text: week, afterDay: day ? day.num : null });
      continue;
    }
    if (kind === "day") {
      const b = parseDayBanner(row);
      if (!b) continue;
      if (b.rest) {
        // A rest day is not a shoot day and must not become one — but it is part
        // of the production's calendar, so it is kept as a note rather than
        // dropped. A model that silently loses rest days cannot be diffed
        // against the schedule it came from.
        notes.push({ type: "rest", text: `${b.date} — ${b.role}`.trim(), afterDay: day ? day.num : null });
        scene = null;
        continue;
      }
      if (b.num) { lastNumbered = b.num; lastDate = b.date; }
      const inherits = !b.num && b.phase === "shoot" && b.date === lastDate;
      day = makeDay(b, inherits);
      days.push(day);
      scene = null;
      lastSeen = new Map();
      continue;
    }
    if (!day) {
      // Anything before the first day banner is the document's own front matter.
      continue;
    }
    if (kind === "dayTotal") {
      // THE GRAND TOTAL IS NOT A DAY TOTAL. The closing "CROWD TOTALS (UK):
      // 1904 x SUPPORTING ARTISTS …" is printed in the same columns and the same
      // wording as a day's footer, so read naively it becomes the last shoot
      // day's requirement — nineteen hundred artistes on one day, on a document
      // that says nothing of the kind.
      if (GRAND_TOTAL_RE.test(row.text)) { scene = null; continue; }
      const totals = parseTotals(row);
      // FIRST STATEMENT WINS, and a later contradiction is reported rather than
      // silently applied. This is not defensive coding for its own sake: this
      // document footers day 24 twice, and the second copy reads "4 x STUNTS"
      // where the first reads "4 xSPACTs" — a typo in the middle column of a
      // repeated row. Taking the last value moves four SPACTs onto the stunt
      // line; taking the first and SAYING SO leaves the AD's own document as the
      // thing that needs a decision.
      const prev = day.declaredTotals;
      const merged: Partial<Record<ReqTier, number>> = { ...(prev || {}) };
      for (const [tier, n] of Object.entries(totals) as [ReqTier, number][]) {
        if (merged[tier] === undefined) merged[tier] = n;
        else if (merged[tier] !== n) {
          contradictions.push({ day: day.date, category: tier, first: merged[tier]!, then: n });
        }
      }
      if (Object.keys(merged).length) day.declaredTotals = merged;
      scene = null;
      continue;
    }
    if (kind === "scene") {
      const head = parseSceneHead(row);
      if (!head) continue;
      // A row printed against several scene numbers ("Sc.23, 24, 25") is one
      // set-up covering several scenes. Each becomes its own scene so it can be
      // matched against the shooting schedule, but only the FIRST carries the
      // requirement rows — the others point at it. They are the same bodies, and
      // a day's figure is a peak across its scenes, so nothing is lost and
      // nothing is counted twice.
      const made: Scene[] = head.nums.map((n, i) => ({
        ...EMPTY_SCENE(),
        num: n,
        part: head.part,
        ie: head.ie,
        scriptDay: head.scriptDay,
        slug: head.slug,
        desc: head.desc,
        tags: [...head.tags],
        ...(i > 0 ? { contFrom: head.nums[0], contFromRef: `covered with Sc.${head.nums[0]}` } : {}),
      }));
      for (const s of made) day.scenes.push(s);
      scene = made[0];
      addRequirements(row, scene, day, legend, lastSeen, unparsed);
      continue;
    }
    if (kind === "cont") {
      // A row with requirement cells and no scene number belongs to the scene
      // above it: a second group in the same column, or a wrapped description.
      if (!scene) continue;
      const more = cellOf(row, "desc");
      if (more && !/^\(/.test(more)) scene.desc = `${scene.desc} ${more}`.replace(/\s+/g, " ").trim();
      addRequirements(row, scene, day, legend, lastSeen, unparsed);
      continue;
    }
    if (kind === "banner") {
      const text = row.text.trim();
      if (!text) continue;
      // "WEATHER COVER  HERTFORDSHIRE COUNTRY CLUB" — a set change or a cover
      // block inside the day, which the day board shows as its own banner.
      day.locBlocks = [...(day.locBlocks || []), { loc: text, from: day.scenes.length }];
      scene = null;
      continue;
    }
    // Anything else printed inside a day is kept verbatim against it.
    const text = row.text.trim();
    if (text) day.unparsed = [...(day.unparsed || []), text];
  }

  return finishBreakdown({ days, notes, legend, lines, unparsed, contradictions, warnings, readBy: "parser" });
}

// ── Finishing a read, whichever read it was ────────────────────────────────

/**
 * CHECK A BREAKDOWN AND WRAP IT UP.
 *
 * Shared deliberately by BOTH readers — the deterministic table parser and the
 * AI read. Everything of consequence lives here: the reconciliation against the
 * document's own day totals, the wording the user is shown, and the flags that
 * say a row needs a decision.
 *
 * That sharing is the point, not tidiness. An AI read that skipped these checks
 * would be an unverified guess at somebody's crowd budget. Because it goes
 * through the same reconciliation, an AI read is held to the same standard the
 * parser is: the AD's own arithmetic either confirms it or it does not, and
 * either way the user is told which. It is the strongest check available on a
 * model's reading of a document, and it costs nothing to apply.
 */
export function finishBreakdown(o: {
  days: ShootDay[];
  notes: ScheduleNote[];
  legend: ColourLegend | null;
  /** The document as plain text, for the header and closing totals. */
  lines: string[];
  unparsed: { day: string; scene: string; text: string }[];
  contradictions: { day: string; category: string; first: number; then: number }[];
  warnings?: string[];
  readBy: "parser" | "ai";
}): BreakdownParseResult {
  const { days, notes, legend, lines, unparsed, contradictions, readBy } = o;
  const warnings = [...(o.warnings || [])];
  const declaredTotals = grandTotals(lines);
  const sourceScheduleDate = sourceSchedule(lines);

  // Before anything reads a scene on its own: give every "as scene 23" scene the
  // rows it is pointing at (carried, so no day books them twice).
  const carried = materialiseCarriedCrowd(days);

  const mismatches = reconcileDays(days);
  const checked = days.filter((d) => d.declaredTotals).length;
  // WHOSE ARITHMETIC. Said differently for the two readers, because it means
  // something different. For the parser, a clean reconciliation confirms the
  // table was read correctly. For an AI read it is the only external check there
  // is, so it is worth saying out loud that it passed — or that it did not.
  if (mismatches.length) {
    warnings.push(
      `${mismatches.length} of the day totals printed on this breakdown do not match what that day's own rows add up to (${checked} days had a printed total to check). Both figures are kept — yours and the document's — so you can see which is right. Nothing has been "corrected" for you.`,
    );
  } else if (checked) {
    warnings.push(
      readBy === "ai"
        ? `Checked against the document's own arithmetic: all ${checked} of the day totals printed on this breakdown match what the AI read off that day's rows.`
        : `Every one of the ${checked} day totals printed on this breakdown matches what its own rows add up to.`,
    );
  } else if (readBy === "ai") {
    warnings.push(
      "This breakdown prints no day totals, so there is nothing to check the AI's reading against. Go through the days below against the document before you publish.",
    );
  }
  if (contradictions.length) {
    warnings.push(
      `${contradictions.length === 1 ? "One day on this breakdown states" : `${contradictions.length} days on this breakdown state`} a total twice with two different figures — ${contradictions
        .slice(0, 3)
        .map((c) => `${c.day} (${c.first} then ${c.then})`)
        .join("; ")}${contradictions.length > 3 ? "; …" : ""}. The first figure printed has been kept. Worth checking which the AD meant.`,
    );
  }
  const tbc = days.reduce(
    (a, d) => a + d.scenes.reduce((b, s) => b + allReqs(s).filter((r) => r.tierTbc).length, 0),
    0,
  );
  if (tbc) {
    warnings.push(
      `${tbc} rows are colour-coded in a colour this document's key does not explain. They have been imported as "needs checking" rather than guessed at.`,
    );
  }
  if (!legend) {
    warnings.push(
      "No colour key was found in this document. Any colour-coded rows — children, doubles, action vehicles — have been imported as ordinary crowd and need checking.",
    );
  }
  if (carried) {
    warnings.push(
      `${carried === 1 ? "One scene reads" : `${carried} scenes read`} "as above" instead of listing crowd of its own. Each now shows the crowd of the scene it points at, marked "from above" — the same people, so no day books them twice.`,
    );
  }
  if (unparsed.length) {
    warnings.push(
      `${unparsed.length} entries could not be read as a number and a group name. They have been kept exactly as written against their scene so nothing is lost.`,
    );
  }

  const model: ScheduleModel = {
    days,
    castMap: {},
    notes,
    source: "breakdown_import",
    ...(sourceScheduleDate ? { sourceScheduleDate } : {}),
    ...(Object.keys(declaredTotals).length ? { declaredTotals } : {}),
    ...(legend
      ? {
          colourKey: Object.fromEntries(
            [...legend.byColour.entries()]
              .filter(([, m]) => !!m.tier)
              .map(([c, m]) => [c, m.tier as ReqTier]),
          ),
        }
      : {}),
  };
  if (days.some((d) => d.unitKind && d.unitKind !== "main")) model.multiUnit = true;

  return {
    model,
    warnings,
    unparsed,
    mismatches,
    contradictions,
    readBy,
    legend: legend ? [...legend.byColour.entries()].map(([c, m]) => ({ colour: c, means: m.label })) : [],
  };
}

// Every day's stated total against what its rows actually add up to.
//
// A difference is REPORTED, never corrected. The document is the record of what
// an AD decided, and quietly "fixing" its arithmetic would hide the fact that a
// day's booking and its scene list disagree — which is one of the more useful
// things importing a breakdown can tell a production about its own paperwork.
export function reconcileDays(days: ShootDay[]): BreakdownParseResult["mismatches"] {
  const out: BreakdownParseResult["mismatches"] = [];
  for (const d of days) {
    if (!d.declaredTotals) continue;
    for (const col of ["SA", "SPACT", "Stunt"] as const) {
      const stated = d.declaredTotals[col];
      if (stated === undefined) continue;
      const derived = dayHeads(d, COLUMN_TIERS[col]);
      if (stated !== derived) {
        out.push({
          day: d.date,
          category: col === "SA" ? "crowd" : col === "SPACT" ? "SPACTs" : "stunts",
          printed: stated,
          derived,
        });
      }
    }
  }
  return out;
}

// Put a row's requirement cells onto a scene.
function addRequirements(
  row: BdGridRow,
  scene: Scene,
  day: ShootDay,
  legend: ColourLegend | null,
  lastSeen: Map<string, string>,
  unparsed: { day: string; scene: string; text: string }[],
) {
  // Overflow is stitched across ALL the requirement columns at once, because
  // that is where it happens — a crowd entry runs on into the SPACT column, not
  // into another crowd cell.
  const stitched = stitchOverflow(REQ_COLS.flatMap(({ col }) => cellsOf(row, col)));
  for (const { col, tier } of REQ_COLS) {
    for (const cell of stitched.filter((c) => c.col === col)) {
      // A cell of punctuation is a stray mark, not a requirement.
      if (!/[A-Za-z0-9]/.test(cell.text)) continue;
      const p = parseReqCell(cell.text, tier);
      if (p.kind === "na") {
        // An explicit "N/A" is the AD stating there is no crowd — a closed
        // item, which is not the same as a cell nobody has filled in yet.
        if (/n\s*\/\s*a|none|nil/i.test(cell.text) && !scene.reqStatus) scene.reqStatus = "none";
        continue;
      }
      if (p.kind === "asAbove") {
        // The whole cell is a pointer: this scene's list is the previous
        // scene's. Recorded on the scene, not as a group, because there is no
        // group here to record it on.
        scene.contFromRef = p.raw.trim();
        continue;
      }
      const req = applyColour(p.req!, cell.fills, legend, col);
      if (!req.count && !(req.flags || []).includes("asAbove")) {
        // No number, and not marked as carried from above: this is a wrapped
        // name or a column heading that leaked in, not a booking. Kept verbatim
        // rather than imported as a group of zero.
        scene.unparsed = [...(scene.unparsed || []), cell.text];
        unparsed.push({ day: day.date, scene: scene.num, text: cell.text });
        continue;
      }
      if ((req.flags || []).includes("asAbove")) {
        const from = lastSeen.get(key(req.name));
        if (from) req.cont = from;
      } else {
        lastSeen.set(key(req.name), scene.num);
      }
      bucket(scene, req);
    }
  }
}

// Where a row lives on the scene. The array is the tier's home, and matches
// exactly what breakdown-doc reads back out when it re-projects the document.
export function bucket(scene: Scene, req: NamedCount) {
  const tier = req.tier || "SA";
  if (tier === "SPACT") (scene.spacts ||= []).push(req);
  else if (tier === "Featured") (scene.featured ||= []).push(req);
  else if (tier === "Stunt") (scene.extras ||= []).push(req);
  else if (tier === "Child") (scene.children ||= []).push(req);
  else if (tier === "AV") (scene.avs ||= []).push(req);
  else (scene.saChars ||= []).push(req);
}

// WHAT "AS SCENE 23 (FROM ABOVE)" HAS TO MEAN EVERYWHERE ELSE.
//
// A breakdown writes a covering scene's crowd ONCE and points the rest of the
// set-up at it — "Sc.23, 24, 25" with the rows against 23, or a bare cell
// reading "As above". On the printed page that is complete: the reader's eye is
// two lines above the pointer. Anywhere the scene is read on its own it is not:
// the day board showed Sc.24 and Sc.25 with an empty crowd cell and a figure of
// zero, on scenes that plainly have sixty wedding guests standing in them.
//
// So the pointer is RESOLVED here, once, at the end of the read: every row on
// the scene it points at is copied onto it and marked `asAbove`. That flag is
// the whole safety of this — a day's requirement is a peak across its scenes and
// dayHeads() skips carried rows, so nothing is booked or costed twice; the
// scene simply now says who is in it. `crowdInherited` records that the rows are
// borrowed, so the printed breakdown keeps the AD's shorthand.
//
// WITHIN ONE DAY ONLY, deliberately. A weather cover carried across four days
// materialised into each of them would be four days of crowd for one day's work
// that may never happen (see crowd-merge.ts on weather cover), and the copied
// rows would sit outside the document's own arithmetic. A pointer whose target
// is not on the day is left exactly as it was.
const CARRIED_TIERS = ["saChars", "featured", "spacts"] as const;

function statesOwnCrowd(s: Scene): boolean {
  return (s.sa || 0) > 0 || CARRIED_TIERS.some((f) => (s[f] || []).length > 0);
}

// "covered with Sc.23", "as scene 23", "as sc.23 above" → "23". A bare "(32)"
// as in "As above (32)" is a HEAD COUNT, not a scene, and must not match.
const CARRY_SCENE_RX = /\bs(?:c|cene)\b\.?\s*([0-9]+[a-z]?(?:\s*pt\s*[\d/]*[a-z]?)?)/i;

function carrySourceNum(sc: Scene): string {
  const explicit = (sc.contFrom || "").trim();
  if (explicit) return explicit;
  const m = CARRY_SCENE_RX.exec(sc.contFromRef || "");
  return m ? m[1].replace(/\s+/g, "") : "";
}

const numKey = (n: string) => (n || "").toLowerCase().replace(/\s+/g, "").replace(/^0+(?=\d)/, "");

/** Resolve every whole-scene "from above" pointer into the rows it points at.
 *  Returns how many scenes were filled in. */
export function materialiseCarriedCrowd(days: ShootDay[]): number {
  let filled = 0;
  for (const d of days) {
    for (let i = 0; i < d.scenes.length; i++) {
      const sc = d.scenes[i];
      if (statesOwnCrowd(sc)) continue;
      if (!sc.contFrom && !sc.contFromRef) continue;
      const want = numKey(carrySourceNum(sc));
      // A numbered pointer must find THAT scene. An unnumbered "as above" means
      // the scene above it, so walk back to the nearest one that states crowd.
      const src = want
        ? d.scenes.find((s, j) => j !== i && numKey(s.num) === want && statesOwnCrowd(s))
        : d.scenes.slice(0, i).reverse().find(statesOwnCrowd);
      if (!src) continue;
      for (const f of CARRIED_TIERS) {
        const rows = (src[f] || []).filter((r) => (r.count || 0) > 0);
        if (!rows.length) continue;
        sc[f] = rows.map((r) => ({
          ...r,
          flags: [...new Set([...(r.flags || []), "asAbove" as const])],
          cont: r.cont || src.num,
        }));
      }
      if ((src.sa || 0) > 0) {
        sc.sa = src.sa;
        sc.saAbove = true;
      }
      if (statesOwnCrowd(sc)) {
        sc.crowdInherited = true;
        filled++;
      }
    }
  }
  return filled;
}

export function allReqs(s: Scene): NamedCount[] {
  return [
    ...(s.saChars || []), ...(s.featured || []), ...(s.spacts || []),
    ...(s.extras || []), ...(s.children || []), ...(s.avs || []),
  ];
}

function key(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

// HOW MANY PEOPLE A DAY ACTUALLY NEEDS.
//
// The obvious rule — pool rows that share a name and take the largest, because
// "the same 126 wedding guests in four scenes are 126 people" — is the right rule
// for a document that does not say. THIS document says. A crowd breakdown marks
// carried-over people explicitly, every time:
//
//   "As above (32)"                     the whole scene is the previous scene's people
//   "Wedding Hotel Staff (5x from above)"   this group is the previous group's people
//
// Which means the converse is a statement too: a group written out WITHOUT a
// carry marker is a fresh booking, even where an earlier scene that day has a
// group of the same name. Day 9 of this breakdown says "10 Wedding Guests
// (chapel)" on one scene and "20 Wedding Guests (chapel)" on the next, and totals
// the day at 30. Pooling by name would call that 20 and quietly drop ten people —
// on a document whose own arithmetic disagrees, in the direction that under-books
// the day.
//
// So: SUM the rows the document wrote out, and count the marked ones as nobody
// new. That reproduces the AD's own totals, which is the only external check
// available on whether we have read their document correctly.
export function dayHeads(d: ShootDay, tiers: ReqTier[]): number {
  let total = 0;
  for (const s of d.scenes) {
    for (const r of allReqs(s)) {
      if (!tiers.includes(r.tier || "SA")) continue;
      // Carried from an earlier scene — the same bodies, already counted.
      if ((r.flags || []).includes("asAbove")) continue;
      total += r.count || 0;
    }
  }
  return total;
}

// The tiers that live in each printed COLUMN, for reconciling against the
// document's own day totals.
//
// The tiers are ours; the columns are the document's, and they do not line up
// one-to-one. Reconciliation has to compare like with like, which means comparing
// against the COLUMN — everything the AD wrote in it, whatever we then filed it
// as. This production colour-codes children and action vehicles inside the crowd
// column and counts both within "x SUPPORTING ARTISTS"; excluding them would
// report a false discrepancy on every day a child or a picture vehicle works, and
// a reconciliation report that cries wolf is one nobody reads.
//
// This is ONLY for the comparison. What each row costs still follows its own
// tier and budgetScope — children and action vehicles remain outside the crowd
// budget, exactly as this document's own footer insists stunts are.
export const COLUMN_TIERS: Record<"SA" | "SPACT" | "Stunt", ReqTier[]> = {
  SA: ["SA", "Featured", "Child", "AV"],
  SPACT: ["SPACT"],
  Stunt: ["Stunt"],
};

// "CROWD TOTALS (UK): 1904 x SUPPORTING ARTISTS 74 x SPACTs ... 6 x STUNTS"
function grandTotals(lines: string[]): Partial<Record<ReqTier, number>> {
  const line = lines.find((l) => /(CROWD\s+)?TOTALS?\b/i.test(l) && TOTAL_RE.test(l));
  if (!line) return {};
  return parseTotals({ y: 0, cells: [], text: line });
}

// "*AS PER 'DRAFT' (UNISSUED) SHOOTING SCHEDULE DATED 12.08.26*" — which
// revision of the schedule this breakdown was built against. Kept so a
// breakdown and a schedule import can be diffed against each other rather than
// silently assumed to describe the same shoot.
function sourceSchedule(lines: string[]): string {
  for (const l of lines) {
    const m = /SCHEDULE\s+DATED[;:\s]*([0-9]{1,2}[./-][0-9]{1,2}[./-][0-9]{2,4})/i.exec(l);
    if (m) return m[1];
  }
  return "";
}
