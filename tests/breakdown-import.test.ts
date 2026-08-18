// Reading an already-made crowd breakdown back in.
//
// The fixture below is built the way a real breakdown is built — positioned,
// coloured text runs — because that is the whole point of this reader: the
// COLUMN a requirement sits in is what makes it crowd, a SPACT or a stunt, and
// the COLOUR it is printed in is what makes it a child, a double or an action
// vehicle. A test written against flat text would pass while proving nothing.
//
// Column x positions match the real document this was developed against.

import { describe, it, expect } from "vitest";
import {
  attachFills,
  columnAt,
  gridRows,
  pageRows,
  readLayout,
  type BdItem,
} from "../lib/engine/breakdown-grid";
import {
  COLUMN_TIERS,
  applyColour,
  classifyRow,
  colourFamily,
  dayHeads,
  looksLikeBreakdown,
  parseBreakdown,
  parseDayBanner,
  parseReqCell,
  parseSceneHead,
  parseTotals,
  materialiseCarriedCrowd,
  readColourLegend,
  stitchOverflow,
} from "../lib/engine/breakdown-parse";
import { cbSceneLines } from "../lib/engine/breakdown-doc";
import type { Scene, ShootDay } from "../lib/engine/types";

// ── Fixture ────────────────────────────────────────────────────────────────

const X = { left: 28, scene: 87, ie: 101, sday: 115, slug: 125, desc: 247, crowd: 454, spact: 601, stunt: 740 };
const HDR = { ie: 100, d: 116, sday: 125, desc: 247, crowd: 436, spact: 583, stunt: 718 };

const BLACK = "#000000";
const WHITE = "#ffffff";
const ORANGE = "#ed7d31";
const PINK = "#ff40ff";
const GREEN = "#00b050";
const BLUE = "#0432ff";

let y = 500;
function row(cells: [number, string, string?][]): BdItem[] {
  y -= 12;
  return cells.map(([x, str, fill]) => ({ str, x, y, w: str.length * 2.2, fills: [fill || BLACK] }));
}

// A page's worth of items: running head, column headings, a week band, two
// shoot days with their scenes and footers, and the signature block.
function fixturePage(): BdItem[] {
  y = 500;
  const out: BdItem[] = [];
  // running head — ABOVE the heading row, and carrying a date that must never
  // be read as a requirement
  out.push(...row([[28, "CROWD BREAKDOWN"], [X.crowd, "FAREWELL MY LOVELY"], [X.stunt, "17.08.2026"]]));
  // the heading row the layout is read from
  out.push(...row([
    [HDR.ie, "I/E"], [HDR.d, "D"], [HDR.sday, "SHOOT DAY"],
    [HDR.desc, "LOCATION/HOURS/SCENE DESCRIPTION"],
    [HDR.crowd, "CROWD CHARACTERS/REQUIREMENTS"],
    [HDR.spact, "SPACTs CHARACTERS/REQUIREMENTS"],
    [HDR.stunt, "STUNT CHARACTERS/REQUIREMENTS"],
  ]));
  out.push(...row([[X.left, "SHOOT WEEK 1", WHITE]]));
  out.push(...row([[X.left, "Monday 7 September 2026", WHITE], [X.slug, "SHOOT DAY 1", WHITE], [X.desc, "AUDLEY END ESTATE (0800 - 1830)", WHITE]]));
  out.push(...row([[X.scene, "Sc.43"], [X.ie, "INT"], [X.sday, "D4"], [X.slug, "HOSPITAL ROOM"], [X.desc, "Terry gives Jay advice"], [X.crowd, "2 Hospital Nurses"], [X.spact, "1 Padel Player", PINK]]));
  out.push(...row([[X.crowd, "1 Hospital Doctor"]]));
  // a child, colour-coded, inside the CROWD column
  out.push(...row([[X.crowd, "2 Young Cousins (age 9)", ORANGE]]));
  // an overflowing group name whose carry marker lands in the SPACT column
  out.push(...row([[X.scene, "Sc.44"], [X.ie, "EXT"], [X.sday, "D4"], [X.slug, "CAR PARK"], [X.desc, "Simon apologises"], [X.crowd, "Hospital Nurses"], [X.spact, "(2x from above)"]]));
  out.push(...row([[X.crowd, "5 Wedding Guests"]]));
  out.push(...row([[X.crowd, "10 x SUPPORTING ARTISTS", WHITE], [X.spact, "1 xSPACTs (Special Action Extras)", WHITE], [X.stunt, "0 x STUNTS", WHITE]]));
  out.push(...row([[X.left, "Tuesday 8 September 2026", WHITE], [X.slug, "SHOOT DAY 2", WHITE], [X.desc, "LOCATION TBC (0800 - 1830)", WHITE]]));
  out.push(...row([[X.scene, "Sc.55 pt2/29"], [X.ie, "EXT"], [X.sday, "D4"], [X.slug, "COUNTRY ROAD"], [X.desc, "The chase"], [X.crowd, "3 Traffic Cars", GREEN], [X.stunt, "2 Swerving Drivers"]]));
  out.push(...row([[X.crowd, "1 Jay Body Double", BLUE]]));
  out.push(...row([[X.crowd, "4 x SUPPORTING ARTISTS", WHITE], [X.spact, "0 xSPACTs (Special Action Extras)", WHITE], [X.stunt, "2 x STUNTS", WHITE]]));
  out.push(...row([[X.left, "Wednesday 9 September 2026", WHITE], [X.slug, "REST DAY", WHITE]]));
  // signature block — BELOW everything, and "RHIANNON MOBBS" must not become a
  // requirement on the last scene
  out.push(...row([[X.left, "CROWD 2ND AD"]]));
  out.push(...row([[X.left, "RHIANNON MOBBS"]]));
  return out;
}

const DOC_LINES = [
  "CROWD BREAKDOWN FAREWELL MY LOVELY 17.08.2026",
  "*AS PER 'DRAFT' (UNISSUED) SHOOTING SCHEDULE DATED 12.08.26*",
  "COLOUR KEY: BLUE - DOUBLES, ORANGE - CHILDREN, GREEN - ACTION VEHICLES, FEATURED - PINK",
  "CROWD TOTALS (UK): 14 x SUPPORTING ARTISTS 1 x SPACTs (Special Action Extras) 2 x STUNTS",
];

function parseFixture() {
  const page = pageRows(fixturePage());
  expect(page).toBeTruthy();
  return parseBreakdown(page!.rows, DOC_LINES);
}

// ── Columns ────────────────────────────────────────────────────────────────

describe("finding the table's columns", () => {
  it("reads them off the document's own heading row", () => {
    const layout = readLayout(fixturePage());
    expect(layout).toBeTruthy();
    expect(layout!.cols.map((c) => c.col)).toEqual(["left", "ie", "scriptDay", "slug", "desc", "crowd", "spact", "stunt"]);
  });

  it("puts each cell in the column it was printed under", () => {
    const layout = readLayout(fixturePage())!;
    expect(columnAt(layout, X.crowd)).toBe("crowd");
    expect(columnAt(layout, X.spact)).toBe("spact");
    expect(columnAt(layout, X.stunt)).toBe("stunt");
    expect(columnAt(layout, X.desc)).toBe("desc");
    expect(columnAt(layout, X.left)).toBe("left");
  });

  it("gives up rather than guessing when there is no crowd column", () => {
    expect(readLayout([{ str: "SHOOT DAY 1", x: 10, y: 100 }])).toBeNull();
  });

  // THE REGRESSION THIS EXISTS FOR. Two side-by-side requirements are one line
  // of text and two different tiers. Flattening the page loses the boundary and
  // a SPACT is read as crowd.
  it("keeps a crowd entry and a SPACT entry on the same line apart", () => {
    const p = parseFixture();
    const d1 = p.model.days[0];
    expect(d1.scenes[0].saChars!.map((r) => r.name)).toContain("Hospital Nurses");
    // The pink SPACT stays a SPACT: the column is an explicit statement of tier
    // and colour must not overrule it.
    expect(d1.scenes[0].spacts!.map((r) => r.name)).toEqual(["Padel Player"]);
  });
});

// ── Page furniture ─────────────────────────────────────────────────────────

describe("page furniture", () => {
  // A running head reading "… 17.08.2026" sits in the STUNTS column. Read as a
  // requirement it is seventeen stunt performers, invented by a page break.
  it("never reads the running head's date as a requirement", () => {
    const p = parseFixture();
    for (const d of p.model.days) {
      for (const s of d.scenes) {
        expect((s.extras || []).map((r) => r.count)).not.toContain(17);
        expect(JSON.stringify(s)).not.toContain("17.08");
      }
    }
  });

  it("drops the signature block instead of booking the AD", () => {
    const p = parseFixture();
    const all = JSON.stringify(p.model.days);
    expect(all).not.toContain("RHIANNON");
    expect(all).not.toContain("FAREWELL MY LOVELY");
  });
});

// ── Colour ─────────────────────────────────────────────────────────────────

describe("colour", () => {
  it("groups real-world fills into the families a key line names", () => {
    expect(colourFamily("#ed7d31")).toBe("orange");
    expect(colourFamily("#ff9300")).toBe("orange"); // a different production's orange
    expect(colourFamily("#ff40ff")).toBe("pink");
    expect(colourFamily("#0432ff")).toBe("blue");
    expect(colourFamily("#00b050")).toBe("green");
    expect(colourFamily("#000000")).toBe("black");
    expect(colourFamily("#ffffff")).toBe("white");
  });

  it("reads the key line in either order", () => {
    const l = readColourLegend(DOC_LINES)!;
    expect(l.byColour.get("orange")!.tier).toBe("Child");
    expect(l.byColour.get("green")!.tier).toBe("AV");
    expect(l.byColour.get("pink")!.tier).toBe("Featured"); // written "FEATURED - PINK"
    expect(l.byColour.get("blue")!.flag).toBe("double");
  });

  it("files a colour-coded crowd row on the tier the document's key gives it", () => {
    const p = parseFixture();
    const d1 = p.model.days[0];
    const kids = d1.scenes.flatMap((s) => s.children || []);
    expect(kids.map((r) => `${r.count}x${r.name}`)).toEqual(["2xYoung Cousins (age 9)"]);
    // Children are carried for reconciliation but are NOT in the crowd budget.
    expect(kids[0].budgetScope).toBe("reference");
    const d2 = p.model.days[1];
    expect(d2.scenes.flatMap((s) => s.avs || []).map((r) => r.name)).toEqual(["Traffic Cars"]);
    expect(d2.scenes.flatMap((s) => s.avs || [])[0].unitType).toBe("vehicle");
    // A double is still crowd — the colour is a flag, not a tier.
    const dbl = d2.scenes.flatMap((s) => s.saChars || []).find((r) => /Body Double/.test(r.name))!;
    expect(dbl.flags).toContain("double");
  });

  // Guessing "blue usually means doubles" is exactly the wrong instinct: blue is
  // doubles on this production and could be SPACT on the next.
  it("marks a colour the document does not explain as needing a decision", () => {
    const req = { name: "Mystery Group", count: 4, tier: "SA" as const };
    const out = applyColour(req, ["#00b050"], null);
    expect(out.tierTbc).toBe(true);
    expect(out.tier).toBe("SA");
    expect(out.note).toMatch(/not explained/i);
  });

  it("leaves an ordinary black row alone", () => {
    const req = { name: "Wedding Guests", count: 40, tier: "SA" as const };
    expect(applyColour(req, ["#000000"], readColourLegend(DOC_LINES))).toEqual(req);
  });

  it("does not treat a banner's reversed-out white text as a tier", () => {
    const req = { name: "Wedding Guests", count: 40, tier: "SA" as const };
    expect(applyColour(req, ["#ffffff"], readColourLegend(DOC_LINES)).tierTbc).toBeUndefined();
  });
});

describe("attaching colours to positioned text", () => {
  // pdf.js MERGES neighbouring text runs that the paint list keeps apart —
  // precisely because the colour changed between them. Zipping the two lists by
  // index drifts on the first merged cell and every colour after it is wrong,
  // which on this document means children imported as ordinary crowd.
  it("survives the text layer merging runs of different colours", () => {
    const items = [
      { str: "LOCATION TBC (0800 - 1830)", x: 247, y: 100 }, // one item...
      { str: "2 Young Cousins", x: 454, y: 88 },
    ];
    const runs = [
      { str: "LOCATION TBC", fill: "#ff0000" }, // ...two paint runs
      { str: " (0800 - 1830)", fill: "#000000" },
      { str: "2 Young Cousins", fill: ORANGE },
    ];
    const out = attachFills(items, runs);
    expect(out[0].fills).toEqual(["#ff0000", "#000000"]);
    expect(out[1].fills).toEqual([ORANGE]); // NOT shifted by the merge above
  });

  it("does not let an unmatched item shift every colour after it", () => {
    const out = attachFills(
      [{ str: "   ", x: 0, y: 10 }, { str: "2 Kids", x: 454, y: 10 }],
      [{ str: "2 Kids", fill: ORANGE }],
    );
    expect(out[1].fills).toEqual([ORANGE]);
  });
});

// ── Cells ──────────────────────────────────────────────────────────────────

describe("reading a requirement cell", () => {
  it("reads a count and a name", () => {
    const p = parseReqCell("28 Gastro Pub Diners", "SA");
    expect(p.kind).toBe("group");
    expect(p.req).toMatchObject({ name: "Gastro Pub Diners", count: 28, tier: "SA", budgetScope: "crowd" });
  });

  it("keeps a distinguishing parenthetical in the name", () => {
    // "Wedding Guests (chapel)" and "Wedding Guests (breakfast)" are different
    // bookings; dropping the bracket merges two groups into one.
    expect(parseReqCell("126 Wedding Guests (chapel)", "SA").req!.name).toBe("Wedding Guests (chapel)");
  });

  it("reads a group carried over from an earlier scene", () => {
    const p = parseReqCell("Wedding Hotel Staff (5x from above)", "SA");
    expect(p.req).toMatchObject({ name: "Wedding Hotel Staff", count: 5 });
    expect(p.req!.flags).toContain("asAbove");
    expect(p.req!.contRef).toMatch(/from above/i);
  });

  it("reads a carried group with no count of its own", () => {
    const p = parseReqCell("Padel Staff (from above)", "SA");
    expect(p.req!.count).toBe(0);
    expect(p.req!.flags).toContain("asAbove");
  });

  it("recognises a whole cell that is only a pointer", () => {
    expect(parseReqCell("As above (32)", "SA")).toMatchObject({ kind: "asAbove", count: 32 });
    expect(parseReqCell("As above", "SA").kind).toBe("asAbove");
  });

  it("tells a confirmed nothing from an empty cell", () => {
    expect(parseReqCell("N/A", "SA").kind).toBe("na");
    expect(parseReqCell("", "SA").kind).toBe("na");
  });

  it("files a stunt-column row outside the crowd budget", () => {
    expect(parseReqCell("2 Swerving Drivers", "Stunt").req!.budgetScope).toBe("reference");
  });
});

// COLUMN OVERFLOW. A long group name runs past its column boundary and its tail
// is picked up as a separate requirement in the next column — inventing a
// booking AND stripping the "same people" marker off the group that owns it, so
// those people get counted twice.
describe("a group name that overflows its column", () => {
  const cell = (col: any, text: string, x: number) => ({ col, text, fills: [], x });

  it("gives a carry marker back to the entry it belongs to", () => {
    const out = stitchOverflow([cell("crowd", "London Law Firm Office Workers", 454), cell("spact", "(10x from above)", 601)]);
    expect(out).toHaveLength(1);
    expect(out[0].col).toBe("crowd");
    expect(out[0].text).toBe("London Law Firm Office Workers (10x from above)");
  });

  it("still rejoins it when the entry already ends in a bracket of its own", () => {
    const out = stitchOverflow([cell("crowd", "Wedding Guests (breakfast)", 454), cell("spact", "(25x from above)", 601)]);
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe("Wedding Guests (breakfast) (25x from above)");
  });

  it("keeps a genuine next entry crammed in behind the fragment", () => {
    const out = stitchOverflow([
      cell("crowd", "Wedding Guests", 454),
      cell("spact", "(40x from above) Bride's Friends (chapel)", 601),
    ]);
    expect(out.map((c) => c.text)).toEqual(["Wedding Guests (40x from above)", "Bride's Friends (chapel)"]);
  });

  it("leaves two complete entries alone", () => {
    const out = stitchOverflow([cell("crowd", "20 Spa Guests", 454), cell("spact", "3 Bride's Friends", 601)]);
    expect(out).toHaveLength(2);
  });

  it("recovers the overflowing group end to end", () => {
    const p = parseFixture();
    const sc44 = p.model.days[0].scenes.find((s) => s.num === "44")!;
    const nurses = sc44.saChars!.find((r) => r.name === "Hospital Nurses")!;
    expect(nurses.count).toBe(2);
    expect(nurses.flags).toContain("asAbove");
    // ...and no phantom SPACT was invented from the fragment.
    expect(sc44.spacts || []).toHaveLength(0);
  });
});

// ── Rows ───────────────────────────────────────────────────────────────────

describe("day banners", () => {
  const bannerRow = (cells: [number, string][]) => {
    const items = cells.map(([x, str]) => ({ str, x, y: 100, w: 20 }));
    const layout = readLayout([...fixturePage()])!;
    return gridRows(items, layout)[0];
  };

  it("reads a shoot day, its location and its hours", () => {
    const b = parseDayBanner(bannerRow([[X.left, "Monday 7 September 2026"], [X.slug, "SHOOT DAY 1"], [X.desc, "AUDLEY END ESTATE (0800 - 1830)"]]))!;
    expect(b).toMatchObject({ num: 1, loc: "AUDLEY END ESTATE", hours: "0800 - 1830", unitKind: "main", phase: "shoot", rest: false });
  });

  it("recognises a rest day as not a shoot day", () => {
    expect(parseDayBanner(bannerRow([[X.left, "Saturday 12 September 2026"], [X.slug, "REST DAY"]]))!.rest).toBe(true);
  });

  it("reads an extra unit on the same date", () => {
    const b = parseDayBanner(bannerRow([[X.left, "Monday 14 September 2026"], [X.slug, "2ND UNIT / SPLINTER UNIT"], [X.desc, "LOCATION TBC (0800 - 1830)"]]))!;
    expect(b.unitKind).toBe("splinter");
    expect(b.num).toBeNull();
  });

  it("reads a rehearsal day and a travel day for what they are", () => {
    expect(parseDayBanner(bannerRow([[X.left, "Saturday 19 September 2026"], [X.slug, "REHEARSAL DAY"], [X.desc, "AUDLEY END ESTATE (HOURS TBC)"]]))!.unitKind).toBe("rehearsal");
    expect(parseDayBanner(bannerRow([[X.left, "Monday 26 October 2026"], [X.slug, "TRAVEL DAY"]]))!.phase).toBe("prep");
  });
});

describe("scene rows", () => {
  const sceneRow = (cells: [number, string][]) => {
    const items = cells.map(([x, str]) => ({ str, x, y: 100, w: 20 }));
    return gridRows(items, readLayout(fixturePage())!)[0];
  };

  it("separates the scene number, its part and the interior/exterior marker", () => {
    const h = parseSceneHead(sceneRow([[X.scene, "Sc.87 pt3/7"], [X.ie, "INT"], [X.sday, "D1"], [X.slug, "OFFICE"], [X.desc, "Jay drives"]]))!;
    expect(h).toMatchObject({ nums: ["87"], part: "3/7", ie: "INT", scriptDay: "D1", slug: "OFFICE" });
  });

  it("reads every scene number on a row that covers several", () => {
    expect(parseSceneHead(sceneRow([[X.scene, "Sc.23, 24, 25"], [X.ie, "INT"]]))!.nums).toEqual(["23", "24", "25"]);
    expect(parseSceneHead(sceneRow([[X.scene, "Sc.15 & Sc.16"], [X.ie, "I/E"]]))!.nums).toEqual(["15", "16"]);
  });

  it("keeps a rehearsal marker off the scene number", () => {
    const h = parseSceneHead(sceneRow([[X.scene, "Sc.14 REH"], [X.ie, "EXT"]]))!;
    expect(h.nums).toEqual(["14"]);
    expect(h.tags).toContain("REHEARSAL");
  });

  it("copes with a scene that has no number yet", () => {
    expect(parseSceneHead(sceneRow([[X.scene, "Sc.tbc"], [X.ie, "EXT"]]))!.nums).toEqual(["TBC"]);
  });

  // One set-up covering three scenes is three scenes for matching against the
  // schedule, but ONE set of bodies — only the first carries the rows.
  it("does not multiply the crowd across a multi-scene row", () => {
    const layout = readLayout(fixturePage())!;
    const items = [
      { str: "Sc.23, 24, 25", x: X.scene, y: 100, w: 20 },
      { str: "INT", x: X.ie, y: 100, w: 8 },
      { str: "60 Wedding Guests (BBQ)", x: X.crowd, y: 100, w: 40 },
    ];
    const rows = [
      ...gridRows([{ str: "Monday 7 September 2026", x: X.left, y: 200, w: 40 }, { str: "SHOOT DAY 1", x: X.slug, y: 200, w: 20 }], layout),
      ...gridRows(items, layout),
    ];
    const p = parseBreakdown(rows, []);
    const d = p.model.days[0];
    expect(d.scenes.map((s) => s.num)).toEqual(["23", "24", "25"]);
    expect(dayHeads(d, ["SA"])).toBe(60); // not 180
    expect(d.scenes[1].contFrom).toBe("23");
    // ...but a covering scene is not an EMPTY scene. Each one shows the same 60
    // guests, every row marked as carried so the day still books 60 once.
    for (const sc of d.scenes.slice(1)) {
      expect(sc.crowdInherited).toBe(true);
      expect(sc.saChars).toEqual([
        expect.objectContaining({ name: "Wedding Guests (BBQ)", count: 60, cont: "23", flags: ["asAbove"] }),
      ]);
    }
  });
});

describe("a scene that says “as above” instead of listing its crowd", () => {
  const mk = (scenes: Partial<Scene>[]): ShootDay =>
    ({ id: "d1", num: "1", date: "Mon 7 Sep 2026", scenes: scenes as Scene[] }) as unknown as ShootDay;

  it("fills it in from the scene it points at, as the same people", () => {
    const d = mk([
      { num: "23", sa: 0, saChars: [{ name: "Wedding Guests", count: 60 }], featured: [{ name: "Photographers", count: 2 }] },
      { num: "24", sa: 0, contFrom: "23", contFromRef: "covered with Sc.23" },
    ]);
    expect(materialiseCarriedCrowd([d])).toBe(1);
    expect(d.scenes[1].saChars![0]).toMatchObject({ name: "Wedding Guests", count: 60, flags: ["asAbove"] });
    expect(d.scenes[1].featured![0]).toMatchObject({ name: "Photographers", count: 2, flags: ["asAbove"] });
    // carried rows are nobody new — the day's figure is unchanged
    expect(dayHeads(d, ["SA", "Featured"])).toBe(62);
  });

  it("follows a bare “as above” to the scene above it", () => {
    const d = mk([
      { num: "9", sa: 0, saChars: [{ name: "Commuters", count: 12 }] },
      { num: "10", sa: 0, contFromRef: "As above (12)" },
    ]);
    expect(materialiseCarriedCrowd([d])).toBe(1);
    expect(d.scenes[1].saChars![0]).toMatchObject({ name: "Commuters", count: 12 });
  });

  it("leaves a pointer alone when its scene is not on this day", () => {
    const d = mk([{ num: "76", sa: 0, contFrom: "1", contFromRef: "(FROM ABOVE)" }]);
    expect(materialiseCarriedCrowd([d])).toBe(0);
    expect(d.scenes[0].saChars || []).toEqual([]);
  });

  it("never overwrites a scene that states crowd of its own", () => {
    const d = mk([
      { num: "23", sa: 0, saChars: [{ name: "Wedding Guests", count: 60 }] },
      { num: "24", sa: 0, contFrom: "23", saChars: [{ name: "Mechanic", count: 1 }] },
    ]);
    expect(materialiseCarriedCrowd([d])).toBe(0);
    expect(d.scenes[1].saChars).toEqual([{ name: "Mechanic", count: 1 }]);
  });

  it("names the carried groups instead of printing a bare pointer", () => {
    const carried: Scene = {
      num: "24", contFrom: "23", sa: 0,
      saChars: [{ name: "Wedding Guests", count: 60, flags: ["asAbove"] }],
    } as Scene;
    // "AS SCENE 23 (FROM ABOVE)" names nobody — the row says who, marked carried
    expect(cbSceneLines(carried).crowd.map((l) => l.name)).toEqual(["Wedding Guests"]);
    expect(cbSceneLines(carried).crowd[0].fromAbove).toBe(true);
    // only a pointer we could NOT resolve still prints as itself
    const unresolved: Scene = { num: "76", contFrom: "1", sa: 0 } as Scene;
    expect(cbSceneLines(unresolved).crowd.map((l) => l.name)).toEqual(["AS SCENE 1 (FROM ABOVE)"]);
    const mixed: Scene = {
      ...carried,
      saChars: [...carried.saChars!, { name: "Mechanic", count: 1 }],
    } as Scene;
    expect(cbSceneLines(mixed).crowd.map((l) => l.name)).toEqual(["Wedding Guests", "Mechanic"]);
  });
});

describe("classifying a row", () => {
  const layout = () => readLayout(fixturePage())!;
  const mk = (cells: [number, string][]) =>
    gridRows(cells.map(([x, str]) => ({ str, x, y: 100, w: 20 })), layout())[0];

  it("knows a week band, a day, a total, a scene and a continuation", () => {
    expect(classifyRow(mk([[X.left, "SHOOT WEEK 3"]]))).toBe("week");
    expect(classifyRow(mk([[X.left, "Monday 7 September 2026"], [X.slug, "SHOOT DAY 1"]]))).toBe("day");
    expect(classifyRow(mk([[X.crowd, "43 x SUPPORTING ARTISTS"], [X.stunt, "0 x STUNTS"]]))).toBe("dayTotal");
    expect(classifyRow(mk([[X.scene, "Sc.43"], [X.ie, "INT"]]))).toBe("scene");
    expect(classifyRow(mk([[X.crowd, "2 Photographers"]]))).toBe("cont");
    expect(classifyRow(mk([[X.slug, "WEATHER COVER"], [X.desc, "AUDLEY END ESTATE"]]))).toBe("banner");
  });
});

describe("totals rows", () => {
  it("reads each category by its own wording", () => {
    expect(parseTotals({ y: 0, cells: [], text: "43 x SUPPORTING ARTISTS 4 xSPACTs (Special Action Extras) 1 x STUNTS" }))
      .toEqual({ SA: 43, SPACT: 4, Stunt: 1 });
  });

  it("reads a zero as a zero, not as absent", () => {
    expect(parseTotals({ y: 0, cells: [], text: "0 x SUPPORTING ARTISTS 0 xSPACTs 0 x STUNTS" }))
      .toEqual({ SA: 0, SPACT: 0, Stunt: 0 });
  });
});

// ── The whole document ─────────────────────────────────────────────────────

describe("reading a whole breakdown", () => {
  it("recognises a breakdown, and does not mistake a schedule for one", () => {
    expect(looksLikeBreakdown(DOC_LINES.join("\n") + "\n" + "CROWD CHARACTERS/REQUIREMENTS SPACTs CHARACTERS/REQUIREMENTS")).toBe(true);
    // A Full Fat schedule talks about crowd constantly and is not a breakdown.
    expect(looksLikeBreakdown("Shoot Day #1\nBackground Actors: 40 passersby\nCast Members: 1, 2, 4\nEnd of DAY 1")).toBe(false);
    expect(looksLikeBreakdown("DAY 1 - Monday 7th Sep - (0800-1830)\nSc.43 INT D4 HOSPITAL")).toBe(false);
  });

  it("reads the days, skipping the rest day but keeping it on the record", () => {
    const p = parseFixture();
    expect(p.model.days.map((d) => d.num)).toEqual([1, 2]);
    expect(p.model.days[0].loc).toBe("AUDLEY END ESTATE");
    expect(p.model.notes.some((n) => n.type === "rest" && /9 September/.test(n.text))).toBe(true);
  });

  it("reads the header, the colour key and the closing totals", () => {
    const p = parseFixture();
    expect(p.model.source).toBe("breakdown_import");
    expect(p.model.sourceScheduleDate).toBe("12.08.26");
    expect(p.model.declaredTotals).toEqual({ SA: 14, SPACT: 1, Stunt: 2 });
    expect(p.model.colourKey).toMatchObject({ orange: "Child", green: "AV", pink: "Featured" });
  });

  it("keeps each day's printed total beside our own reading of it", () => {
    const p = parseFixture();
    expect(p.model.days[0].declaredTotals).toEqual({ SA: 10, SPACT: 1, Stunt: 0 });
    expect(p.model.days[1].declaredTotals).toEqual({ SA: 4, SPACT: 0, Stunt: 2 });
  });

  // The real check on whether the document was read correctly: the AD's own
  // arithmetic. Day 1 = 2 nurses + 1 doctor + 2 children + 5 guests = 10, and
  // the carried nurses on Sc.44 add nobody.
  it("reproduces the document's own day totals", () => {
    const p = parseFixture();
    for (const d of p.model.days) {
      for (const col of ["SA", "SPACT", "Stunt"] as const) {
        expect(dayHeads(d, COLUMN_TIERS[col]), `${d.date} ${col}`).toBe(d.declaredTotals![col]);
      }
    }
    expect(p.mismatches).toEqual([]);
    expect(p.warnings.join(" ")).toMatch(/Every one of the 2 day totals/);
  });

  // A group written out WITHOUT a carry marker is new people, even where an
  // earlier scene that day names the same group. Pooling by name would drop
  // them — and under-book the day.
  it("counts an unmarked repeat of a group as new people", () => {
    const layout = readLayout(fixturePage())!;
    const at = (yy: number, cells: [number, string][]) =>
      gridRows(cells.map(([x, str]) => ({ str, x, y: yy, w: 20 })), layout);
    const rows = [
      ...at(300, [[X.left, "Thursday 17 September 2026"], [X.slug, "SHOOT DAY 9"]]),
      ...at(280, [[X.scene, "Sc.65"], [X.ie, "EXT"], [X.crowd, "10 Wedding Guests (chapel)"]]),
      ...at(260, [[X.scene, "Sc.66"], [X.ie, "EXT"], [X.crowd, "20 Wedding Guests (chapel)"]]),
      ...at(240, [[X.crowd, "30 x SUPPORTING ARTISTS"], [X.stunt, "0 x STUNTS"]]),
    ];
    const p = parseBreakdown(rows, []);
    expect(dayHeads(p.model.days[0], COLUMN_TIERS.SA)).toBe(30);
    expect(p.mismatches).toEqual([]);
  });

  it("never lets the closing grand total become the last day's requirement", () => {
    const layout = readLayout(fixturePage())!;
    const at = (yy: number, cells: [number, string][]) =>
      gridRows(cells.map(([x, str]) => ({ str, x, y: yy, w: 20 })), layout);
    const rows = [
      ...at(300, [[X.left, "Monday 7 September 2026"], [X.slug, "SHOOT DAY 1"]]),
      ...at(280, [[X.scene, "Sc.1"], [X.ie, "EXT"], [X.crowd, "4 Passersby"]]),
      ...at(260, [[X.crowd, "4 x SUPPORTING ARTISTS"], [X.stunt, "0 x STUNTS"]]),
      ...at(240, [[X.left, "CROWD TOTALS (UK):"], [X.crowd, "1904 x SUPPORTING ARTISTS"], [X.stunt, "6 x STUNTS"]]),
    ];
    const p = parseBreakdown(rows, []);
    expect(p.model.days[0].declaredTotals).toEqual({ SA: 4, Stunt: 0 });
  });

  // A real document footers one day twice, and the second copy has a typo in the
  // middle column. Taking the later value moves four SPACTs onto the stunt line.
  it("keeps the first figure when a day states its total twice, and says so", () => {
    const layout = readLayout(fixturePage())!;
    const at = (yy: number, cells: [number, string][]) =>
      gridRows(cells.map(([x, str]) => ({ str, x, y: yy, w: 20 })), layout);
    const rows = [
      ...at(300, [[X.left, "Friday 9 October 2026"], [X.slug, "SHOOT DAY 24"]]),
      ...at(280, [[X.scene, "Sc.17"], [X.ie, "INT"], [X.crowd, "27 Wedding Guests"], [X.spact, "4 Bride's Friends"]]),
      ...at(260, [[X.crowd, "27 x SUPPORTING ARTISTS"], [X.spact, "4 xSPACTs (Special Action Extras)"], [X.stunt, "0 x STUNTS"]]),
      ...at(250, [[X.crowd, "27 x SUPPORTING ARTISTS"], [X.spact, "4 x STUNTS"], [X.stunt, "0 x STUNTS"]]),
    ];
    const p = parseBreakdown(rows, []);
    expect(p.model.days[0].declaredTotals).toMatchObject({ SA: 27, SPACT: 4, Stunt: 0 });
    expect(p.contradictions).toHaveLength(1);
    expect(p.warnings.join(" ")).toMatch(/states? a total twice/);
  });

  it("keeps a cell it cannot read rather than dropping or inventing it", () => {
    const layout = readLayout(fixturePage())!;
    const at = (yy: number, cells: [number, string][]) =>
      gridRows(cells.map(([x, str]) => ({ str, x, y: yy, w: 20 })), layout);
    const rows = [
      ...at(300, [[X.left, "Monday 7 September 2026"], [X.slug, "SHOOT DAY 1"]]),
      ...at(280, [[X.scene, "Sc.1"], [X.ie, "EXT"], [X.crowd, "Humanist Bride"]]),
    ];
    const p = parseBreakdown(rows, []);
    expect(p.unparsed).toHaveLength(1);
    expect(p.model.days[0].scenes[0].unparsed).toEqual(["Humanist Bride"]);
    expect(p.model.days[0].scenes[0].saChars).toHaveLength(0);
    expect(p.warnings.join(" ")).toMatch(/could not be read/);
  });

  it("says so plainly when a document has no colour key at all", () => {
    const page = pageRows(fixturePage())!;
    const p = parseBreakdown(page.rows, ["CROWD BREAKDOWN"]);
    expect(p.warnings.join(" ")).toMatch(/No colour key/);
  });

  it("does not give a travel day a shoot day's number", () => {
    const layout = readLayout(fixturePage())!;
    const at = (yy: number, cells: [number, string][]) =>
      gridRows(cells.map(([x, str]) => ({ str, x, y: yy, w: 20 })), layout);
    const rows = [
      ...at(300, [[X.left, "Friday 23 October 2026"], [X.slug, "SHOOT DAY 36"]]),
      ...at(290, [[X.scene, "Sc.1"], [X.ie, "EXT"], [X.crowd, "4 Passersby"]]),
      ...at(280, [[X.left, "Monday 26 October 2026"], [X.slug, "TRAVEL DAY"]]),
      ...at(270, [[X.left, "Monday 26 October 2026"], [X.slug, "2ND UNIT / SPLINTER UNIT"]]),
    ];
    const p = parseBreakdown(rows, []);
    const [shoot, travel, splinter] = p.model.days;
    expect(shoot.num).toBe(36);
    expect(travel).toMatchObject({ num: 0, phase: "prep" });
    // ...but a second unit on the SAME DATE as a numbered day does share it.
    expect(splinter.num).toBe(0); // 26 Oct was never a numbered shoot day
    const same = parseBreakdown(
      [
        ...at(200, [[X.left, "Friday 23 October 2026"], [X.slug, "SHOOT DAY 36"]]),
        ...at(190, [[X.left, "Friday 23 October 2026"], [X.slug, "2ND UNIT / SPLINTER UNIT"]]),
      ],
      [],
    );
    expect(same.model.days[1]).toMatchObject({ num: 36, unitKind: "splinter" });
  });
});
