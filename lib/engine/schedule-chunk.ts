// Splitting a schedule into readable pieces, and stitching the pieces back.
//
// This lives in lib/engine — NOT beside the API route — because BOTH sides need
// it. The browser splits the extracted PDF text and sends one piece per request
// (so no single request has to read a whole feature schedule inside one
// serverless time limit), then merges the pieces back itself. The route uses the
// same functions for older clients that still post the whole document.
//
// Both sides MUST agree on the split, so there is exactly one implementation.

// Split into chunks small enough that each fits comfortably in one response,
// cutting ONLY at block boundaries (scene headers / day banners) — a scene
// block sliced mid-way reads as two partial scenes, and its background counts
// can be lost. Soft target ~350 lines; hard cap 500 when no boundary exists.
// A day split across chunks is stitched back together by date in mergeRawDays.
//
// Lines alone are NOT a safe measure of size: a PDF text layer can extract to a
// single line of half a megabyte, which by line count is one chunk but by cost
// is a whole document. Every chunk is therefore ALSO hard-split at
// MAX_CHUNK_CHARS characters, so no input shape can smuggle an unbounded
// amount of text into one model call.
export const MAX_CHUNK_CHARS = 40_000;

export function chunkText(text: string, target = 350, cap = 500, maxChars = MAX_CHUNK_CHARS): string[] {
  return chunkByLines(text, target, cap).flatMap((c) => splitOnChars(c, maxChars));
}

// Last-resort character split, preferring a newline near the cut so a scene
// block is broken mid-line only when the text genuinely has no line breaks.
function splitOnChars(chunk: string, maxChars: number): string[] {
  if (chunk.length <= maxChars) return [chunk];
  const out: string[] = [];
  let i = 0;
  while (i < chunk.length) {
    let end = Math.min(i + maxChars, chunk.length);
    if (end < chunk.length) {
      const nl = chunk.lastIndexOf("\n", end);
      if (nl > i + maxChars / 2) end = nl;
    }
    out.push(chunk.slice(i, end));
    i = end;
  }
  return out;
}

function chunkByLines(text: string, target: number, cap: number): string[] {
  const lines = text.split("\n");
  if (lines.length <= cap) return [text];
  const isBoundary = (ln: string) =>
    /^\s*(INT|EXT|I\s*\/\s*E|INT\/EXT)\b/i.test(ln) || // scene block header
    /^\s*-*\s*DAY\s*#?\s*\d+/i.test(ln); //               shoot-day banner
  const chunks: string[] = [];
  let start = 0;
  while (start < lines.length) {
    if (lines.length - start <= cap) {
      chunks.push(lines.slice(start).join("\n"));
      break;
    }
    let cut = -1;
    for (let i = start + target; i < start + cap; i++) {
      if (isBoundary(lines[i])) { cut = i; break; }
    }
    if (cut < 0) cut = start + cap; // no boundary found — hard cut
    chunks.push(lines.slice(start, cut).join("\n"));
    start = cut;
  }
  return chunks;
}

// A scene's identity for de-duplication is its number PLUS its part. A scene
// legitimately shot in two parts ("7A pt 1" and "7A pt 2") is two entries with
// the same number, and keying on the number alone silently threw one away
// along with its crowd and stunt counts. The AI schema has no part field, so
// the part marker is read from wherever it was printed: an explicit `part`
// field if one ever appears, the number itself, or the set/action text.
export function rawSceneKey(s: any): string {
  const num = String(s?.num ?? "").toLowerCase().replace(/[\s.]+/g, "");
  if (!num) return "";
  const explicit = String(s?.part ?? "").toLowerCase().replace(/[\s.]+/g, "");
  const part = explicit || partMarker(`${s?.slug ?? ""} ${s?.desc ?? ""} ${s?.pages ?? ""}`);
  return part ? `${num}|${part}` : num;
}

// "PT 2", "part 3", "Pt.1a" → "pt2" / "pt3" / "pt1a". Requires a digit, so an
// ordinary sentence ("takes part in the chase") is not mistaken for a part.
function partMarker(text: string): string {
  const m = /\b(?:pt|part)\.?\s*(\d+[a-z]?)\b/i.exec(text);
  return m ? "pt" + m[1].toLowerCase() : "";
}

// Stitch chunk results: days with the same printed date merge into one (their
// scenes concatenated, deduped by scene number + part) — this re-joins a day
// that was cut across a chunk boundary. Days without a date stay separate.
export function mergeRawDays(days: any[]): any[] {
  const byDate = new Map<string, any>();
  const out: any[] = [];
  for (const d of days) {
    const date = String(d?.date || "").trim();
    const existing = date ? byDate.get(date) : undefined;
    if (existing) {
      const seen = new Set((existing.scenes || []).map((s: any) => rawSceneKey(s)));
      for (const s of d?.scenes || []) {
        const n = rawSceneKey(s);
        if (!n || !seen.has(n)) {
          existing.scenes.push(s);
          seen.add(n);
        }
      }
      // A day-level total (e.g. "Extras x 48: Stunts x 6") may sit in whichever
      // chunk held the day's footer — keep it if the first chunk had none.
      if (!(existing.background || []).length && (d?.background || []).length) existing.background = d.background;
      if (!(existing.stunts || []).length && (d?.stunts || []).length) existing.stunts = d.stunts;
    } else {
      const day = { ...d, scenes: [...(d?.scenes || [])] };
      if (date) byDate.set(date, day);
      out.push(day);
    }
  }
  return out;
}
