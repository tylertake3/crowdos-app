// Money quantisation.
//
// Every figure in this app is a sterling amount, and every one of them used to
// be a raw IEEE double in pounds that was only ever rounded at the moment it
// was printed. Two consequences, both of which a producer notices:
//
//  1. The per-day column did not foot to the grand total. Each day was rounded
//     independently for display while the total was rounded once from the full
//     unrounded sum, so the printed numbers disagreed with the printed total by
//     a few pence per day — measured at roughly £20 across an 80-day schedule.
//     "Your columns don't add up" is the end of a budget conversation.
//  2. A per-head rate was multiplied by a headcount BEFORE being rounded, which
//     is not how anyone gets paid. A payroll chit settles one artist's day to
//     the penny and then the production pays that penny amount 200 times.
//
// So: quantise the per-head figure, then multiply by the headcount, then build
// every total by adding already-quantised components. Rounding is half-up on
// the penny, with a small epsilon so a value that is 124.62499999999999 in
// binary because it came from 111.21 × 1.1207 still settles where a human
// reading the arithmetic expects it to.

const EPS = 1e-9;

/** One sterling amount, quantised to the penny (half-up). */
export function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const scaled = n * 100;
  return (n < 0 ? -Math.round(-scaled + EPS) : Math.round(scaled + EPS)) / 100;
}

/** A quantised per-head figure paid to a whole number of people. */
export function money(perHead: number, heads: number): number {
  return round2(round2(perHead) * (heads || 0));
}

/** Add quantised components without letting binary noise accumulate. */
export function sumMoney(...parts: number[]): number {
  return round2(parts.reduce((a, x) => a + (Number.isFinite(x) ? x : 0), 0));
}
