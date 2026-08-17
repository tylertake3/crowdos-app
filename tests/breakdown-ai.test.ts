// Reading a crowd breakdown with AI.
//
// The point of these tests is that the AI read is held to the SAME standard as
// the table parser, in two specific ways:
//
//  1. THE MODEL IS TOLD THE TIERS, NOT ASKED TO GUESS THEM. What makes a row
//     crowd, a SPACT or a stunt is which column it was printed in, and what makes
//     it a child or an action vehicle is its colour. Both are resolved before the
//     model sees anything, and handed over as tags. A model given the flattened
//     page would be guessing at numbers that become somebody's budget.
//
//  2. WHAT COMES BACK IS CHECKED, NOT TRUSTED. The model's answer goes through the
//     same reconciliation against the document's own day totals that the parser's
//     does, and anything outside the app's own vocabulary is dropped rather than
//     coerced into something plausible.

import { describe, it, expect } from "vitest";
import { gridRows, pageRows, readLayout, type BdItem } from "../lib/engine/breakdown-grid";
import {
  COLUMN_TIERS,
  dayHeads,
  parseBreakdown,
  readColourLegend,
} from "../lib/engine/breakdown-parse";
import {
  breakdownFromAi,
  chunkTagged,
  compareBreakdowns,
  tagGrid,
  type AiDay,
} from "../lib/engine/breakdown-ai";

const X = { left: 28, scene: 87, ie: 101, sday: 115, slug: 125, desc: 247, crowd: 454, spact: 601, stunt: 740 };
const HDR = { ie: 100, d: 116, sday: 125, desc: 247, crowd: 436, spact: 583, stunt: 718 };
const BLACK = "#000000", WHITE = "#ffffff", ORANGE = "#ed7d31", PINK = "#ff40ff", GREEN = "#00b050";

let y = 500;
function row(cells: [number, string, string?][]): BdItem[] {
  y -= 12;
  return cells.map(([x, str, fill]) => ({ str, x, y, w: str.length * 2.2, fills: [fill || BLACK] }));
}

function fixturePage(): BdItem[] {
  y = 500;
  const out: BdItem[] = [];
  out.push(...row([[28, "CROWD BREAKDOWN"], [X.crowd, "A FILM"], [X.stunt, "17.08.2026"]]));
  out.push(...row([
    [HDR.ie, "I/E"], [HDR.d, "D"], [HDR.sday, "SHOOT DAY"], [HDR.desc, "LOCATION/HOURS/SCENE DESCRIPTION"],
    [HDR.crowd, "CROWD CHARACTERS/REQUIREMENTS"], [HDR.spact, "SPACTs CHARACTERS/REQUIREMENTS"], [HDR.stunt, "STUNT CHARACTERS/REQUIREMENTS"],
  ]));
  out.push(...row([[X.left, "SHOOT WEEK 1", WHITE]]));
  out.push(...row([[X.left, "Monday 7 September 2026", WHITE], [X.slug, "SHOOT DAY 1", WHITE], [X.desc, "AUDLEY END (0800 - 1830)", WHITE]]));
  out.push(...row([[X.scene, "Sc.43"], [X.ie, "INT"], [X.sday, "D4"], [X.slug, "HOSPITAL"], [X.desc, "Terry gives advice"], [X.crowd, "2 Hospital Nurses"], [X.spact, "3 Bride's Friends", PINK]]));
  out.push(...row([[X.crowd, "2 Young Cousins (age 9)", ORANGE]]));
  out.push(...row([[X.crowd, "3 Traffic Cars", GREEN]]));
  // an overflowing name whose carry marker lands in the SPACT column
  out.push(...row([[X.scene, "Sc.44"], [X.ie, "EXT"], [X.slug, "CAR PARK"], [X.crowd, "Hospital Nurses"], [X.spact, "(2x from above)"]]));
  out.push(...row([[X.crowd, "10 x SUPPORTING ARTISTS", WHITE], [X.spact, "3 xSPACTs (Special Action Extras)", WHITE], [X.stunt, "0 x STUNTS", WHITE]]));
  return out;
}

const DOC_LINES = [
  "COLOUR KEY: ORANGE - CHILDREN, GREEN - ACTION VEHICLES, FEATURED - PINK",
  "CROWD TOTALS: 10 x SUPPORTING ARTISTS 3 x SPACTs 0 x STUNTS",
];

// ── What the model is given ────────────────────────────────────────────────

describe("the tagged table handed to the model", () => {
  const tagged = () => tagGrid(pageRows(fixturePage())!.rows, readColourLegend(DOC_LINES));

  it("states the document's colour key up front", () => {
    expect(tagged()[0]).toBe("COLOURKEY: orange = children, green = action vehicles, pink = featured");
  });

  it("labels every line with what it is", () => {
    const t = tagged();
    expect(t.some((l) => l.startsWith("WEEK: SHOOT WEEK 1"))).toBe(true);
    expect(t.some((l) => l.startsWith("DAY: Monday 7 September 2026 | SHOOT DAY 1 | AUDLEY END (0800 - 1830)"))).toBe(true);
    expect(t.some((l) => l.startsWith("SCENE: Sc.43 | INT | D4 | HOSPITAL"))).toBe(true);
    expect(t.some((l) => l.startsWith("DAYTOTAL:"))).toBe(true);
  });

  // THE WHOLE REASON THE AI PATH GOES THROUGH THE GRID. Given the flattened page
  // these two are one string with no boundary in it, and the model has to guess
  // which of them is a SPACT.
  it("tells the model which column each requirement was printed in", () => {
    const t = tagged();
    expect(t).toContain("CROWD: 2 Hospital Nurses");
    expect(t).toContain("SPACT[pink]: 3 Bride's Friends");
  });

  it("names a colour only where the colour is a statement", () => {
    const t = tagged();
    expect(t).toContain("CROWD[orange]: 2 Young Cousins (age 9)");
    expect(t).toContain("CROWD[green]: 3 Traffic Cars");
    // ...and not on ordinary black rows, nor on the white text of a banner.
    expect(t).toContain("CROWD: 2 Hospital Nurses");
    expect(t.filter((l) => /\[(black|white)\]/.test(l))).toEqual([]);
  });

  it("says when a colour is not in the document's key", () => {
    const t = tagGrid(pageRows(fixturePage())!.rows, null);
    expect(t.some((l) => l.includes("[orange — not in the key]"))).toBe(true);
  });

  // Handing a model a line labelled SPACT that is really a crowd group's tail and
  // hoping it notices is not a plan.
  it("stitches an overflowing group back before the model sees it", () => {
    const t = tagged();
    expect(t).toContain("CROWD: Hospital Nurses (2x from above)");
    expect(t.some((l) => l === "SPACT: (2x from above)")).toBe(false);
  });

  it("keeps the running head's date out of the stunt column", () => {
    expect(tagged().some((l) => l.includes("17.08.2026"))).toBe(false);
  });
});

describe("splitting a long breakdown for the reader", () => {
  const mk = (days: number) => {
    const out = ["COLOURKEY: orange = children"];
    for (let d = 0; d < days; d++) {
      out.push(`DAY: Day ${d + 1} | SHOOT DAY ${d + 1}`);
      for (let s = 0; s < 20; s++) { out.push(`SCENE: Sc.${d}${s}`); out.push("CROWD: 4 Passersby"); }
      out.push("DAYTOTAL: 80 x SUPPORTING ARTISTS");
    }
    return out;
  };

  it("cuts only between days, never inside one", () => {
    const pieces = chunkTagged(mk(10), 100);
    expect(pieces.length).toBeGreaterThan(1);
    for (const p of pieces) {
      const lines = p.split("\n").filter((l) => !l.startsWith("COLOURKEY:"));
      // A piece begins at a day (or week) boundary...
      expect(lines[0].startsWith("DAY:")).toBe(true);
      // ...and every day in it carries its own footer, or the reconciliation on
      // that day would be comparing half a day against a whole day's total.
      expect(lines.filter((l) => l.startsWith("DAY:")).length)
        .toBe(lines.filter((l) => l.startsWith("DAYTOTAL:")).length);
    }
  });

  it("repeats the colour key on every piece", () => {
    for (const p of chunkTagged(mk(10), 100)) expect(p.startsWith("COLOURKEY:")).toBe(true);
  });

  it("would rather send one over-long day than cut it in half", () => {
    const one = ["DAY: Day 1 | SHOOT DAY 1", ...Array.from({ length: 400 }, () => "CROWD: 4 Passersby")];
    expect(chunkTagged(one, 50)).toHaveLength(1);
  });

  it("leaves a short breakdown as one piece", () => {
    expect(chunkTagged(mk(1), 260)).toHaveLength(1);
  });
});

// ── What comes back ────────────────────────────────────────────────────────

const AI_DAY = (over: Partial<AiDay> = {}): AiDay => ({
  num: 1,
  date: "Monday 7 September 2026",
  role: "SHOOT DAY 1",
  loc: "AUDLEY END",
  hours: "0800 - 1830",
  rest: false,
  phase: "shoot",
  unitKind: "main",
  totals: [{ category: "crowd", count: 10 }, { category: "SPACT", count: 3 }, { category: "stunt", count: 0 }],
  scenes: [
    {
      num: "43", part: "", ie: "INT", scriptDay: "D4", slug: "HOSPITAL", desc: "Terry gives advice", contFromRef: "",
      unreadable: [],
      reqs: [
        { name: "Hospital Nurses", count: 2, tier: "SA", fromAbove: false, colourUnexplained: false, note: "" },
        { name: "Young Cousins (age 9)", count: 2, tier: "Child", fromAbove: false, colourUnexplained: false, note: "" },
        { name: "Traffic Cars", count: 3, tier: "AV", fromAbove: false, colourUnexplained: false, note: "" },
        { name: "Bride's Friends", count: 3, tier: "SPACT", fromAbove: false, colourUnexplained: false, note: "" },
      ],
    },
    {
      num: "44", part: "", ie: "EXT", scriptDay: "", slug: "CAR PARK", desc: "", contFromRef: "", unreadable: [],
      reqs: [{ name: "Hospital Nurses", count: 2, tier: "SA", fromAbove: true, colourUnexplained: false, note: "" }],
    },
  ],
  ...over,
});

describe("turning the model's answer into a schedule", () => {
  const build = (days: AiDay[]) => breakdownFromAi(days, { lines: DOC_LINES, legend: readColourLegend(DOC_LINES) });

  it("files each row on the tier the model returned", () => {
    const r = build([AI_DAY()]);
    const s = r.model.days[0].scenes[0];
    expect(s.saChars!.map((x) => x.name)).toEqual(["Hospital Nurses"]);
    expect(s.children!.map((x) => x.count)).toEqual([2]);
    expect(s.avs!.map((x) => x.name)).toEqual(["Traffic Cars"]);
    expect(s.spacts!.map((x) => x.count)).toEqual([3]);
  });

  it("keeps children, action vehicles and stunts out of the crowd budget", () => {
    const s = build([AI_DAY()]).model.days[0].scenes[0];
    expect(s.children![0].budgetScope).toBe("reference");
    expect(s.avs![0].budgetScope).toBe("reference");
    expect(s.avs![0].unitType).toBe("vehicle");
    expect(s.saChars![0].budgetScope).toBe("crowd");
  });

  it("marks the whole read as coming from a breakdown import", () => {
    const r = build([AI_DAY()]);
    expect(r.model.source).toBe("breakdown_import");
    expect(r.readBy).toBe("ai");
    expect(r.model.days[0].scenes[0].saChars![0].source).toBe("breakdown_import");
  });

  // THE CHECK THAT MAKES AN AI READ WORTH OFFERING. The AD's own arithmetic is an
  // external test of whether the model read the document correctly, and it is
  // applied to the AI exactly as it is to the parser.
  it("reconciles the model's reading against the document's own day totals", () => {
    const r = build([AI_DAY()]);
    expect(dayHeads(r.model.days[0], COLUMN_TIERS.SA)).toBe(7); // 2 nurses + 2 children + 3 vehicles
    expect(r.mismatches.map((m) => `${m.category} ${m.printed}/${m.derived}`)).toEqual(["crowd 10/7"]);
    expect(r.warnings.join(" ")).toMatch(/do not match/);
  });

  it("says so when the model's reading DOES match", () => {
    const day = AI_DAY({ totals: [{ category: "crowd", count: 7 }, { category: "SPACT", count: 3 }] });
    const r = build([day]);
    expect(r.mismatches).toEqual([]);
    expect(r.warnings.join(" ")).toMatch(/Checked against the document's own arithmetic/);
  });

  it("counts a row marked as carried over as nobody new", () => {
    const r = build([AI_DAY()]);
    // Scene 44's nurses are the same two from scene 43.
    expect(r.model.days[0].scenes[1].saChars![0].flags).toContain("asAbove");
    expect(dayHeads(r.model.days[0], ["SA"])).toBe(2);
  });

  it("warns when there is nothing to check the model against", () => {
    const r = build([AI_DAY({ totals: [] })]);
    expect(r.warnings.join(" ")).toMatch(/prints no day totals, so there is nothing to check/);
  });

  // Anything outside the app's own vocabulary is a thing the model made up. The
  // honest response is to leave it out and let the reconciliation notice, not to
  // coerce it into whatever looks closest.
  it("drops a row on a tier that does not exist rather than guessing one", () => {
    const day = AI_DAY();
    day.scenes![0].reqs!.push({ name: "Mystery", count: 5, tier: "Crowd???", fromAbove: false, colourUnexplained: false, note: "" });
    const r = build([day]);
    expect(JSON.stringify(r.model)).not.toContain("Mystery");
    expect(r.warnings.join(" ")).toMatch(/shape we do not accept/);
  });

  it("drops a negative or nonsense count", () => {
    const day = AI_DAY();
    day.scenes![0].reqs = [{ name: "Ghosts", count: -4, tier: "SA", fromAbove: false, colourUnexplained: false, note: "" }];
    const r = build([day]);
    expect(JSON.stringify(r.model)).not.toContain("Ghosts");
  });

  it("keeps a group of nobody as an unread cell rather than a booking", () => {
    const day = AI_DAY();
    day.scenes![0].reqs = [{ name: "Humanist Bride", count: 0, tier: "SPACT", fromAbove: false, colourUnexplained: false, note: "" }];
    const r = build([day]);
    expect(r.model.days[0].scenes[0].spacts).toHaveLength(0);
    expect(r.unparsed.map((u) => u.text)).toContain("Humanist Bride");
  });

  it("passes an unexplained colour through as needing a decision", () => {
    const day = AI_DAY();
    day.scenes![0].reqs = [{ name: "Mystery Group", count: 4, tier: "SA", fromAbove: false, colourUnexplained: true, note: "" }];
    const r = build([day]);
    expect(r.model.days[0].scenes[0].saChars![0].tierTbc).toBe(true);
    expect(r.warnings.join(" ")).toMatch(/colour this document's key does not explain/);
  });

  it("keeps a rest day off the shoot but on the record", () => {
    const r = build([AI_DAY(), AI_DAY({ num: 0, date: "Saturday 12 September 2026", role: "REST DAY", rest: true, scenes: [] })]);
    expect(r.model.days).toHaveLength(1);
    expect(r.model.notes.some((n) => n.type === "rest" && /12 September/.test(n.text))).toBe(true);
  });

  it("gives a second unit on the same date the number of the day it shares", () => {
    const r = build([
      AI_DAY(),
      AI_DAY({ num: 0, role: "2ND UNIT / SPLINTER UNIT", unitKind: "splinter", scenes: [], totals: [] }),
    ]);
    expect(r.model.days[1]).toMatchObject({ num: 1, unitKind: "splinter" });
    expect(r.model.multiUnit).toBe(true);
  });

  it("does not give a travel day a shoot day's number", () => {
    const r = build([
      AI_DAY(),
      AI_DAY({ num: 0, date: "Monday 26 October 2026", role: "TRAVEL DAY", phase: "prep", scenes: [], totals: [] }),
    ]);
    expect(r.model.days[1]).toMatchObject({ num: 0, phase: "prep" });
  });

  it("ignores a unit kind the app does not have", () => {
    const r = build([AI_DAY({ unitKind: "seventh unit" })]);
    expect(r.model.days[0].unitKind).toBe("main");
  });

  it("skips a day the model returned with no date at all", () => {
    expect(build([AI_DAY({ date: "" })]).model.days).toHaveLength(0);
  });

  it("survives a completely empty answer without inventing anything", () => {
    const r = build([]);
    expect(r.model.days).toEqual([]);
  });

  it("says plainly when the model had to work from the page text", () => {
    const r = breakdownFromAi([AI_DAY()], { lines: DOC_LINES, legend: null, taggedFallback: true });
    expect(r.warnings.join(" ")).toMatch(/columns could not be identified/);
    expect(r.warnings.join(" ")).toMatch(/check the tiers/i);
  });
});

// ── The two readers against each other ─────────────────────────────────────

describe("comparing the two readers", () => {
  const parsed = () => parseBreakdown(pageRows(fixturePage())!.rows, DOC_LINES);

  it("reports agreement when both readers land on the same figures", () => {
    const p = parsed();
    // The AI answer that matches what the parser read off the same page.
    const ai = breakdownFromAi([AI_DAY()], { lines: DOC_LINES, legend: readColourLegend(DOC_LINES) });
    const cmp = compareBreakdowns(p, ai, dayHeads, COLUMN_TIERS);
    expect(cmp.days.both).toBe(1);
    expect(cmp.differences).toEqual([]);
    expect(cmp.agreed).toBe(3);
  });

  it("names the day and category where they differ", () => {
    const p = parsed();
    const day = AI_DAY();
    day.scenes![0].reqs![0] = { name: "Hospital Nurses", count: 99, tier: "SA", fromAbove: false, colourUnexplained: false, note: "" };
    const ai = breakdownFromAi([day], { lines: DOC_LINES, legend: readColourLegend(DOC_LINES) });
    const cmp = compareBreakdowns(p, ai, dayHeads, COLUMN_TIERS);
    expect(cmp.differences).toEqual([
      { day: "Monday 7 September 2026", category: "crowd", parser: 7, ai: 104 },
    ]);
  });

  it("counts days only one reader found", () => {
    const p = parsed();
    const ai = breakdownFromAi(
      [AI_DAY(), AI_DAY({ num: 2, date: "Tuesday 8 September 2026", role: "SHOOT DAY 2", scenes: [], totals: [] })],
      { lines: DOC_LINES, legend: readColourLegend(DOC_LINES) },
    );
    const cmp = compareBreakdowns(p, ai, dayHeads, COLUMN_TIERS);
    expect(cmp.days.aiOnly).toBe(1);
    expect(cmp.days.parserOnly).toBe(0);
  });
});

// A guard on the fixture itself: if the grid ever stops resolving, every test
// above would be asserting against an empty table and would still pass.
describe("the fixture", () => {
  it("resolves its columns", () => {
    expect(readLayout(fixturePage())).toBeTruthy();
    expect(gridRows(fixturePage(), readLayout(fixturePage())!).length).toBeGreaterThan(5);
  });
});
