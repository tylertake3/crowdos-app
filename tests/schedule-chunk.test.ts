// Reading a LONG schedule all the way to its last shoot day.
//
// The bug these tests exist for: a real 16-page, eight-week feature schedule
// (7 September – 30 October) was uploaded and came back ending in mid-October.
// Its text split into three pieces; the reader route sent the first two and, by
// the time those came back, its dispatch budget had expired — so the third piece
// (17–30 October) was never read at all. Two full weeks of shoot vanished from a
// document that looked like it had been read.
//
// The fix has two halves, and both are asserted here:
//   1. the split is shared with the browser, which sends one piece per request
//      so no piece competes with another for a single request's time budget;
//   2. every piece's days stitch back into one schedule, last piece included.

import { describe, it, expect } from "vitest";
import { chunkText, mergeRawDays, MAX_CHUNK_CHARS } from "../lib/engine/schedule-chunk";

// A schedule shaped like the real one: a day banner, a couple of scene blocks
// per day, dated across two months so a dropped tail is unmistakable.
function schedule(days: number, from = new Date(Date.UTC(2026, 8, 7))): { text: string; dates: string[] } {
  const dates: string[] = [];
  const out: string[] = [];
  for (let d = 0; d < days; d++) {
    const day = new Date(from.getTime() + d * 86400000);
    const date = day.toISOString().slice(0, 10);
    dates.push(date);
    out.push(`--- DAY ${d + 1} --- ${date} ---`);
    for (let s = 0; s < 6; s++) {
      out.push(`EXT. STREET MARKET — DAY`);
      out.push(`Sc ${d * 10 + s + 1}   Crowd chases the van through the market stalls`);
      out.push(`Cast Members: 1, 2, 4`);
      out.push(`Background Actors: Crowd x 40`);
      out.push(`Stunts x 6`);
    }
    out.push(`Extras x 40: Stunts x 6`);
  }
  return { text: out.join("\n"), dates };
}

describe("splitting a long schedule", () => {
  it("splits an eight-week schedule into more than two pieces", () => {
    // The exact shape that used to fail: more pieces than the old budget could
    // dispatch. If this ever returns 2 or fewer the regression below is vacuous.
    const { text } = schedule(40);
    expect(chunkText(text).length).toBeGreaterThan(2);
  });

  it("keeps the LAST shoot day in the LAST piece", () => {
    const { text, dates } = schedule(40);
    const pieces = chunkText(text);
    const last = dates[dates.length - 1];
    expect(pieces[pieces.length - 1]).toContain(last);
    // ...and it appears exactly once across the whole split — no piece silently
    // duplicates or drops it.
    expect(pieces.filter((p) => p.includes(last)).length).toBe(1);
  });

  it("loses no line of the document across the split", () => {
    const { text } = schedule(40);
    expect(chunkText(text).join("\n")).toBe(text);
  });

  it("never emits a piece too large for one request", () => {
    const { text } = schedule(120);
    for (const p of chunkText(text)) expect(p.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS);
  });
});

describe("stitching the pieces back", () => {
  // What the browser does with the pieces' replies: concatenate every piece's
  // raw days and merge by date. The whole schedule must survive, first day to
  // last, with no day dropped and none duplicated.
  it("rebuilds every shoot day from the pieces, first to last", () => {
    const { dates } = schedule(40);
    // Stand in for the reader: each piece returns the days its text covers.
    const perPiece = [dates.slice(0, 15), dates.slice(15, 30), dates.slice(30)];
    const raw = perPiece.flatMap((ds) => ds.map((date) => ({ date, scenes: [{ num: "1" }] })));
    const merged = mergeRawDays(raw);
    expect(merged.length).toBe(dates.length);
    expect(merged[0].date).toBe(dates[0]);
    expect(merged[merged.length - 1].date).toBe(dates[dates.length - 1]);
  });

  it("rejoins a day that was cut across two pieces", () => {
    // A day whose scene blocks straddle a cut comes back as two partial days
    // with the same date. They must become ONE day holding both scenes —
    // otherwise the shoot gains a phantom extra day and loses half its crowd.
    const merged = mergeRawDays([
      { date: "2026-10-16", scenes: [{ num: "101" }, { num: "102" }], background: [] },
      { date: "2026-10-16", scenes: [{ num: "103" }], background: [{ name: "Crowd", n: 40 }] },
    ]);
    expect(merged.length).toBe(1);
    expect(merged[0].scenes.map((s: any) => s.num)).toEqual(["101", "102", "103"]);
    expect(merged[0].background.length).toBe(1);
  });

  it("keeps a scene shot in two parts as two scenes", () => {
    const merged = mergeRawDays([
      { date: "2026-10-16", scenes: [{ num: "7A", desc: "pt 1 of the chase" }] },
      { date: "2026-10-16", scenes: [{ num: "7A", desc: "pt 2 of the chase" }] },
    ]);
    expect(merged[0].scenes.length).toBe(2);
  });
});
