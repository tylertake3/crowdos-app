import { describe, it, expect } from "vitest";
import {
  projectCrowdDoc,
  cbToSheet,
  cbToStyledSheet,
  cbSceneLines,
  cbUnitLabel,
  cbDayLabel,
  CB_COLUMNS,
  type CbScene,
  type CbTotalRow,
} from "../lib/engine/breakdown-doc";
import type { ScheduleModel, Scene, ShootDay } from "../lib/engine/types";

const scene = (o: Partial<Scene>): Scene => ({
  num: "1",
  part: "",
  ie: "INT",
  slug: "",
  tod: "",
  scriptDay: "",
  pages: "",
  unit: "Main",
  desc: "",
  sa: 0,
  veh: 0,
  pod: false,
  cast: [],
  tags: [],
  ...o,
});

const day = (o: Partial<ShootDay>): ShootDay => ({
  num: 1,
  date: "Monday June 22",
  sr: "",
  ss: "",
  loc: "Langlebury",
  hours: "08:00 - 18:00",
  type: "",
  cams: "",
  scenes: [],
  pages: "",
  unit: "Main",
  id: "M1",
  _date: new Date(2026, 5, 22),
  ...o,
});

const model = (days: ShootDay[]): ScheduleModel =>
  ({ days, multiUnit: false }) as unknown as ScheduleModel;

describe("crowd breakdown document", () => {
  it("uses the locked column set", () => {
    expect([...CB_COLUMNS]).toEqual([
      "SCENE",
      "SCENE DESCRIPTION",
      "DAY",
      "NO.",
      "CROWD CHARACTER",
      "NOTES/CONTINUITY",
      "NO.",
      "STUNTS/OTHER",
    ]);
  });

  it("labels the day and unit bands the way the documents print them", () => {
    const d = day({ type: "SCWD", num: 4 });
    expect(cbDayLabel(d)).toBe("Monday June 22");
    expect(cbUnitLabel(d)).toBe("MAIN UNIT  LANGLEBURY  08:00 - 18:00  SCWD");
  });

  it("splits crowd lines from reference (stunts/other) lines", () => {
    const sc = scene({
      sa: 22,
      saChars: [{ name: "US Troops", count: 6 }],
      featured: [{ name: "General Bradley", count: 1 }],
      spacts: [{ name: "US Camera Man", count: 1 }],
      children: [{ name: "Village Child", count: 2 }],
      avs: [{ name: "AV Cars (Action)", count: 2 }],
    });
    const { crowd, other } = cbSceneLines(sc);
    expect(crowd.map((l) => l.name)).toEqual([
      "SA's",
      "US Troops",
      "General Bradley",
      "US Camera Man",
    ]);
    expect(other.map((l) => l.name)).toEqual(["Village Child", "AV Cars (Action)"]);
  });

  it("prints a from-above line but never counts it again", () => {
    // POP sc 16 PT 2: two carried groups plus one genuinely new mechanic.
    // Only the mechanic is a booking.
    const doc = projectCrowdDoc(
      model([
        day({
          scenes: [
            scene({ num: "16", part: "1", saChars: [{ name: "US Soldiers", count: 6 }] }),
            scene({
              num: "16",
              part: "2",
              saChars: [{ name: "US Soldiers", count: 6, flags: ["asAbove"] }],
              spacts: [{ name: "US Army Mechanic", count: 1 }],
            }),
          ],
        }),
      ])
    );
    const scenes = doc.rows.filter((r) => r.kind === "scene") as CbScene[];
    expect(scenes[1].crowd[0].name).toBe("US Soldiers (FROM ABOVE)");
    expect(scenes[1].crowd[0].fromAbove).toBe(true);
    expect(scenes[1].crowd[1].fromAbove).toBe(false);
    // 6 new + (6 carried, not counted) + 1 new
    expect(doc.totals.crowd).toBe(7);
  });

  it("prints a whole-scene inheritance as its own line", () => {
    const doc = projectCrowdDoc(
      model([day({ scenes: [scene({ num: "54B", contFromRef: "(from above - redressed)" })] })])
    );
    const sc = doc.rows.find((r) => r.kind === "scene") as CbScene;
    expect(sc.crowd).toHaveLength(1);
    expect(sc.crowd[0].name).toBe("(FROM ABOVE - REDRESSED)");
    expect(sc.crowd[0].no).toBeNull();
    expect(doc.totals.crowd).toBe(0);
  });

  // The bug this pins: the same 150 SA appearing in three scenes of one day is
  // 150 people called once, not 450.
  it("pools the same crowd across a day instead of summing it", () => {
    const doc = projectCrowdDoc(
      model([
        day({
          scenes: [
            scene({ num: "1", sa: 150 }),
            scene({ num: "2", sa: 150 }),
            scene({ num: "3", sa: 150 }),
          ],
        }),
      ])
    );
    const total = doc.rows.find((r) => r.kind === "dayTotal") as CbTotalRow;
    expect(total.no).toBe(150);
    expect(doc.totals.crowd).toBe(150);
  });

  it("pools each named group separately and takes its peak", () => {
    const doc = projectCrowdDoc(
      model([
        day({
          scenes: [
            scene({ num: "1", saChars: [{ name: "Police", count: 5 }] }),
            // same group, bigger scene — the day books the peak, not 5 + 12
            scene({ num: "2", saChars: [{ name: "police", count: 12 }] }),
            // a genuinely different group still adds
            scene({ num: "3", saChars: [{ name: "Nurses", count: 3 }] }),
          ],
        }),
      ])
    );
    const total = doc.rows.find((r) => r.kind === "dayTotal") as CbTotalRow;
    expect(total.no).toBe(15);
  });

  it("pools anonymous SA separately from named groups", () => {
    const doc = projectCrowdDoc(
      model([
        day({
          scenes: [
            scene({ num: "1", sa: 48, saChars: [{ name: "police", count: 5 }] }),
            scene({ num: "2", sa: 48, saChars: [{ name: "police", count: 5 }] }),
          ],
        }),
      ])
    );
    const total = doc.rows.find((r) => r.kind === "dayTotal") as CbTotalRow;
    expect(total.no).toBe(53);
  });

  it("pools stunts and other the same way", () => {
    const doc = projectCrowdDoc(
      model([
        day({
          scenes: [
            scene({ num: "1", extras: [{ name: "Stunts", count: 6 }] }),
            scene({ num: "2", extras: [{ name: "Stunts", count: 6 }] }),
          ],
        }),
      ])
    );
    const total = doc.rows.find((r) => r.kind === "dayTotal") as CbTotalRow;
    expect(total.otherNo).toBe(6);
  });

  it("still adds day to day — a group called twice is two bookings", () => {
    const doc = projectCrowdDoc(
      model([
        day({ num: 1, scenes: [scene({ sa: 150 }), scene({ num: "2", sa: 150 })] }),
        day({
          num: 2,
          date: "Tuesday June 23",
          _date: new Date(2026, 5, 23),
          id: "M2",
          scenes: [scene({ sa: 150 })],
        }),
      ])
    );
    const totals = doc.rows.filter((r) => r.kind === "dayTotal") as CbTotalRow[];
    expect(totals.map((t) => t.no)).toEqual([150, 150]);
    expect(doc.totals.crowd).toBe(300);
  });

  it("totals per day, per week and overall", () => {
    const doc = projectCrowdDoc(
      model([
        day({ num: 1, scenes: [scene({ sa: 10 })] }),
        day({
          num: 2,
          date: "Tuesday June 23",
          _date: new Date(2026, 5, 23),
          id: "M2",
          scenes: [scene({ num: "2", saChars: [{ name: "Guards", count: 5 }] })],
        }),
      ])
    );
    const totals = doc.rows.filter((r) => r.kind === "dayTotal") as CbTotalRow[];
    expect(totals.map((t) => t.no)).toEqual([10, 5]);
    expect(totals[0].label).toBe("MAIN UNIT TOTAL");
    const week = doc.rows.find((r) => r.kind === "weekTotal") as CbTotalRow;
    expect(week.no).toBe(15);
    expect(doc.totals.crowd).toBe(15);
  });

  it("distinguishes confirmed N/A from unassessed", () => {
    const doc = projectCrowdDoc(
      model([
        day({
          scenes: [
            scene({ num: "1", reqStatus: "none" }),
            scene({ num: "2" }),
            scene({ num: "3", sa: 4 }),
          ],
        }),
      ])
    );
    expect(doc.totals).toMatchObject({
      crowded: 1,
      confirmedNone: 1,
      unassessed: 1,
      pctAssessed: 67,
    });
  });

  it("hides empty scenes on request", () => {
    const m = model([day({ scenes: [scene({ num: "1" }), scene({ num: "2", sa: 3 })] })]);
    const shown = projectCrowdDoc(m, { hideEmpty: true });
    expect((shown.rows.filter((r) => r.kind === "scene") as CbScene[]).map((s) => s.num)).toEqual(["2"]);
  });

  it("drops the stunts/other columns when switched off", () => {
    const doc = projectCrowdDoc(model([day({ scenes: [scene({ sa: 2 })] })]), {
      includeOther: false,
    });
    expect(doc.columns).toHaveLength(6);
  });

  it("titles the document the way the reference document does", () => {
    const doc = projectCrowdDoc(model([]), {
      production: "The Price of Peace",
      breakdownDate: "20/6/26",
      scheduleDate: "18/6/26",
    });
    expect(doc.title).toBe("The Price of Peace");
    expect(doc.subtitle).toBe(
      "CROWD BREAKDOWN 20/6/26 BASED ON SHOOTING SCHEDULE 18/6/26 & NOTES"
    );
  });

  it("flattens to a sheet whose rows match the printed grid", () => {
    const doc = projectCrowdDoc(
      model([
        day({
          scenes: [
            scene({
              num: "113",
              slug: "German Air Defense Building, Berlin",
              ie: "EXT",
              scriptDay: "DAY 5",
              pages: "2 2/8",
              saChars: [
                { name: "US Troops", count: 22 },
                { name: "US Officers", count: 2 },
              ],
            }),
          ],
        }),
      ]),
      { production: "POP", breakdownDate: "20/6/26" }
    );
    const sheet = cbToSheet(doc);
    expect(sheet.rows[0][0]).toBe("POP");
    expect(sheet.rows[3]).toEqual([...CB_COLUMNS]);
    const body = sheet.rows.filter((r) => r[4] === "US Troops" || r[4] === "US Officers");
    expect(body).toHaveLength(2);
    expect(body[0][3]).toBe("22");
    // scene cells print once, on the first line of the block
    expect(body[1][0]).toBe("");
    expect(body[1][1]).toBe("");
    expect(sheet.rows.every((r) => r.length === doc.columns.length)).toBe(true);
  });

  describe("styled workbook projection", () => {
    const m = model([
      day({
        scenes: [
          scene({
            num: "113",
            ie: "EXT",
            slug: "German Air Defense Building",
            scriptDay: "5",
            tod: "DAY",
            pages: "2 2/8",
            saChars: [
              { name: "US Troops", count: 22 },
              { name: "US Officers", count: 2 },
            ],
            extras: [{ name: "Stunts", count: 6 }],
          }),
        ],
      }),
    ]);

    it("keeps every row the width of the column set", () => {
      const sh = cbToStyledSheet(projectCrowdDoc(m));
      expect(sh.columns).toHaveLength(8);
      expect(sh.rows.every((r) => r.cells.length === 8)).toBe(true);
      expect(sh.widths).toHaveLength(8);
    });

    it("merges the scene, description and day cells down the block", () => {
      const sh = cbToStyledSheet(projectCrowdDoc(m));
      const sceneRows = sh.rows.filter((r) => r.kind === "scene");
      expect(sceneRows).toHaveLength(2);
      // one merge per merged column, each spanning both requirement rows
      expect(sh.merges.map((x) => x.col).sort()).toEqual([0, 1, 2]);
      for (const mg of sh.merges) expect(mg.to - mg.from).toBe(1);
      // scene cells print once, on the first line
      expect(sceneRows[1].cells.slice(0, 3)).toEqual([null, null, null]);
    });

    it("writes counts as real numbers so Excel can total them", () => {
      const sh = cbToStyledSheet(projectCrowdDoc(m));
      const troops = sh.rows.find((r) => r.cells[4] === "US Troops")!;
      expect(troops.cells[3]).toBe(22);
      expect(typeof troops.cells[3]).toBe("number");
      const total = sh.rows.find((r) => r.kind === "dayTotal")!;
      expect(total.cells[3]).toBe(24);
      expect(total.cells[6]).toBe(6);
    });

    it("makes week and overall totals live formulas that sum the day totals", () => {
      const sh = cbToStyledSheet(projectCrowdDoc(m));
      const rowNo = (kind: string) => sh.rows.findIndex((r) => r.kind === kind) + 1;
      const dayNo = rowNo("dayTotal");
      const weekNo = rowNo("weekTotal");

      // a day total stays a literal value — a day's booking is a pooled peak
      // across its scenes, not a plain sum of the rows above it
      const dayTotal = sh.rows.find((r) => r.kind === "dayTotal")!;
      expect(typeof dayTotal.cells[3]).toBe("number");

      // the week total is a live formula summing its day totals
      const weekTotal = sh.rows.find((r) => r.kind === "weekTotal")!;
      expect(weekTotal.cells[3]).toEqual({ formula: `D${dayNo}`, result: 24 });
      expect(weekTotal.cells[6]).toEqual({ formula: `G${dayNo}`, result: 6 });

      // the breakdown total is a live formula summing the week totals
      const grandTotal = sh.rows.find((r) => r.kind === "grandTotal")!;
      expect(grandTotal.cells[3]).toEqual({ formula: `D${weekNo}`, result: 24 });
      expect(grandTotal.cells[6]).toEqual({ formula: `G${weekNo}`, result: 6 });
    });

    it("marks bands full-width and puts the headings on a frozen row", () => {
      const sh = cbToStyledSheet(projectCrowdDoc(m));
      expect(sh.rows[sh.headerRow - 1].kind).toBe("header");
      expect(sh.rows[sh.headerRow - 1].cells).toEqual([...CB_COLUMNS]);
      expect(sh.rows.filter((r) => r.kind === "unit").every((r) => r.full)).toBe(true);
      expect(sh.rows.find((r) => r.kind === "title")!.full).toBe(true);
    });

    it("flags carried and unassessed lines for the writer to style", () => {
      const sh = cbToStyledSheet(
        projectCrowdDoc(
          model([
            day({
              scenes: [
                scene({ num: "1" }),
                scene({ num: "2", saChars: [{ name: "Guards", count: 4, flags: ["asAbove"] }] }),
              ],
            }),
          ])
        )
      );
      expect(sh.rows.find((r) => r.pending)!.cells[4]).toBe("Not yet assessed");
      const carried = sh.rows.find((r) => r.fromAbove)!;
      expect(carried.cells[3]).toBeNull();
      expect(carried.cells[4]).toBe("Guards (FROM ABOVE)");
    });

    it("narrows to six columns when stunts/other is switched off", () => {
      const sh = cbToStyledSheet(projectCrowdDoc(m, { includeOther: false }));
      expect(sh.columns).toHaveLength(6);
      expect(sh.rows.every((r) => r.cells.length === 6)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Fees & costs. The circulated document carries no money at all unless it is
  // explicitly asked for, and when it is, the figures are the cost engine's —
  // never re-derived here.
  // -------------------------------------------------------------------------
  describe("fees and costs", () => {
    const feeDay = () =>
      day({
        scenes: [
          scene({ num: "1", saChars: [{ name: "Nurses", count: 10, sup: 23 }] }),
          // the same nurses again later in the day — one booking, one fee
          scene({ num: "2", saChars: [{ name: "Nurses", count: 10, sup: 23 }] }),
          scene({ num: "3", spacts: [{ name: "Barman", count: 2 }] }),
        ],
      });
    const withCosts = () =>
      projectCrowdDoc(model([feeDay()]), {
        costs: true,
        perHead: (_id, tier) => (tier === "SPACT" ? 300 : 130),
        dayCost: () => 2_000,
      });

    it("carries no money at all by default", () => {
      const doc = projectCrowdDoc(model([feeDay()]));
      expect(doc.costs).toBe(false);
      expect(doc.columns).toHaveLength(8);
      expect(doc.columns).not.toContain("COST");
      const scenes = doc.rows.filter((r) => r.kind === "scene") as CbScene[];
      expect(scenes.every((s) => s.cost === 0)).toBe(true);
      expect(doc.totals.cost).toBe(0);
    });

    it("appends the money columns only when asked", () => {
      const doc = withCosts();
      expect(doc.costs).toBe(true);
      expect(doc.columns.slice(-2)).toEqual(["FEES", "COST"]);
      // the document's own columns keep their positions
      expect(doc.columns.slice(0, 8)).toEqual([...CB_COLUMNS]);
    });

    it("costs a line at heads × (day rate + its fee)", () => {
      const doc = withCosts();
      const scenes = doc.rows.filter((r) => r.kind === "scene") as CbScene[];
      expect(scenes[0].crowd[0].cost).toBe(10 * (130 + 23));
      expect(scenes[2].crowd[0].cost).toBe(2 * 300);
    });

    it("pays a group's fee once a day, however many scenes it appears in", () => {
      const total = withCosts().rows.find((r) => r.kind === "dayTotal") as CbTotalRow;
      expect(total.fees).toBe(10 * 23); // not 2 × that
    });

    it("takes the day total from the cost engine, not from the lines", () => {
      const doc = withCosts();
      const total = doc.rows.find((r) => r.kind === "dayTotal") as CbTotalRow;
      expect(total.cost).toBe(2_000);
      expect(doc.totals.cost).toBe(2_000);
    });

    it("never charges a carried line", () => {
      const doc = projectCrowdDoc(
        model([
          day({
            scenes: [
              scene({ num: "1", saChars: [{ name: "Guards", count: 4, sup: 23 }] }),
              scene({
                num: "2",
                saChars: [{ name: "Guards", count: 4, sup: 23, flags: ["asAbove"] }],
              }),
            ],
          }),
        ]),
        { costs: true, perHead: () => 130, dayCost: () => 1_000 }
      );
      const scenes = doc.rows.filter((r) => r.kind === "scene") as CbScene[];
      expect(scenes[1].crowd[0].cost).toBe(0);
      expect(doc.totals.fees).toBe(4 * 23);
    });

    it("writes the money columns into the sheet, with live week totals", () => {
      const sh = cbToStyledSheet(withCosts());
      expect(sh.columns.slice(-2)).toEqual(["FEES", "COST"]);
      expect(sh.rows.every((r) => r.cells.length === 10)).toBe(true);
      expect(sh.widths).toHaveLength(10);
      const dayTotal = sh.rows.find((r) => r.kind === "dayTotal")!;
      expect(dayTotal.cells[9]).toBe(2_000); // literal — a day is not a sum
      const weekTotal = sh.rows.find((r) => r.kind === "weekTotal")!;
      expect(weekTotal.cells[9]).toMatchObject({ result: 2_000 });
      expect((weekTotal.cells[9] as { formula: string }).formula).toMatch(/^J\d+$/);
    });

    it("keeps the money columns last when stunts/other is off", () => {
      const sh = cbToStyledSheet(
        projectCrowdDoc(model([feeDay()]), {
          includeOther: false,
          costs: true,
          perHead: () => 130,
          dayCost: () => 900,
        })
      );
      expect(sh.columns).toEqual([
        "SCENE",
        "SCENE DESCRIPTION",
        "DAY",
        "NO.",
        "CROWD CHARACTER",
        "NOTES/CONTINUITY",
        "FEES",
        "COST",
      ]);
      expect(sh.rows.every((r) => r.cells.length === 8)).toBe(true);
    });

    it("flattens fees and costs into the csv projection", () => {
      const rows = cbToSheet(withCosts()).rows;
      expect(rows[3].slice(-2)).toEqual(["FEES", "COST"]);
      const line = rows.find((r) => r[4] === "Nurses")!;
      expect(line[8]).toBe("230.00");
      expect(line[9]).toBe("1530.00");
    });
  });

  // -------------------------------------------------------------------------
  // Column layout — the builder reorders the segments and the whole document
  // (screen / .xlsx / .csv) follows, with merges and total formulas tracking
  // wherever each column lands.
  // -------------------------------------------------------------------------
  describe("column layout / reordering", () => {
    const m = () =>
      model([
        day({
          scenes: [
            scene({
              num: "113",
              ie: "EXT",
              slug: "Berlin",
              tod: "DAY",
              scriptDay: "5",
              saChars: [
                { name: "US Troops", count: 22 },
                { name: "US Officers", count: 2 },
              ],
              extras: [{ name: "Stunts", count: 6 }],
            }),
          ],
        }),
      ]);

    it("orders the columns as requested", () => {
      const doc = projectCrowdDoc(m(), { order: ["desc", "scene", "day", "crowd", "other"] });
      expect(doc.columns.slice(0, 3)).toEqual(["SCENE DESCRIPTION", "SCENE", "DAY"]);
    });

    it("ignores unknown segments and completes a partial order", () => {
      const doc = projectCrowdDoc(m(), {
        order: ["desc", "bogus" as unknown as "scene"],
        includeOther: false,
      });
      // desc first, then the remaining known segments in canonical order
      expect(doc.columns).toEqual([
        "SCENE DESCRIPTION",
        "SCENE",
        "DAY",
        "NO.",
        "CROWD CHARACTER",
        "NOTES/CONTINUITY",
      ]);
    });

    it("hides the notes column when asked", () => {
      const doc = projectCrowdDoc(m(), { notes: false, includeOther: false });
      expect(doc.columns).toEqual(["SCENE", "SCENE DESCRIPTION", "DAY", "NO.", "CROWD CHARACTER"]);
    });

    it("keeps the number beside its name after reordering", () => {
      const doc = projectCrowdDoc(m(), { order: ["desc", "scene", "day", "crowd"] });
      const noIdx = doc.layout.findIndex((c) => c.role === "crowdNo");
      expect(doc.layout[noIdx + 1].role).toBe("crowdName");
    });

    it("moves the scene-block merges to follow the reordered columns", () => {
      // description first → the merged block columns are now at 0,1,2 in the
      // new order (desc, scene, day) and the crowd cells start at 3
      const sh = cbToStyledSheet(projectCrowdDoc(m(), { order: ["desc", "scene", "day", "crowd", "other"] }));
      const descIdx = sh.layout.findIndex((c) => c.role === "desc");
      const sceneIdx = sh.layout.findIndex((c) => c.role === "sceneNum");
      expect(sh.merges.map((x) => x.col).sort((a, b) => a - b)).toEqual(
        sh.layout.map((c, i) => (c.block ? i : -1)).filter((i) => i >= 0)
      );
      const troops = sh.rows.find(
        (r) => r.cells.find((v) => v === "US Troops") !== undefined
      )!;
      // the description cell holds the slug/desc, the scene cell holds "113"
      expect(troops.cells[sceneIdx]).toContain("113");
      expect(String(troops.cells[descIdx]).toLowerCase()).toContain("berlin");
    });

    it("recomputes total formulas from the reordered count columns", () => {
      // put FEES/COST and STUNTS/OTHER before the crowd columns
      const sh = cbToStyledSheet(
        projectCrowdDoc(m(), {
          order: ["scene", "desc", "day", "cost", "other", "crowd"],
          costs: true,
          perHead: () => 100,
          dayCost: () => 500,
        })
      );
      const crowdIdx = sh.layout.findIndex((c) => c.role === "crowdNo");
      const crowdCol = String.fromCharCode(65 + crowdIdx);
      const dayNo = sh.rows.findIndex((r) => r.kind === "dayTotal") + 1;
      const weekTotal = sh.rows.find((r) => r.kind === "weekTotal")!;
      // week total sums the day total from whatever column the crowd NO. now sits in
      expect(weekTotal.cells[crowdIdx]).toEqual({ formula: `${crowdCol}${dayNo}`, result: 24 });
    });

    it("merges the No. and Crowd character columns into one", () => {
      const doc = projectCrowdDoc(m(), { mergeCrowd: true, includeOther: false });
      // one combined column instead of NO. + CROWD CHARACTER, notes still there
      expect(doc.columns).toEqual(["SCENE", "SCENE DESCRIPTION", "DAY", "CROWD CHARACTER", "NOTES/CONTINUITY"]);
      const combo = doc.layout.find((c) => c.role === "crowdCombo")!;
      expect(combo.count).toBe(true);
    });

    it("prints count-then-name in the merged cell but the number in the total", () => {
      const sh = cbToStyledSheet(projectCrowdDoc(m(), { mergeCrowd: true, includeOther: false }));
      const comboIdx = sh.layout.findIndex((c) => c.role === "crowdCombo");
      const troops = sh.rows.find((r) => String(r.cells[comboIdx]).includes("US Troops"))!;
      expect(troops.cells[comboIdx]).toBe("22 US Troops");
      const total = sh.rows.find((r) => r.kind === "dayTotal")!;
      // the total shows the pooled number (not text) in the same column
      expect(total.cells[comboIdx]).toBe(24);
    });

    it("keeps the week/overall total formulas working when merged", () => {
      const sh = cbToStyledSheet(projectCrowdDoc(m(), { mergeCrowd: true, includeOther: false }));
      const comboIdx = sh.layout.findIndex((c) => c.role === "crowdCombo");
      const comboCol = String.fromCharCode(65 + comboIdx);
      const dayNo = sh.rows.findIndex((r) => r.kind === "dayTotal") + 1;
      const weekTotal = sh.rows.find((r) => r.kind === "weekTotal")!;
      expect(weekTotal.cells[comboIdx]).toEqual({ formula: `${comboCol}${dayNo}`, result: 24 });
    });

    it("writes the merged column into the csv", () => {
      const rows = cbToSheet(projectCrowdDoc(m(), { mergeCrowd: true, includeOther: false })).rows;
      expect(rows[3]).toEqual(["SCENE", "SCENE DESCRIPTION", "DAY", "CROWD CHARACTER", "NOTES/CONTINUITY"]);
      const line = rows.find((r) => r.some((c) => c === "22 US Troops"))!;
      expect(line).toBeTruthy();
    });

    it("reorders the csv columns and keeps totals correct", () => {
      const rows = cbToSheet(
        projectCrowdDoc(m(), { order: ["desc", "scene", "day", "crowd", "other"] })
      ).rows;
      expect(rows[3].slice(0, 3)).toEqual(["SCENE DESCRIPTION", "SCENE", "DAY"]);
      const total = rows.find((r) => r.includes("MAIN UNIT TOTAL"))!;
      // the crowd count still reads 24 wherever the column landed
      expect(total).toContain("24");
    });
  });

  it("is deterministic — same model in, same document out", () => {
    const m = model([day({ scenes: [scene({ sa: 5, saChars: [{ name: "Nurses", count: 3 }] })] })]);
    expect(JSON.stringify(projectCrowdDoc(m))).toBe(JSON.stringify(projectCrowdDoc(m)));
  });
});
