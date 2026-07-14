// Column-aware PDF text layout. Full Fat schedules place category blocks in
// side-by-side columns (Background Actors | Vehicles, Cast Members | Props);
// naive row-joining merges those columns into single lines, bleeding vehicle
// entries into crowd lists. This module rebuilds reading order instead:
// header rows (scene lines, day banners) merge left-to-right as before, but
// once a category row appears inside a scene block, subsequent segments are
// routed into per-column streams which are emitted column by column when the
// block ends. The parser then sees each category with exactly its own lines.

export interface LayoutItem {
  str: string;
  x: number;
  y: number;
  w: number;
}

// A new scene/day block starts at these lines — flush any open columns.
// Includes number-first scene lines ("310.25 INT …") so they merge as one
// header row instead of being split across columns.
const ANCHOR_RX =
  /^(Scene\s*#|INT\b|EXT\b|INT\/EXT|EXT\/INT|I\/E\b|\d+[\d./]*(?:pt\d+|[A-Za-z])?\s+(?:INT|EXT|INT\/EXT|EXT\/INT|I\/E)\b|Shoot Day\s*#|SHOOT DAY\s+\d|End Day\s*#|End of Day|DAY\s+\d+\s*[-–]|-{2,}|={2,})/i;

// Category headers that begin/extend a columned region. Deliberately NOT a
// full department list: single words like "Camera" or "Sound" also appear as
// wrapped fragments of ordinary text ("…Off / Camera") and must never spawn
// a column. Columns only need to protect the people/vehicle blocks.
const CATEGORY_RX =
  /^(Cast Members|Background Actors|Featured Background Actors|Stunt Performers|Stunts|Spacts|SA's|SAs|Supporting Artists|Pod Cars|Vehicles|Props|Special Effects|Visual Effects|Art Department|Set Dressing|Home Economist|Photos \/ Images|Stand Ins)\s*$/;

const SEGMENT_GAP = 40; // pt of horizontal whitespace that separates columns

interface Segment {
  x: number;
  text: string;
}

function rowSegments(items: LayoutItem[]): Segment[] {
  const segs: Segment[] = [];
  let cur: LayoutItem[] = [];
  const flush = () => {
    if (!cur.length) return;
    segs.push({
      x: cur[0].x,
      text: cur.map((i) => i.str).join(" ").replace(/\s{2,}/g, " ").trim(),
    });
    cur = [];
  };
  for (const it of items) {
    const prev = cur[cur.length - 1];
    // right-aligned count tokens ("HUB AGENTS   [10]") belong to the text
    // on their left however wide the gap — never start a column with one
    const isCount = /^[[(]\d+[\])]$/.test(it.str.trim());
    if (prev && !isCount && it.x - (prev.x + prev.w) > SEGMENT_GAP) flush();
    cur.push(it);
  }
  flush();
  return segs.filter((s) => s.text);
}

export function layoutToLines(pageItems: LayoutItem[]): string[] {
  // group items into visual rows
  const rows = new Map<number, LayoutItem[]>();
  for (const it of pageItems) {
    const y = Math.round(it.y / 3) * 3;
    const arr = rows.get(y) || [];
    arr.push(it);
    rows.set(y, arr);
  }
  const ys = [...rows.keys()].sort((a, b) => b - a);

  const out: string[] = [];
  let columns: { x: number; lines: string[] }[] | null = null;

  const flushColumns = () => {
    if (!columns) return;
    for (const col of columns) out.push(...col.lines);
    columns = null;
  };
  const assign = (seg: Segment) => {
    // rightmost column starting at or left of the segment (with tolerance
    // for indented content under its header); a segment left of every known
    // column starts a NEW column there (e.g. Background Actors appearing
    // below a right-hand Props header)
    let target: { x: number; lines: string[] } | null = null;
    for (const col of columns!) if (col.x <= seg.x + 15) target = col;
    // a category header at an unknown x starts a new column there (headers
    // of neighbouring columns often sit on different rows)
    const misaligned = !target || Math.abs(target.x - seg.x) > 15;
    if (!target || (misaligned && CATEGORY_RX.test(seg.text))) {
      target = { x: seg.x, lines: [] };
      columns!.push(target);
      columns!.sort((a, b) => a.x - b.x);
    }
    target.lines.push(seg.text);
  };

  for (const y of ys) {
    const items = rows.get(y)!.sort((a, b) => a.x - b.x);
    const segs = rowSegments(items);
    if (!segs.length) continue;
    const merged = segs.map((s) => s.text).join(" ").replace(/\s{2,}/g, " ").trim();

    if (ANCHOR_RX.test(merged)) {
      flushColumns();
      out.push(merged);
      continue;
    }
    if (!columns && segs.some((s) => CATEGORY_RX.test(s.text))) {
      // first category row of the block defines the columns
      columns = segs.map((s) => ({ x: s.x, lines: [s.text] }));
      continue;
    }
    if (columns) {
      for (const seg of segs) assign(seg);
      continue;
    }
    out.push(merged);
  }
  flushColumns();
  return out;
}
