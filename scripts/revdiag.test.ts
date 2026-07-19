// Revision-diff diagnostic — NOT part of the normal test suite (gated on
// REVDIAG). Parses two real schedule PDFs of the SAME production with the
// app's own extraction+parser pipeline, then diffs them the way revision
// work-migration would need to: day matching by scene overlap, scene
// matching by scene number. Run:
//
//   REVDIAG=1 OLD="path/old.pdf" NEW="path/new.pdf" npx vitest run scripts/revdiag.test.ts
//
import { it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";

const LINES: string[] = [];
const log = (s: string) => { LINES.push(s); console.log(s); };
import { parseAny, parseSchedule, prepModel } from "../lib/engine";
import { layoutToLines } from "../lib/engine/pdf-layout";
import { sceneKey } from "../lib/engine/merge";

async function pdfToText(path: string): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(readFileSync(path)),
    useSystemFonts: true,
  }).promise;
  const out: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const items = (tc.items as any[]).filter((it) => {
      const tr = it.transform, scale = Math.hypot(tr[0], tr[1]);
      const rotated = Math.abs(tr[1]) > 0.5 || Math.abs(tr[2]) > 0.5;
      return !rotated && scale < 20 && it.str.trim();
    });
    out.push(...layoutToLines(items.map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width || 0 }))));
  }
  return out.join("\n");
}

const dayLabel = (d: any) =>
  `D${d.num} ${d.date || "undated"}${d.loc ? " @ " + d.loc.slice(0, 30) : ""}`;

// mirror the app's parseWith('auto'→parseAny) but prefer whichever read
// yields scenes — the classic one-line grammar handles the "One Line Colour
// Schedule" dialect that parseAny reads as scene-less days
function parseBest(text: string) {
  const any = parseAny(text);
  const anyScenes = any.days.reduce((a: number, d: any) => a + d.scenes.length, 0);
  if (anyScenes > 0) return any;
  const ol = parseSchedule(text);
  const olScenes = ol.days.reduce((a: number, d: any) => a + d.scenes.length, 0);
  return olScenes > anyScenes ? ol : any;
}

it.runIf(process.env.REVDIAG)("diff two schedule revisions", async () => {
  const oldPath = process.env.OLD!, newPath = process.env.NEW!;
  const A = prepModel(parseBest(await pdfToText(oldPath)), "Main");
  const B = prepModel(parseBest(await pdfToText(newPath)), "Main");
  log(`\nOLD: ${oldPath.split("/").pop()} → ${A.days.length} days, ${A.days.reduce((a, d) => a + d.scenes.length, 0)} scenes`);
  log(`NEW: ${newPath.split("/").pop()} → ${B.days.length} days, ${B.days.reduce((a, d) => a + d.scenes.length, 0)} scenes`);

  // scene → day index for both
  const sceneDay = (m: any) => {
    const map = new Map<string, any>();
    for (const d of m.days) for (const s of d.scenes) if (sceneKey(s)) map.set(sceneKey(s), d);
    return map;
  };
  const aScenes = sceneDay(A), bScenes = sceneDay(B);

  // ---- scene-level diff ----
  const added = [...bScenes.keys()].filter((k) => !aScenes.has(k));
  const removed = [...aScenes.keys()].filter((k) => !bScenes.has(k));
  const moved: string[] = [];
  let stayed = 0;
  for (const [k, dA] of aScenes) {
    const dB = bScenes.get(k);
    if (!dB) continue;
    const sameDate = (dA._date && dB._date && dA._date.toDateString() === dB._date.toDateString()) || dA.date === dB.date;
    if (sameDate) stayed++;
    else moved.push(`${k}: ${dayLabel(dA)} → ${dayLabel(dB)}`);
  }
  log(`\nSCENES: ${stayed} unchanged day · ${moved.length} moved · ${added.length} added · ${removed.length} removed`);
  for (const m of moved.slice(0, 40)) log("  MOVED  " + m);
  if (moved.length > 40) log(`  … +${moved.length - 40} more`);
  for (const k of added.slice(0, 20)) log("  ADDED  " + k + " on " + dayLabel(bScenes.get(k)));
  for (const k of removed.slice(0, 20)) log("  GONE   " + k + " (was " + dayLabel(aScenes.get(k)) + ")");

  // ---- day-level matching by scene overlap (Jaccard), the CDAY carrier ----
  log(`\nDAY MATCHING (old day → best new day by scene overlap):`);
  for (const dA of A.days) {
    const keysA = new Set(dA.scenes.map(sceneKey).filter(Boolean));
    let best: any = null, bestJ = 0;
    for (const dB of B.days) {
      const keysB = new Set(dB.scenes.map(sceneKey).filter(Boolean));
      const inter = [...keysA].filter((k) => keysB.has(k)).length;
      const j = inter / (new Set([...keysA, ...keysB]).size || 1);
      if (j > bestJ) { bestJ = j; best = dB; }
    }
    const sameNum = best && best.num === dA.num;
    const sameDate = best && ((dA._date && best._date && dA._date.toDateString() === best._date.toDateString()) || dA.date === best.date);
    const tag = !best ? "NO MATCH" : bestJ === 1 && sameNum && sameDate ? "identical" : `${Math.round(bestJ * 100)}% overlap${sameNum ? "" : " · RENUMBERED"}${sameDate ? "" : " · DATE MOVED"}`;
    if (!best || bestJ < 1 || !sameNum || !sameDate)
      log(`  ${dayLabel(dA)}  →  ${best ? dayLabel(best) : "—"}   [${tag}]`);
  }
  writeFileSync(process.env.OUT || "/tmp/revdiag.txt", LINES.join("\n") + "\n");
});