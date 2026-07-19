// Generates real PDFs from the demo schedule text for upload-flow testing —
// NOT part of the normal suite (gated on AUDITPDF). The demo text parses to
// known-good numbers, so the whole upload → parse → publish path can be
// verified against pinned expectations. Run:
//   AUDITPDF=1 npx vitest run scripts/make-audit-pdf.test.ts
import { it } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { jsPDF } from "jspdf";
import { DEMO_FULLFAT } from "../lib/engine/demo/demo-fullfat";
import { parseAny, prepModel } from "../lib/engine";

function textToPdf(text: string, outPath: string, maxLines?: number) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const lines = text.split("\n").slice(0, maxLines ?? Infinity);
  doc.setFontSize(8);
  let y = 30;
  for (const line of lines) {
    if (y > 810) { doc.addPage(); y = 30; }
    doc.text(line.slice(0, 250) || " ", 24, y);
    y += 9.5;
  }
  writeFileSync(outPath, Buffer.from(doc.output("arraybuffer")));
}

it.runIf(process.env.AUDITPDF)("build audit PDFs from demo text", () => {
  mkdirSync("public/audit-tmp", { recursive: true });
  // v1: the demo's first 8 shoot days (D12–D19) — small & fast to upload.
  const t = DEMO_FULLFAT;
  const cut = t.indexOf("End Day # 19");
  const v1 = cut > 0 ? t.slice(0, t.indexOf("\n", cut) + 1) : t;
  textToPdf(v1, "public/audit-tmp/audit-v1.pdf");
  // v2 "revision": D12 has been shot — the document now starts at D13
  // (real mid-shoot behaviour), so the revision-carry path gets exercised.
  const day13 = v1.indexOf("Day 13 -");
  const header = v1.slice(0, v1.indexOf("Day 12 -"));
  const v2 = header + v1.slice(day13);
  textToPdf(v2, "public/audit-tmp/audit-v2.pdf");
  const m1 = prepModel(parseAny(v1), "Main"), m2 = prepModel(parseAny(v2), "Main");
  console.log("v1 days:", m1.days.length, "scenes:", m1.days.reduce((a, d) => a + d.scenes.length, 0));
  console.log("v2 days:", m2.days.length);
  writeFileSync("public/audit-tmp/expect.json", JSON.stringify({
    v1days: m1.days.length, v2days: m2.days.length,
  }));
});
