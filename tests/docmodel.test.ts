// DocModel — the projection behind both the table view and the .xlsx export.
// These tests pin the contract the two renderers rely on, so screen and
// spreadsheet cannot drift apart.

import { describe, expect, it } from "vitest";
import {
  projectBreakdown,
  sceneHeadCount,
  sceneAssessment,
  BREAKDOWN_COLUMNS,
  type DocStamp,
} from "../lib/engine/docmodel";
import type { ScheduleModel, Scene, ShootDay } from "../lib/engine/types";

const scene = (over: Partial<Scene> = {}): Scene => ({
  num: "1", part: "", ie: "INT", tod: "DAY", scriptDay: "1", pages: "1",
  unit: "Main", desc: "Pub interior", sa: 0, veh: 0, pod: false,
  cast: [], tags: [], ...over,
});

const day = (scenes: Scene[], over: Partial<ShootDay> = {}): ShootDay => ({
  num: 1, date: "Monday 6 July 2026", sr: "", ss: "", loc: "Barbican",
  hours: "0800-1700", type: "CWD", cams: "", pages: "", scenes,
  unit: "Main", id: "M1", ...over,
});

const model = (days: ShootDay[], over: Partial<ScheduleModel> = {}): ScheduleModel => ({
  days, castMap: {}, notes: [], ...over,
});

// injected, never from the clock — keeps golden output stable
const stamp: DocStamp = {
  production: "TPOP",
  view: "Crowd Breakdown",
  exportedAt: "2026-08-03 12:00",
  sourceScheduleDate: "19.02.26",
  appVersion: "v1",
  rateCard: "PACT/FAA 2026",
};

const project = (m: ScheduleModel, o: Partial<Parameters<typeof projectBreakdown>[1]> = {}) =>
  projectBreakdown(m, { stamp, ...o });

const rowsOf = (m: ScheduleModel, kind: string) =>
  project(m).sheets[0].rows.filter((r) => r.kind === kind);

describe("document structure", () => {
  it("emits the design-locked column set, in order, once", () => {
    const doc = project(model([day([scene()])]));
    const header = doc.sheets[0].rows.filter((r) => r.kind === "columnHeader");
    expect(header).toHaveLength(1);
    expect(header[0].cells.map((c) => c.v)).toEqual([...BREAKDOWN_COLUMNS]);
  });

  it("row numbers are 1-based, contiguous and unique (SUM ranges depend on it)", () => {
    const doc = project(model([day([scene({ saChars: [{ name: "Crowd", count: 10 }] })])]));
    const nums = doc.sheets[0].rows.map((r) => r.row);
    expect(nums).toEqual(nums.map((_, i) => i + 1));
  });

  it("stamps the sheet with production, export time and the source schedule date", () => {
    const flat = rowsOf(model([day([scene()])]), "stamp")
      .flatMap((r) => r.cells.map((c) => String(c.v)))
      .join(" | ");
    expect(flat).toContain("TPOP");
    expect(flat).toContain("2026-08-03 12:00");
    expect(flat).toContain("As per shooting schedule dated 19.02.26");
  });

  it("freezes the header row", () => {
    const doc = project(model([day([scene()])]));
    const header = doc.sheets[0].rows.find((r) => r.kind === "columnHeader")!;
    expect(doc.sheets[0].freezeAfterRow).toBe(header.row);
  });

  it("renders a day band and a unit band per day", () => {
    const m = model([
      day([scene()]),
      day([scene()], { id: "M2", num: 2, date: "Tuesday 7 July 2026", unitKind: "splinter" }),
    ]);
    expect(rowsOf(m, "dayHeader")).toHaveLength(2);
    expect(rowsOf(m, "unitHeader")).toHaveLength(2);
    // unit kind surfaces so POP's footer buckets are reproducible
    expect(String(rowsOf(m, "unitHeader")[1].cells[0].v)).toContain("splinter");
  });

  it("renders section banners as full-width rows", () => {
    const m = model([day([scene({ tags: ["SET MOVE"] }), scene({ num: "2" })])]);
    const banners = rowsOf(m, "banner");
    expect(banners).toHaveLength(1);
    expect(banners[0].cells[0].v).toBe("SET MOVE");
  });
});

describe("the three scene states and the completeness strip", () => {
  it("classifies crowded / confirmed-N/A / unassessed", () => {
    expect(sceneAssessment(scene({ saChars: [{ name: "Crowd", count: 5 }] }))).toBe("crowded");
    expect(sceneAssessment(scene({ reqStatus: "none" }))).toBe("none");
    expect(sceneAssessment(scene())).toBe("pending");
  });

  it("computes the strip arithmetic", () => {
    const doc = project(
      model([
        day([
          scene({ num: "1", saChars: [{ name: "Crowd", count: 5 }] }),
          scene({ num: "2", reqStatus: "none" }),
          scene({ num: "3", reqStatus: "none" }),
          scene({ num: "4" }),
        ]),
      ])
    );
    expect(doc.completeness).toEqual({
      crowded: 1,
      confirmedNone: 2,
      unassessed: 1,
      pctAssessed: 75,
    });
  });

  it("labels a confirmed N/A distinctly from an unassessed scene", () => {
    const m = model([day([scene({ num: "1", reqStatus: "none" }), scene({ num: "2" })])]);
    const cells = rowsOf(m, "scene").map((r) => String(r.cells[4].v));
    expect(cells[0]).toBe("N/A — confirmed no crowd");
    expect(cells[1]).toBe("Unassessed");
  });
});

describe("from-above lines", () => {
  it("are exported but excluded from the scene's No. and the day total", () => {
    const sc = scene({
      saChars: [
        { name: "Pub Crowd", count: 25 },
        { name: "Pub Crowd", count: 0, contRef: "(FROM ABOVE)" },
      ],
    });
    expect(sceneHeadCount(sc)).toBe(25);
    const doc = project(model([day([sc])]));
    const total = doc.sheets[0].rows.find((r) => r.kind === "totals")!;
    expect(total.cells[3].v).toBe(25);
    // ...and the line is still visible, marked
    const fa = doc.sheets[0].rows.filter((r) => r.meta?.fromAbove);
    expect(fa.length).toBeGreaterThan(0);
    expect(fa[0].cells[3].v).toBeNull(); // no count, not a zero
  });
});

describe("reference-scope rows", () => {
  it("export in their own column but never enter the head count", () => {
    const sc = scene({
      saChars: [{ name: "Prisoners", count: 20 }],
      extras: [{ name: "Stunt Driver", count: 1, tier: "Stunt", budgetScope: "reference" }],
      children: [{ name: "School Kids", count: 12, tier: "Child" }],
      avs: [{ name: "Cars", count: 2, tier: "AV", unitType: "vehicle" }],
    });
    expect(sceneHeadCount(sc)).toBe(20);
    const doc = project(model([day([sc])]));
    const refRows = doc.sheets[0].rows.filter((r) => r.meta?.reference);
    expect(refRows).toHaveLength(3); // stunt + child + AV all present
    // each is tagged in the Stunts / Other column
    expect(refRows.map((r) => String(r.cells[6].v))).toEqual(
      expect.arrayContaining(["Stunt 1", "Child 12", "AV 2"])
    );
    // and the day total counts only the 20
    expect(doc.sheets[0].rows.find((r) => r.kind === "totals")!.cells[3].v).toBe(20);
  });
});

describe("reconciliation pills — derived always wins", () => {
  it("shows '= declared N' when they agree", () => {
    const m = model([
      day([scene({ saChars: [{ name: "Crowd", count: 14 }] })], {
        declaredTotals: { SA: 14 },
      }),
    ]);
    const t = rowsOf(m, "totals")[0];
    expect(t.cells[3].v).toBe(14);
    expect(t.cells[4].v).toBe("= declared 14");
  });

  it("shows the delta, signed, when they disagree — and never pads the derived figure", () => {
    const m = model([
      day([scene({ saChars: [{ name: "Crowd", count: 12 }] })], {
        declaredTotals: { SA: 15 },
      }),
    ]);
    const t = rowsOf(m, "totals")[0];
    expect(t.cells[3].v).toBe(12); // derived wins
    expect(t.cells[4].v).toBe("declared 15 · Δ -3");
    expect(t.cells[4].meta?.delta).toBe(-3);
  });

  it("is silent when the source declared nothing", () => {
    const m = model([day([scene({ saChars: [{ name: "Crowd", count: 12 }] })])]);
    expect(rowsOf(m, "totals")[0].cells[4].v).toBe("");
  });
});

describe("structural SUMs", () => {
  it("a day total carries a SUM over exactly that day's requirement rows", () => {
    const doc = project(
      model([day([scene({ saChars: [{ name: "A", count: 3 }, { name: "B", count: 4 }] })])])
    );
    const sheet = doc.sheets[0];
    const total = sheet.rows.find((r) => r.kind === "totals")!;
    const sum = total.cells[3].sum!;
    expect(sum).toBeDefined();
    const covered = sheet.rows.filter((r) => r.row >= sum.fromRow && r.row <= sum.toRow);
    // the range covers this day's scene/requirement rows and stops before totals
    expect(covered.every((r) => r.kind === "scene" || r.kind === "requirement")).toBe(true);
    expect(sum.toRow).toBe(total.row - 1);
  });
});

describe("TBC tier", () => {
  it("marks the row and costs it on the higher candidate tier", () => {
    const m = model([
      day([scene({ saChars: [{ name: "Lobby Mercs", count: 6, tierTbc: true }] })]),
    ]);
    const req = rowsOf(m, "requirement").find((r) => String(r.cells[4].v) === "Lobby Mercs")!;
    expect(req.cells[4].meta?.tbc).toBe(true);
    expect(req.cells[4].meta?.tier).toBe("SPACT"); // resolved upward
    expect(String(req.cells[5].v)).toContain("TBC TIER");
  });
});

describe("cost column", () => {
  it("is omitted unless asked for, and exports money as a value not a formula", () => {
    const m = model([day([scene({ saChars: [{ name: "Crowd", count: 10 }] })])]);
    expect(project(m).sheets[0].columns).not.toContain("Day cost");
    const withCost = project(m, { withCost: true });
    expect(withCost.sheets[0].columns).toContain("Day cost");
    const t = withCost.sheets[0].rows.find((r) => r.kind === "totals")!;
    const money = t.cells[t.cells.length - 1];
    expect(money.t).toBe("currency");
    expect(typeof money.v).toBe("number");
    expect(money.sum).toBeUndefined(); // rate logic is never a formula
  });

  it("states in the sheet that costs are values", () => {
    const m = model([day([scene({ saChars: [{ name: "Crowd", count: 10 }] })])]);
    const notes = project(m, { withCost: true })
      .sheets[0].rows.filter((r) => r.kind === "note")
      .map((r) => String(r.cells[0].v))
      .join(" ");
    expect(notes).toContain("edit counts freely");
    expect(notes).toContain("PACT/FAA 2026");
  });
});
