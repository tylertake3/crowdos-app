// Reading an ALREADY-MADE crowd breakdown back out of its PDF.
//
// WHY THIS IS NOT THE SCHEDULE READER
//
// A shooting schedule is prose: dates and scene blocks running down the page,
// and flattening it to lines loses nothing. A crowd breakdown is a TABLE, and
// two of its facts live in the geometry rather than in the words:
//
//   1. WHICH COLUMN a requirement sits in is what makes it crowd, a SPACT or a
//      stunt. Flatten the page to lines and
//        "2 Padel Staff        1 Experienced Female Padel Player"
//      becomes one string with no boundary in it — two SA and one SPACT read as
//      three of something. The tier is in the x position, and nowhere else.
//
//   2. WHAT COLOUR a row is printed in is what makes it a child, a double or an
//      action vehicle. The document says so itself, in its own key line:
//        "COLOUR KEY: BLUE - DOUBLES, ORANGE - CHILDREN, GREEN - ACTION
//         VEHICLES, FEATURED - PINK"
//      "2 Young Cousins (age 9)" printed in orange is two children, which are
//      outside the crowd budget. In black it is two ordinary SA, which are not.
//      Read the text alone and the two are indistinguishable.
//
// So this module keeps x, y and fill colour, recovers the table's columns from
// its own header row, and hands back a grid of typed rows. Nothing here decides
// what anything MEANS — that is breakdown-parse.ts. This file only answers
// "what cell is this, which column is it in, and what colour is it".
//
// Everything is pure: positioned, coloured text items in, rows out. The pdf.js
// calls that produce those items live in the browser (see pdfToCells).

// ── Input ──────────────────────────────────────────────────────────────────

// One run of text on the page, with where it sits and how it is painted.
export interface BdItem {
  str: string;
  x: number;
  y: number;
  /** Width in the same units as x, so a cell's extent is known. */
  w?: number;
  /**
   * Every fill colour painted inside this run, lower-case "#rrggbb", in reading
   * order. Usually one; more than one when pdf.js merged runs of different
   * colours into a single item ("LOCATION TBC" in red + its hours in black).
   * Which of them MEANS something is the colour key's business, not this file's.
   */
  fills?: string[];
}

// ── Columns ────────────────────────────────────────────────────────────────

// The breakdown's columns, left to right. `left` is the leftmost block, which
// carries three different things at three different indents (the week band, the
// day's date, and the scene number) — they are told apart by their TEXT in
// breakdown-parse, not by their x, because the indent is a house style and
// varies between productions while the words do not.
export type BdCol = "left" | "ie" | "scriptDay" | "slug" | "desc" | "crowd" | "spact" | "stunt";

// How each column is recognised in the header row. First pattern to match wins,
// and a column with no match is simply absent from the layout — a breakdown with
// no SPACT column is a legitimate document, not a parse failure.
const HEADER_PATTERNS: { col: BdCol; re: RegExp }[] = [
  { col: "crowd", re: /^CROWD\b/i },
  { col: "spact", re: /^SPACTs?\b/i },
  { col: "stunt", re: /^STUNTS?\b/i },
  { col: "desc", re: /LOCATION.*SCENE DESCRIPTION|SCENE DESCRIPTION/i },
  { col: "slug", re: /^SHOOT DAY\b/i },
  { col: "scriptDay", re: /^D$/ },
  { col: "ie", re: /^I\s*\/\s*E$/i },
];

export interface BdLayout {
  /** Column starts, ascending by x. The first entry is always `left` at x 0. */
  cols: { col: BdCol; x: number }[];
  /** y of the header row the layout was read from. */
  headerY: number;
}

// Find the table's own header row and read the column positions off it.
//
// The anchor is the CROWD column, because it is the one column a crowd
// breakdown cannot be without. Everything on the same line as it is a heading.
export function readLayout(items: BdItem[]): BdLayout | null {
  const anchor = items.find((it) => /^CROWD\s+CHARACTER/i.test(it.str.trim()));
  if (!anchor) return null;
  const headerY = anchor.y;
  const heads = items.filter((it) => Math.abs(it.y - headerY) < 4 && it.str.trim());
  const found = new Map<BdCol, number>();
  for (const h of heads) {
    const t = h.str.trim();
    for (const { col, re } of HEADER_PATTERNS) {
      if (found.has(col)) continue;
      if (re.test(t)) { found.set(col, h.x); break; }
    }
  }
  if (!found.has("crowd")) return null;
  const cols = [...found.entries()]
    .map(([col, x]) => ({ col, x }))
    .sort((a, b) => a.x - b.x);
  // The leftmost block has no heading of its own on this row (its heading
  // "SHOOT WEEK/DATE & SCENES" is split across two lines), so it is implied.
  return { cols: [{ col: "left" as BdCol, x: 0 }, ...cols], headerY };
}

// Which column an item falls in. A cell always starts at or slightly right of
// its heading, and the gap between two headings is wide, so the boundary sits
// at the MIDPOINT between consecutive heading positions. That tolerates both a
// cell indented a little past its heading and a heading whose text is centred,
// without needing any per-document tuning.
export function columnAt(layout: BdLayout, x: number): BdCol {
  const cols = layout.cols;
  let pick = cols[0].col;
  for (let i = 1; i < cols.length; i++) {
    const boundary = (cols[i - 1].x + cols[i].x) / 2;
    if (x >= boundary) pick = cols[i].col;
  }
  return pick;
}

// ── Rows ───────────────────────────────────────────────────────────────────

export interface BdCell {
  col: BdCol;
  text: string;
  /** Distinct fills seen in this cell, in reading order, non-default first. */
  fills: string[];
  x: number;
}

export interface BdGridRow {
  y: number;
  cells: BdCell[];
  /** Everything on the row joined left to right — for the classifiers. */
  text: string;
}

// Page furniture that appears on every page and means nothing. Dropped here so
// no later stage has to know about it.
const FURNITURE = [
  /^CROWD BREAKDOWN\b/i,
  /^SHOOT WEEK\s*\/\s*DATE$/i,
  /^&?\s*SCENES$/i,
  /^I\s*\/\s*E$/i,
  /^D$/,
  /^SHOOT DAY$/i,
  /^LOCATION\s*\/\s*HOURS/i,
  /CHARACTERS?\s*\/\s*REQUIREMENTS/i,
  /^CROWD\s+2ND\s+AD$/i,
];

export function isFurniture(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  return FURNITURE.some((re) => re.test(t));
}

// Group positioned items into table rows.
//
// Rows are found by y, not by anything else: a breakdown's cells are painted at
// whatever y their text sits on, and two cells on the same visual line can differ
// by a point or two. `tol` is how far apart two items may be and still be one
// row — comfortably under a line's height and comfortably over that jitter.
//
// Within a row, items in the same column are joined in x order. That is what
// re-assembles "LOCATION TBC" + " (0800 - 1830)", painted as two runs because
// the first is red and the second is not.
export function gridRows(items: BdItem[], layout: BdLayout, tol = 3.5): BdGridRow[] {
  const live = items.filter((it) => it.str.trim() && !isFurniture(it.str));
  // Top of the page downwards, which is descending y in PDF space.
  const sorted = [...live].sort((a, b) => b.y - a.y || a.x - b.x);
  const bands: BdItem[][] = [];
  for (const it of sorted) {
    const last = bands[bands.length - 1];
    if (last && Math.abs(last[0].y - it.y) <= tol) last.push(it);
    else bands.push([it]);
  }
  const rows: BdGridRow[] = [];
  for (const band of bands) {
    const byCol = new Map<BdCol, BdItem[]>();
    for (const it of band) {
      const col = columnAt(layout, it.x);
      const arr = byCol.get(col);
      if (arr) arr.push(it); else byCol.set(col, [it]);
    }
    const cells: BdCell[] = [];
    for (const [col, list] of byCol) {
      list.sort((a, b) => a.x - b.x);
      const text = joinRun(list);
      if (!text) continue;
      const fills: string[] = [];
      for (const it of list) {
        // A run of pure whitespace carries no colour worth recording — it is
        // painted in whatever fill happened to be current and would otherwise
        // out-vote the real text.
        if (!it.str.trim()) continue;
        for (const raw of it.fills || []) {
          const f = raw.toLowerCase();
          if (f && !fills.includes(f)) fills.push(f);
        }
      }
      cells.push({ col, text, fills, x: list[0].x });
    }
    if (!cells.length) continue;
    cells.sort((a, b) => a.x - b.x);
    rows.push({ y: band[0].y, cells, text: cells.map((c) => c.text).join("  ") });
  }
  return rows;
}

// Join runs into one cell's text, inserting a space only where the runs do not
// already provide one. Cell text is compared and pattern-matched downstream, so
// "2  Padel  Staff" and "2 Padel Staff" must not be different strings.
function joinRun(list: BdItem[]): string {
  let out = "";
  for (const it of list) {
    if (!out) { out = it.str; continue; }
    const needsGap = !/\s$/.test(out) && !/^\s/.test(it.str);
    out += (needsGap ? " " : "") + it.str;
  }
  return out.replace(/\s+/g, " ").trim();
}

// ── One page ───────────────────────────────────────────────────────────────

// Where a page's repeated furniture sits. A breakdown is printed as a table with
// a running head and a signature block, and BOTH have to go before anything is
// parsed — not because they are untidy, but because they are actively dangerous:
// the running head carries the document's date, and "17.08.2026" sitting in the
// STUNTS column parses as seventeen stunt performers on whatever day the page
// break happened to fall in. That is a fabricated booking on a real shoot day,
// invented by a page break.
//
// Both bands are found by position rather than by matching the words, so a
// production whose head reads something else is handled the same way:
//   · anything at or ABOVE the column header row is the running head;
//   · anything at or BELOW the signature block is the sign-off.
const FOOTER_MARKS = [/^CROWD\s+2ND\s+AD$/i, /^\d+(?:ND|RD|TH|ST)?\s+AD$/i];

export interface BdPage {
  layout: BdLayout;
  rows: BdGridRow[];
}

// Read one page into table rows, with its furniture removed.
//
// `layout` may be supplied from an earlier page: the header row is reprinted on
// every page of a real breakdown, but a continuation page that happens to omit
// it still has the same columns, so the first page's layout carries forward.
export function pageRows(items: BdItem[], carried?: BdLayout): BdPage | null {
  const layout = readLayout(items) || carried;
  if (!layout) return null;
  // The header row is the top of the table; the running head sits above it.
  // (A larger y is higher up the page: PDF space has its origin bottom-left.)
  const headerY = readLayout(items)?.headerY;
  let live = headerY === undefined ? items : items.filter((it) => it.y < headerY - 1);
  const footerY = items
    .filter((it) => FOOTER_MARKS.some((re) => re.test(it.str.trim())))
    .reduce<number | null>((lo, it) => (lo === null ? it.y : Math.max(lo, it.y)), null);
  if (footerY !== null) live = live.filter((it) => it.y > footerY + 1);
  return { layout, rows: gridRows(live, layout) };
}

export function cellOf(row: BdGridRow, col: BdCol): string {
  return row.cells.filter((c) => c.col === col).map((c) => c.text).join(" ").trim();
}

export function cellsOf(row: BdGridRow, col: BdCol): BdCell[] {
  return row.cells.filter((c) => c.col === col);
}

// ── Colour ─────────────────────────────────────────────────────────────────

// Attach fill colours to positioned text items.
//
// pdf.js hands back the two halves of this separately and they do NOT line up
// one-to-one: getTextContent MERGES adjacent runs that share a line ("LOCATION
// TBC" + " (0800 - 1830)" arrive as one item), while the paint operators keep
// them apart because the colour changed between them. Zipping the two lists by
// index therefore drifts within the first few cells and every colour after that
// is wrong — which, on a document where colour IS the tier, means children
// silently imported as ordinary crowd.
//
// So walk them together instead: for each positioned item, consume paint runs
// until their combined text covers it, and keep every fill that went into it.
// Comparison ignores whitespace because the two sides disagree about spacing.
//
// A leftover run — or an item nothing matched — never shifts the alignment: the
// walk always advances by the item, so one odd cell cannot corrupt the rest.
export function attachFills(
  items: { str: string; x: number; y: number; w?: number }[],
  runs: { str: string; fill: string }[],
): BdItem[] {
  const out: BdItem[] = [];
  let ri = 0;
  for (const it of items) {
    const want = squash(it.str);
    const fills: string[] = [];
    let got = "";
    // An empty or whitespace-only item consumes nothing: the paint runs never
    // contained it in the first place.
    while (want && got.length < want.length && ri < runs.length) {
      const r = runs[ri++];
      got += squash(r.str);
      if (r.fill && !fills.includes(r.fill)) fills.push(r.fill);
    }
    out.push({ ...it, fills });
  }
  return out;
}

function squash(s: string): string {
  return s.replace(/\s+/g, "");
}
