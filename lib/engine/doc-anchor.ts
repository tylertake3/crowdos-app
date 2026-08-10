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

export interface AnchorLine {
  text: string;
  [k: string]: unknown;
}

// leading dashes/asterisks/space, optional "Shoot", "Day", optional "#",
// the number, and optionally "- <number>" for a combined day
const BANNER_RX = /^[-–—\s*]*(?:shoot\s+)?day\s*#?\s*(\d+)\s*(?:[-–—]\s*(\d+))?\b/i;
const END_RX = /^[-–—\s*]*end\b/i;

/** True when `text` is a day banner opening shoot day `num`. */
export function isDayBanner(text: string, num?: number): boolean {
  if (END_RX.test(text)) return false;
  const m = text.match(BANNER_RX);
  if (!m) return false;
  if (num == null) return true;
  const a = +m[1];
  const b = m[2] ? +m[2] : a;
  const hi = b >= a && b - a < 20 ? b : a; // "2 - 3" is a range; "12 - 8th" is not
  return num >= a && num <= hi;
}

/**
 * Map every shoot-day number to the line that opens it. Earlier lines win, so
 * a day is anchored to its first (opening) banner.
 */
export function dayBannerIndex<T extends AnchorLine>(lines: T[]): Map<number, T> {
  const map = new Map<number, T>();
  for (const ln of lines) {
    if (END_RX.test(ln.text)) continue;
    const m = ln.text.match(BANNER_RX);
    if (!m) continue;
    const a = +m[1];
    const b = m[2] ? +m[2] : a;
    const hi = b >= a && b - a < 20 ? b : a;
    for (let n = a; n <= hi; n++) if (!map.has(n)) map.set(n, ln);
  }
  return map;
}
