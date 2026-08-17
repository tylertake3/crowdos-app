// A shoot day split across unit blocks — MAIN plus SPLINTER / 2ND / REHEARSAL —
// and the unnumbered "Day 0"s that all read as number 0.
//
// Measured on FML (Crowd Breakdown 17.08.26): 47 printed day rows over 39 ids.
// The day column footed to £454,049.73 against a true £390,220.58, because six
// shoot days and three Day 0s shared an id, so one block's money was printed
// once per block — including £33,247.28 charged to a splinter unit that had no
// crowd on it at all.
import { describe, it, expect } from "vitest";
import {
  prepModel,
  computeCrowdCosts,
  cdayKey,
  CROWD_DEFAULTS,
  projectCrowdDoc,
  type ScheduleModel,
  type ShootDay,
} from "../lib/engine";

const scene = (num: string, sa: number) =>
  ({ num, sa, ie: "INT", slug: "SET", desc: "", scriptDay: "D1" }) as unknown as ShootDay["scenes"][number];
const day = (num: number, date: string, sa: number, unitKind?: string): Partial<ShootDay> => ({
  num,
  date,
  loc: "Barbican",
  hours: "0800 - 1830",
  scenes: [scene("1", sa)],
  ...(unitKind ? { unitKind: unitKind as ShootDay["unitKind"] } : {}),
});

// Monday 7th: MAIN 32 heads + SPLINTER 67 heads. Plus two unnumbered days.
const build = (): ScheduleModel =>
  prepModel(
    {
      days: [
        day(6, "Monday 7th September 2026", 32),
        day(6, "Monday 7th September 2026", 67, "splinter"),
        day(0, "Saturday 19th September 2026", 50, "rehearsal"),
        day(0, "Monday 26th October 2026", 0),
      ],
    } as unknown as ScheduleModel,
    "Main"
  );

describe("a shoot day split across unit blocks", () => {
  it("gives every block its own id", () => {
    const m = build();
    const ids = m.days.map((d) => d.id);
    expect(ids).toEqual(["M6", "M6-SPL", "M0", "M0-MAIN"]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("leaves the FIRST block's identity alone, so saved edits still find it", () => {
    const m = build();
    expect(m.days[0].id).toBe("M6");
    expect(cdayKey(m.days[0])).toBe("Main|6"); // exactly what it was before
    expect(m.days[0].block).toBeUndefined();
    // and the extra blocks key separately, so editing one no longer edits both
    expect(cdayKey(m.days[1])).toBe("Main|6-SPL");
    expect(cdayKey(m.days[0])).not.toBe(cdayKey(m.days[1]));
  });

  it("costs each block on its own crowd", () => {
    const m = build();
    const cost = computeCrowdCosts(m, {}, CROWD_DEFAULTS);
    expect(Object.keys(cost.perDay)).toHaveLength(3); // the 0-head day isn't costed
    expect(cost.perDay["M6"].sa).toBe(32);
    expect(cost.perDay["M6-SPL"].sa).toBe(67);
    // 67 heads cost more than 32 of the same people — the splinter block is no
    // longer handed the main block's figure (nor the main the splinter's)
    const per = cost.perDay["M6"].cost / 32;
    expect(cost.perDay["M6-SPL"].cost).toBeCloseTo(per * 67, 2);
  });

  it("the breakdown document total foots to the headline total", () => {
    const m = build();
    const cost = computeCrowdCosts(m, {}, CROWD_DEFAULTS);
    const doc = projectCrowdDoc(m, {
      production: "FML",
      costs: true,
      dayCost: (id: string) => cost.perDay[id]?.cost || 0,
      perHead: () => 0,
    } as never) as never as { totals: { cost: number } };
    expect(Math.round(doc.totals.cost)).toBe(Math.round(cost.grand));
    // and the blocks are no longer all charged the same day's money
    const printed = (doc as never as { rows: { kind: string; cost: number }[] }).rows
      .filter((r) => r.kind === "dayTotal")
      .map((r) => Math.round(r.cost));
    expect(printed).toEqual([
      Math.round(cost.perDay["M6"].cost),
      Math.round(cost.perDay["M6-SPL"].cost),
      Math.round(cost.perDay["M0"].cost),
      0, // the blank Day 0 is charged nothing, not the rehearsal's money
    ]);
    // every block prints a different figure — the symptom was three rows all
    // showing the same day's money
    expect(new Set(printed).size).toBe(4);
  });
});
