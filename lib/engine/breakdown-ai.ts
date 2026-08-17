// Reading a crowd breakdown with AI.
//
// WHY THIS EXISTS ALONGSIDE THE PARSER
//
// breakdown-parse reads a breakdown by parsing its table, which is exact, free
// and instant — on the layout it knows. But "the layout it knows" is the catch: a
// breakdown is a document an AD built in Excel, and the next production's will
// put its columns somewhere else, footer its days differently, or use words the
// parser has never seen. The parser either recognises a document or it does not,
// and when it does not there is nothing to fall back on.
//
// That is what the AI read is for. It handles the layouts nobody has taught the
// app yet.
//
// WHAT THE MODEL IS GIVEN — AND WHY IT IS NOT THE PAGE TEXT
//
// The obvious approach, handing the model the PDF's text the way the schedule
// reader does, quietly throws away the two facts a breakdown states
// geometrically:
//
//   · the COLUMN a requirement sits in is what makes it crowd, a SPACT or a
//     stunt. Flattened, "2 Padel Staff   1 Experienced Female Padel Player" is
//     one line with no boundary in it.
//   · the COLOUR it is printed in is what makes it a child, a double or an
//     action vehicle — and children and action vehicles are outside the crowd
//     budget while ordinary crowd is not.
//
// A model given the flattened text has to GUESS both, and it will guess wrong in
// ways nobody can see afterwards, on numbers that become somebody's budget. So it
// is given the grid instead, rendered as tagged lines where the column is a label
// and the colour is stated in brackets. The model's job becomes reading and
// tidying, not divination — and it is told, in as many words, never to re-decide
// a tier the tag has already given it.
//
// Where the grid CANNOT be read (an unrecognised layout, which is exactly when
// the AI read is wanted), it falls back to the plain page text and says so, so
// the model knows the tiers are genuinely uncertain and marks them for checking
// rather than inventing confidence.

import type { NamedCount, ReqTier, Scene, ScheduleNote, ShootDay } from "./types";
import { cellOf, cellsOf, type BdGridRow } from "./breakdown-grid";
import {
  EMPTY_SCENE,
  bucket,
  classifyRow,
  colourFamily,
  finishBreakdown,
  parseDayBanner,
  parseSceneHead,
  stitchOverflow,
  type BreakdownParseResult,
  type ColourLegend,
} from "./breakdown-parse";

// ── Rendering the grid for the model ───────────────────────────────────────

const REQ_TAGS: { col: "crowd" | "spact" | "stunt"; tag: string }[] = [
  { col: "crowd", tag: "CROWD" },
  { col: "spact", tag: "SPACT" },
  { col: "stunt", tag: "STUNT" },
];

/**
 * The grid, as tagged lines for the model to read.
 *
 * Every line begins with what it IS, so nothing has to be inferred from
 * position or spacing:
 *
 *   WEEK: SHOOT WEEK 1
 *   DAY: Monday 7 September 2026 | SHOOT DAY 1 | AUDLEY END ESTATE (0800 - 1830)
 *   SCENE: Sc.43 | INT | D4 | HOSPITAL ROOM | Terry gives Jay some advice
 *   CROWD: 2 Hospital Nurses
 *   CROWD[orange]: 2 Young Cousins (age 9)
 *   SPACT: 3 Bride's Friends (chapel)
 *   DAYTOTAL: 10 x SUPPORTING ARTISTS | 1 xSPACTs | 0 x STUNTS
 *
 * A colour is named in brackets only when it is a colour statement — black text
 * and the white text of a reversed-out banner are not, and annotating them would
 * bury the handful of rows where the colour is the whole point.
 *
 * Column overflow is stitched back BEFORE rendering (see stitchOverflow), so the
 * model never sees a crowd group's "(25x from above)" tail labelled SPACT. Giving
 * a model a mislabelled line and hoping it notices is not a plan.
 */
export function tagGrid(rows: BdGridRow[], legend: ColourLegend | null): string[] {
  const out: string[] = [];
  if (legend) {
    const key = [...legend.byColour.entries()].map(([c, m]) => `${c} = ${m.label}`).join(", ");
    out.push(`COLOURKEY: ${key}`);
  }
  for (const row of rows) {
    const kind = classifyRow(row);
    if (kind === "week") { out.push(`WEEK: ${row.text}`); continue; }
    if (kind === "day") {
      const b = parseDayBanner(row);
      out.push(`DAY: ${[b ? b.date : cellOf(row, "left"), b ? b.role : "", cellOf(row, "desc")].filter(Boolean).join(" | ")}`);
      continue;
    }
    if (kind === "dayTotal") { out.push(`DAYTOTAL: ${row.text}`); continue; }
    if (kind === "scene") {
      // The scene's own fields, separated properly. They cannot be taken from the
      // columns directly: a breakdown gives the scene number no heading of its
      // own, so "Sc.43" and its INT/EXT marker land in ONE cell and arrive as
      // "Sc.43 INT". Handing the model that as a single field invites it to read
      // the marker as part of the number, so it is split here — by the same
      // function the parser uses, which also recovers the part ("pt3/7") and every
      // number on a row that covers several scenes.
      const h = parseSceneHead(row);
      const head = h
        ? [`Sc.${h.nums.join(", ")}`, h.part ? `pt${h.part}` : "", h.ie, h.scriptDay, h.slug, h.desc, ...h.tags]
            .filter(Boolean).join(" | ")
        : [cellOf(row, "left"), cellOf(row, "ie"), cellOf(row, "scriptDay"), cellOf(row, "slug"), cellOf(row, "desc")]
            .filter(Boolean).join(" | ");
      out.push(`SCENE: ${head}`);
      out.push(...reqLines(row, legend));
      continue;
    }
    if (kind === "cont") {
      const more = cellOf(row, "desc");
      if (more) out.push(`MORE: ${more}`);
      out.push(...reqLines(row, legend));
      continue;
    }
    if (kind === "banner") { out.push(`BANNER: ${row.text}`); continue; }
    if (row.text.trim()) out.push(`NOTE: ${row.text}`);
  }
  return out;
}

function reqLines(row: BdGridRow, legend: ColourLegend | null): string[] {
  const stitched = stitchOverflow(REQ_TAGS.flatMap(({ col }) => cellsOf(row, col)));
  const out: string[] = [];
  for (const { col, tag } of REQ_TAGS) {
    for (const cell of stitched.filter((c) => c.col === col)) {
      if (!/[A-Za-z0-9]/.test(cell.text)) continue;
      const fam = cell.fills
        .map(colourFamily)
        .find((f) => !!f && f !== "black" && f !== "white");
      // An unexplained colour is still named — the model is told to flag it, and
      // it cannot flag what it was not shown.
      out.push(`${tag}${fam ? `[${fam}${legend?.byColour.has(fam) ? "" : " — not in the key"}]` : ""}: ${cell.text}`);
    }
  }
  return out;
}

// ── Splitting a long breakdown ─────────────────────────────────────────────

/**
 * Split tagged lines into pieces, cutting only between shoot days.
 *
 * A day is the unit that has to stay whole. Its scenes, its carried-over groups
 * and its own printed total have to be read together or the reconciliation is
 * meaningless — a day cut in half looks like a day whose rows do not add up to
 * its footer, which is precisely the signal that is supposed to mean something.
 *
 * A single day longer than the target is NOT cut. A cut would produce two
 * half-days that each fail their own arithmetic; one over-long piece merely costs
 * a little more to read.
 */
export function chunkTagged(lines: string[], targetLines = 260): string[] {
  const preamble = lines.filter((l) => l.startsWith("COLOURKEY:"));
  const body = lines.filter((l) => !l.startsWith("COLOURKEY:"));
  const starts: number[] = [];
  for (let i = 0; i < body.length; i++) if (body[i].startsWith("DAY:") || body[i].startsWith("WEEK:")) starts.push(i);
  if (!starts.length) return [lines.join("\n")];
  const pieces: string[] = [];
  let from = 0;
  for (let i = 0; i < starts.length; i++) {
    const next = starts[i];
    if (next - from >= targetLines) {
      pieces.push([...preamble, ...body.slice(from, next)].join("\n"));
      from = next;
    }
  }
  pieces.push([...preamble, ...body.slice(from)].join("\n"));
  return pieces.filter((p) => p.replace(/\s/g, "").length > 0);
}

// ── The model's answer → a ScheduleModel ───────────────────────────────────

// One requirement row as the model returns it.
export interface AiReq {
  name?: string;
  count?: number;
  tier?: string;
  fromAbove?: boolean;
  colour?: string;
  colourUnexplained?: boolean;
  note?: string;
}

export interface AiScene {
  num?: string;
  part?: string;
  ie?: string;
  scriptDay?: string;
  slug?: string;
  desc?: string;
  contFromRef?: string;
  reqs?: AiReq[];
  unreadable?: string[];
}

export interface AiDay {
  num?: number;
  date?: string;
  role?: string;
  loc?: string;
  hours?: string;
  rest?: boolean;
  phase?: string;
  unitKind?: string;
  scenes?: AiScene[];
  totals?: { category?: string; count?: number }[];
}

const TIERS: ReqTier[] = ["SA", "Featured", "SPACT", "Stunt", "Child", "AV"];
const UNIT_KINDS = ["main", "second", "splinter", "rehearsal", "weatherCover", "reshoot"] as const;

/**
 * Build the app's model from what the AI returned.
 *
 * Deliberately UNTRUSTING of the model's output, in a specific way: every field
 * is validated against the app's own vocabulary and anything outside it is
 * dropped rather than coerced. A tier the schema does not contain, a negative
 * count, a category nobody recognises — each is a thing the model made up, and
 * the honest response is to leave it out and let the reconciliation notice the
 * shortfall, not to guess what was meant.
 *
 * It then goes through exactly the same finishBreakdown as the parser, so an AI
 * read is checked against the document's own day totals in the same way. On a
 * document that prints its totals, that turns "the model says so" into something
 * with an external check under it.
 */
export function breakdownFromAi(
  days: AiDay[],
  o: { lines: string[]; legend: ColourLegend | null; taggedFallback?: boolean },
): BreakdownParseResult {
  const out: ShootDay[] = [];
  const notes: ScheduleNote[] = [];
  const unparsed: { day: string; scene: string; text: string }[] = [];
  const warnings: string[] = [];
  let lastNumbered = 0;
  let lastDate = "";
  let dropped = 0;

  for (const d of days || []) {
    const date = String(d?.date || "").trim();
    if (!date) continue;
    if (d?.rest) {
      notes.push({ type: "rest", text: `${date} — ${String(d.role || "REST DAY").trim()}`, afterDay: lastNumbered || null });
      continue;
    }
    const num = Math.round(Number(d?.num) || 0);
    const phase = d?.phase === "prep" ? "prep" : "shoot";
    if (num > 0) { lastNumbered = num; lastDate = date; }
    const inherits = !num && phase === "shoot" && date === lastDate;
    const unitKind = (UNIT_KINDS as readonly string[]).includes(String(d?.unitKind))
      ? (d!.unitKind as ShootDay["unitKind"])
      : "main";
    const day: ShootDay = {
      num: num || (inherits ? lastNumbered : 0),
      date,
      sr: "", ss: "",
      loc: String(d?.loc || "").trim(),
      hours: String(d?.hours || "").trim(),
      type: "",
      cams: "",
      scenes: [],
      pages: "",
      unitKind,
      phase,
    };
    // The day's own printed footer. Kept beside the derived sums, never instead
    // of them — that comparison is the whole check.
    const totals: Partial<Record<ReqTier, number>> = {};
    for (const t of d?.totals || []) {
      const n = Math.round(Number(t?.count));
      if (!Number.isFinite(n) || n < 0) continue;
      const cat = String(t?.category || "").toLowerCase();
      const tier: ReqTier | null = /crowd|^sa$|supporting/.test(cat)
        ? "SA"
        : /spact/.test(cat)
          ? "SPACT"
          : /stunt/.test(cat)
            ? "Stunt"
            : null;
      if (tier && totals[tier] === undefined) totals[tier] = n;
    }
    if (Object.keys(totals).length) day.declaredTotals = totals;

    for (const s of d?.scenes || []) {
      const scene: Scene = {
        ...EMPTY_SCENE(),
        num: String(s?.num || "").trim(),
        part: String(s?.part || "").trim(),
        ie: String(s?.ie || "").trim().toUpperCase().replace(/\s+/g, ""),
        scriptDay: String(s?.scriptDay || "").trim(),
        slug: String(s?.slug || "").trim(),
        desc: String(s?.desc || "").trim(),
      };
      const ptr = String(s?.contFromRef || "").trim();
      if (ptr) scene.contFromRef = ptr;
      for (const t of s?.unreadable || []) {
        const text = String(t || "").trim();
        if (!text) continue;
        scene.unparsed = [...(scene.unparsed || []), text];
        unparsed.push({ day: date, scene: scene.num, text });
      }
      for (const r of s?.reqs || []) {
        const name = String(r?.name || "").trim();
        const count = Math.round(Number(r?.count));
        const tier = TIERS.includes(r?.tier as ReqTier) ? (r!.tier as ReqTier) : null;
        // A row with no name, no usable count, or a tier that is not one of ours
        // is something the model produced that the document does not support.
        if (!name || !tier || !Number.isFinite(count) || count < 0) { dropped++; continue; }
        const fromAbove = !!r?.fromAbove;
        // A group of nobody, not marked as carried over, is not a booking. It is
        // kept verbatim so it can be looked at, exactly as the parser does.
        if (!count && !fromAbove) {
          scene.unparsed = [...(scene.unparsed || []), name];
          unparsed.push({ day: date, scene: scene.num, text: name });
          continue;
        }
        const req: NamedCount = {
          name,
          count,
          tier,
          budgetScope: tier === "SA" || tier === "Featured" || tier === "SPACT" ? "crowd" : "reference",
          source: "breakdown_import",
          ...(fromAbove ? { flags: ["asAbove"] as const } : {}),
          ...(r?.note ? { note: String(r.note).trim() } : {}),
          ...(tier === "AV" ? { unitType: "vehicle" as const } : {}),
          // A colour the document's key does not explain is a decision for an AD,
          // not for a model. It imports on the column's tier, flagged.
          ...(r?.colourUnexplained ? { tierTbc: true } : {}),
        };
        bucket(scene, req);
      }
      day.scenes.push(scene);
    }
    out.push(day);
  }

  if (dropped) {
    warnings.push(
      `${dropped} ${dropped === 1 ? "row" : "rows"} came back from the AI in a shape we do not accept and were left out rather than guessed at. If a day below looks light against the document, that is where to look.`,
    );
  }
  if (o.taggedFallback) {
    warnings.push(
      "This breakdown's columns could not be identified, so the AI was given the page text rather than the table. That means whether a group is crowd, a SPACT or a stunt was read from the wording alone — check the tiers on the days below before you publish.",
    );
  }
  return finishBreakdown({
    days: out,
    notes,
    legend: o.legend,
    lines: o.lines,
    unparsed,
    contradictions: [],
    warnings,
    readBy: "ai",
  });
}

// ── Comparing the two readers ──────────────────────────────────────────────

export interface BreakdownAgreement {
  days: { both: number; parserOnly: number; aiOnly: number };
  /** Days where the two readers disagree about a category's headcount. */
  differences: { day: string; category: string; parser: number; ai: number }[];
  /** How many day figures the two agree on exactly. */
  agreed: number;
}

/**
 * Where the parser and the AI disagree.
 *
 * Worth having because the two readers are genuinely independent — one reads the
 * table's geometry, the other reads tagged lines — so agreement between them is
 * real evidence and a disagreement is a place to look. Neither is treated as
 * the answer: this reports, and a person decides.
 */
export function compareBreakdowns(
  parser: BreakdownParseResult,
  ai: BreakdownParseResult,
  dayHeadsOf: (d: ShootDay, tiers: ReqTier[]) => number,
  columnTiers: Record<"SA" | "SPACT" | "Stunt", ReqTier[]>,
): BreakdownAgreement {
  const keyOf = (d: ShootDay) => `${d.num}|${d.date.toLowerCase().replace(/\s+/g, "")}|${d.unitKind || "main"}`;
  const pByKey = new Map(parser.model.days.map((d) => [keyOf(d), d]));
  const aByKey = new Map(ai.model.days.map((d) => [keyOf(d), d]));
  const differences: BreakdownAgreement["differences"] = [];
  let both = 0, agreed = 0;
  for (const [k, pd] of pByKey) {
    const ad = aByKey.get(k);
    if (!ad) continue;
    both++;
    for (const col of ["SA", "SPACT", "Stunt"] as const) {
      const a = dayHeadsOf(pd, columnTiers[col]);
      const b = dayHeadsOf(ad, columnTiers[col]);
      if (a === b) agreed++;
      else {
        differences.push({
          day: pd.date,
          category: col === "SA" ? "crowd" : col === "SPACT" ? "SPACTs" : "stunts",
          parser: a,
          ai: b,
        });
      }
    }
  }
  return {
    days: { both, parserOnly: pByKey.size - both, aiOnly: aByKey.size - both },
    differences,
    agreed,
  };
}
