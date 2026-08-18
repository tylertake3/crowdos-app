// Finding a shoot day's own line inside the ORIGINAL document.
//
// The review page lets you click a day and have the PDF scroll to it. That
// needs the day's banner line — and the naive test ("a line mentioning day N")
// is wrong in a way that only shows up on real schedules:
//
//   Shoot Day # 4 Thursday, July 3, 2025          <- the banner (what we want)
//   Scene # 70pt INT/EXT IAN'S APARTMENT Day 4 2/8 <- a SCENE row
//   End Day # 4 Thursday, July 3, 2025 -- Total Pages: 4 4/8
//
// In a scene row "Day" is the day/night marker and the number after it is the
// page count in eighths — nothing to do with shoot day 4. Searching anywhere
// in the line therefore lands on a random scene for every low-numbered day.
//
// Two rules make it reliable, and both come from how these documents are laid
// out rather than from any one production's template:
//   1. A banner STARTS its line (optionally after dashes/asterisks). A scene
//      row's "Day" token never does — it sits after the set and INT/EXT.
//   2. "End Day # N" closes a day; it must never win over the opening banner.
//
// A banner may also cover a range ("Shoot Day # 2 - 3 Tue., Jul. 1 - Wed.,
// Jul. 2"), in which case both days point at it.
//
// Ruled-table documents (the crowd breakdown especially) put the same banner in
// the MIDDLE of a header row, because the row is laid out as columns:
//
//   Wednesday 9 September 2026   SHOOT DAY 3   HERTFORDSHIRE COUNTRY CLUB
//
// So a second rule: the words "SHOOT DAY <n>" together are a banner wherever
// they appear on the line. "Shoot day" is never how a scene row writes its
// day/night marker, so this cannot pick up a page-eighths token.

import { parseDayDateFull } from "./model";

export interface AnchorLine {
  text: string;
  [k: string]: unknown;
}

// leading dashes/asterisks/space, optional "Shoot", "Day", optional "#",
// the number, and optionally "- <number>" for a combined day
const BANNER_RX = /^[-–—\s*]*(?:shoot\s+)?day\s*#?\s*(\d+)\s*(?:[-–—]\s*(\d+))?\b/i;
// the same banner sitting in a column part-way along a header row — only ever
// with the word "shoot" in front, which a scene row never has
const MID_BANNER_RX = /(?:^|[^a-z])shoot\s+day\s*#?\s*(\d+)\s*(?:[-–—]\s*(\d+))?\b/i;
const END_RX = /^[-–—\s*]*end\b/i;
// a header row usually opens with the weekday
const WEEKDAY_RX = /^[-–—\s*]*(?:mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat|sun)/i;

/** The shoot-day span a banner line opens, or null when it isn't a banner. */
function bannerSpan(text: string): { lo: number; hi: number } | null {
  if (END_RX.test(text)) return null;
  const m = text.match(BANNER_RX) || text.match(MID_BANNER_RX);
  if (!m) return null;
  const a = +m[1];
  const b = m[2] ? +m[2] : a;
  // "2 - 3" is a range; "12 - 8th May" is a trailing date, not a range
  return { lo: a, hi: b >= a && b - a < 20 ? b : a };
}

/** True when `text` is a day banner opening shoot day `num`. */
export function isDayBanner(text: string, num?: number): boolean {
  const span = bannerSpan(text);
  if (!span) return false;
  if (num == null) return true;
  return num >= span.lo && num <= span.hi;
}

/**
 * Map every shoot-day number to the line that opens it. Earlier lines win, so
 * a day is anchored to its first (opening) banner.
 */
export function dayBannerIndex<T extends AnchorLine>(lines: T[]): Map<number, T> {
  const map = new Map<number, T>();
  for (const ln of lines) {
    const span = bannerSpan(ln.text);
    if (!span) continue;
    for (let n = span.lo; n <= span.hi; n++) if (!map.has(n)) map.set(n, ln);
  }
  return map;
}

/**
 * Find the line that carries a given calendar DATE — the anchor of last resort
 * when a document numbers its days differently from the board (or not at all).
 *
 * Matching on the date's own wording is hopeless: the board holds "10 Sep 2026"
 * and the document prints "Thursday 10 September 2026". So every line is parsed
 * as a date and compared as a date. A header row (one that opens with a weekday,
 * or carries a shoot-day banner) beats a body row, and the shortest line beats a
 * long one — the same "tightest match" rule the text search uses.
 *
 * `dateText` is the day's date exactly as the board holds it.
 */
export function findDateLine<T extends AnchorLine>(lines: T[], dateText: string): T | null {
  const want = parseDayDateFull({ date: String(dateText || "") });
  if (!want) return null;
  const wantKey = want.date.getFullYear() + "-" + want.date.getMonth() + "-" + want.date.getDate();
  let best: { score: number; line: T } | null = null;
  for (const ln of lines) {
    const text = ln.text || "";
    if (END_RX.test(text)) continue;
    // anchor an undated line to the year we're looking for, so "10 September"
    // and "10 September 2026" both compare equal
    const got = parseDayDateFull({ date: text }, { year: want.date.getFullYear() });
    if (!got) continue;
    if (got.date.getFullYear() + "-" + got.date.getMonth() + "-" + got.date.getDate() !== wantKey)
      continue;
    let score = text.length / 100;
    if (WEEKDAY_RX.test(text)) score -= 100;
    if (bannerSpan(text)) score -= 100;
    if (!best || score < best.score) best = { score, line: ln };
  }
  return best && best.line;
}
