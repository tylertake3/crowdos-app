// The AI reader's day ordering.
//
// Regression origin: a 38-day schedule read by AI came back with its dates in
// a scrambled order. The cause was in normalize() — the model's own day
// numbers are DISCARDED and replaced by array position (each chunk restarts
// its numbering at 1), which is only correct if the array is already in shoot
// order. It is not: a long schedule is read in several chunks, a day can be
// reported out of order inside a chunk, and a day split across a chunk
// boundary is re-joined at the position of its first fragment.
import { describe, it, expect } from "vitest";
import { normalize, sortDatedDays } from "../lib/engine/ai-normalize";
import { mergeRawDays } from "../lib/engine/schedule-chunk";

const day = (num: number, date: string, scenes: any[] = [{ num: "1" }]) => ({
  num, date, loc: "", type: "", hours: "", scenes,
});
const dates = (m: any) => m.days.map((d: any) => d.date);
const nums = (m: any) => m.days.map((d: any) => d.num);

describe("AI reader — day order", () => {
  it("puts scrambled days back in calendar order and renumbers from 1", () => {
    const m = normalize({
      days: [
        day(1, "Wednesday 9th Sep"),
        day(1, "Monday 7th Sep"),
        day(2, "Thursday 10th Sep"),
        day(2, "Tuesday 8th Sep"),
      ],
      castMap: [],
    });
    expect(dates(m)).toEqual([
      "Monday 7th Sep", "Tuesday 8th Sep", "Wednesday 9th Sep", "Thursday 10th Sep",
    ]);
    expect(nums(m)).toEqual([1, 2, 3, 4]);
  });

  it("orders across a month boundary rather than by the printed day number", () => {
    const m = normalize({
      days: [day(3, "Thursday 1st Oct"), day(1, "Monday 28th Sep"), day(2, "Friday 2nd Oct")],
      castMap: [],
    });
    expect(dates(m)).toEqual(["Monday 28th Sep", "Thursday 1st Oct", "Friday 2nd Oct"]);
  });

  it("leaves days alone when no date can be read — never shuffles on a guess", () => {
    const m = normalize({
      days: [day(1, "block two"), day(2, "block one"), day(3, "")],
      castMap: [],
    });
    expect(dates(m)).toEqual(["block two", "block one", ""]);
  });

  it("sorts only the dated days, into the slots dated days already hold", () => {
    const days = [
      { date: "Wednesday 9th Sep" },
      { date: "" }, //           an undated record stays at index 1
      { date: "Monday 7th Sep" },
    ];
    sortDatedDays(days);
    expect(days.map((d) => d.date)).toEqual(["Monday 7th Sep", "", "Wednesday 9th Sep"]);
  });

  it("keeps two records for one date in their reported order", () => {
    const days = [
      { date: "Tuesday 8th Sep", id: "b" },
      { date: "Monday 7th Sep", id: "main" },
      { date: "Monday 7th Sep", id: "splinter" },
    ] as any[];
    sortDatedDays(days);
    expect(days.map((d) => d.id)).toEqual(["main", "splinter", "b"]);
  });

  it("still stitches a chunk-split day back together before ordering", () => {
    const merged = mergeRawDays([
      day(1, "Monday 7th Sep", [{ num: "43" }]),
      day(1, "Tuesday 8th Sep", [{ num: "13" }]),
      day(1, "Monday 7th Sep", [{ num: "14" }, { num: "43" }]), // tail of day 1
    ]);
    const m = normalize({ days: merged, castMap: [] });
    expect(dates(m)).toEqual(["Monday 7th Sep", "Tuesday 8th Sep"]);
    expect(m.days[0].scenes.map((s: any) => s.num)).toEqual(["43", "14"]);
  });
});
