// Two document defects that only show up on paper: a week total that counts
// people who were never in that week, and a heading with nothing under it.

import { describe, it, expect } from "vitest";
import { projectCrowdDoc, prepModel } from "../lib/engine";
import type { CbBandRow, CbRow, CbTotalRow, Scene, ScheduleModel, ShootDay } from "../lib/engine";

const scene = (num: string, sa: number, over: Partial<Scene> = {}): Scene => ({
  num, part: "", ie: "EXT", slug: "SOMEWHERE", tod: "Day", scriptDay: "", pages: "1/8",
  unit: "Main", desc: "", sa, veh: 0, pod: false, cast: [], tags: [], ...over,
});

const day = (num: number, date: string, scenes: Scene[], over: Partial<ShootDay> = {}): ShootDay => ({
  num, date, sr: "", ss: "", loc: "Barbican", hours: "", type: "", cams: "",
  scenes, pages: "", ...over,
});

const model = (days: ShootDay[]): ScheduleModel =>
  prepModel({ days, castMap: {}, notes: [] }, "Main");

const weekTotals = (rows: CbRow[]) =>
  rows.filter((r) => r.kind === "weekTotal").map((r) => (r as CbTotalRow).no);

describe("week totals — an undated day's crowd is not absorbed by the next week", () => {
  it("a leading undated day does not inflate week 1", () => {
    // The undated day opens no week of its own (it has no week key), but its
    // crowd used to bank into the running accumulators, which the next real
    // week then closed over.
    const doc = projectCrowdDoc(
      model([
        day(0, "TBC", [scene("0/1", 500)]), //         no readable date
        day(1, "Monday 6th July 2026", [scene("1/1", 10)]),
        day(2, "Tuesday 7th July 2026", [scene("2/1", 20)]),
      ])
    );
    expect(weekTotals(doc.rows)).toEqual([30]); // not 530
  });

  it("each week still totals its own days", () => {
    const doc = projectCrowdDoc(
      model([
        day(1, "Monday 6th July 2026", [scene("1/1", 10)]),
        day(2, "Tuesday 7th July 2026", [scene("2/1", 20)]),
        day(3, "Monday 13th July 2026", [scene("3/1", 5)]),
      ])
    );
    expect(weekTotals(doc.rows)).toEqual([30, 5]);
  });

  it("the undated day is still counted in the grand total — nothing is lost", () => {
    const doc = projectCrowdDoc(
      model([
        day(0, "TBC", [scene("0/1", 500)]),
        day(1, "Monday 6th July 2026", [scene("1/1", 10)]),
      ])
    );
    const grand = doc.rows.find((r) => r.kind === "grandTotal")! as CbTotalRow;
    expect(grand.no).toBe(510);
  });
});

describe("banners never print with nothing beneath them", () => {
  const withBanners = (hideEmpty: boolean) =>
    projectCrowdDoc(
      model([
        day(1, "Monday 6th July 2026", [
          scene("1/1", 10),
          scene("1/2", 0, { tags: ["SET MOVE"] }), //  empty scene under a SET MOVE
          scene("1/3", 0), //                          empty scene under a location banner
        ], {
          locBlocks: [
            { loc: "Barbican", from: 0 },
            { loc: "EXT USS AUGUSTA BUILD", from: 2 },
          ],
        }),
      ]),
      { hideEmpty }
    );

  const banners = (rows: CbRow[]) => rows.filter((r) => r.kind === "banner").map((r) => (r as CbBandRow).label);

  it("a banner whose scenes are all hidden is not printed", () => {
    expect(banners(withBanners(true).rows)).toEqual([]);
  });

  it("with nothing hidden, every banner prints as before", () => {
    expect(banners(withBanners(false).rows)).toEqual(["SET MOVE", "EXT USS AUGUSTA BUILD"]);
  });

  it("a banner still prints when a later scene in its block survives", () => {
    const doc = projectCrowdDoc(
      model([
        day(1, "Monday 6th July 2026", [
          scene("1/1", 10),
          scene("1/2", 0), //  first scene of the block, hidden
          scene("1/3", 25), // still in the block, and printed
        ], {
          locBlocks: [
            { loc: "Barbican", from: 0 },
            { loc: "EXT USS AUGUSTA BUILD", from: 1 },
          ],
        }),
      ]),
      { hideEmpty: true }
    );
    const rows = doc.rows;
    const bannerAt = rows.findIndex((r) => r.kind === "banner");
    expect((rows[bannerAt] as CbBandRow).label).toBe("EXT USS AUGUSTA BUILD");
    // and the scene it introduces really is beneath it
    expect(rows.slice(bannerAt + 1).find((r) => r.kind === "scene")?.sceneNum).toBe("1/3");
  });

  it("every banner in the document has at least one scene row after it", () => {
    for (const hideEmpty of [true, false]) {
      const rows = withBanners(hideEmpty).rows;
      rows.forEach((r, i) => {
        if (r.kind !== "banner") return;
        const rest = rows.slice(i + 1);
        const nextScene = rest.findIndex((x) => x.kind === "scene");
        const nextTotal = rest.findIndex((x) => x.kind === "dayTotal" || x.kind === "day");
        expect(nextScene, `${(r as CbBandRow).label} (hideEmpty=${hideEmpty})`).toBeGreaterThanOrEqual(0);
        expect(nextScene).toBeLessThan(nextTotal < 0 ? Infinity : nextTotal);
      });
    }
  });
});
