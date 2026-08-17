// The ruled-table "HOD Schedule" format (see lib/engine/hod.ts).
//
// Regression origin: a real 16-page schedule of this shape produced ZERO days
// from both text parsers, fell through to the AI reader, and came back with
// its dates in the wrong order. The format has to be read from the PDF's
// coordinates, so these fixtures are layout items with the geometry the real
// document uses — cells vertically centred, one scene spread over three y
// bands, "Sc." and its number on different bands.
import { describe, it, expect } from "vitest";
import { parseHOD, type LayoutItem } from "../lib/engine/hod";
import { parseDayDate } from "../lib/engine/model";

const it_ = (str: string, x: number, y: number, w = str.length * 5): LayoutItem =>
  ({ str, x, y, w });
const centred = (str: string, y: number): LayoutItem => it_(str, 311 - str.length * 2.5, y, str.length * 5);

// Columns, taken from the real document.
const X = { loc: 40, sc: 103, num: 116, ie: 159, slug: 185, tod: 346, sd: 364, pg: 397, pgs: 414, cast: 431, sa: 531, est: 551 };

interface SceneSpec {
  loc: string; num: string; ie: string; slug: string; tod: string; sd: string;
  pg: string; cast: string; sa: string; est: string; desc: string;
  splitNum?: boolean; //   "Sc." one band above its number, as the real doc does
}

// Lay one scene out over three y bands exactly as the template does.
function sceneItems(s: SceneSpec, top: number): LayoutItem[] {
  const head = top - 1, second = top - 2, body = top - 13;
  return [
    it_("SA's", X.sa, top, 12), it_("Est.T", X.est, top, 14),
    it_(s.tod, X.tod, head, 10), it_(s.sd, X.sd, head, 7),
    it_(s.pg, X.pg, head, 13), it_("Pgs", X.pgs, head, 10),
    it_(s.cast, X.cast, head, 30),
    it_("Sc.", X.sc, s.splitNum ? head : second, 11),
    it_(s.num, X.num, second, 8),
    it_(s.loc, X.loc, second, 40),
    it_(s.ie, X.ie, second, 11),
    it_(s.slug, X.slug, second, 100),
    it_(s.sa, X.sa + 1, body + 1, 6), it_(s.est, X.est + 4, body + 1, 11),
    it_(s.desc, X.sc + 1, body, 240),
  ];
}

const SC1: SceneSpec = {
  loc: "Loc - TBC*", num: "43", ie: "INT", slug: "Jay's Dad's Hospital Room - ICU",
  tod: "Day", sd: "D4", pg: "1 3/8", cast: ".J, 17", sa: "3", est: "4:00",
  desc: "Terry gives Jay some life advice",
};
const SC2: SceneSpec = {
  loc: "Hertfordshire", num: "87pt5/7", ie: "INT/EXT", slug: "Wedding Hotel - Spa Sauna",
  tod: "Evening", sd: "E2", pg: "5/8", cast: ".N, .S, .W, 9, SC***", sa: "150", est: "6:30",
  desc: "The Boys are relaxing in the Sauna", splitNum: true,
};

function page(): LayoutItem[] {
  return [
    centred("HOD Schedule # 4 - 12/8/26", 783),
    centred("***SHOOT WEEK 1 - BEGINNING MONDAY 7TH SEP***", 681),
    centred("Day 1 - Monday 7th Sep - (0800-1830) - SCWD", 656),
    centred("Sunrise 0622 Sunset 1933", 630),
    ...sceneItems(SC1, 590),
    centred("Weather Cover", 553),
    ...sceneItems(SC2, 530),
    centred("----- Total Pages 3 6/8 pgs --- Est Time filming today - 10:30 -----", 490),
    centred("Days off Saturday and Sunday", 470),
    centred("Day 2 - Tuesday 8th Sep - (0800- 1830) CWD*", 450),
    centred("Sunrise 0624 Sunset 1931", 430),
    ...sceneItems({ ...SC1, num: "14REH", cast: ".S, .W, 34", sa: "0", est: ":00" }, 400),
    centred("----- Total Pages 1 1/8 pgs -----", 360),
  ];
}

// The cast page: each code is its own item and ends in a full stop.
const castPage: LayoutItem[] = [
  it_("CAST MEMBERS", 18, 808),
  it_(".J.", 32, 797, 10), it_("Jay", 42, 797, 15),
  it_("19.", 216, 797, 13), it_("Ava (American Wedding Guest)", 229, 797, 132),
  it_(".N.", 29, 784, 12), it_("Neil", 42, 784, 16),
  it_("SC***.", 400, 784, 20), it_("Stunt Coordinator", 424, 784, 70),
];

describe("parseHOD — ruled-table schedule", () => {
  const model = parseHOD([castPage, page()])!;

  it("recognises the format and finds every day in printed order", () => {
    expect(model).not.toBeNull();
    expect(model.days.map((d) => d.num)).toEqual([1, 2]);
  });

  it("resolves the yearless date so the board can sort on it", () => {
    // the template prints "7th Sep"; the year comes from the header's 12/8/26
    expect(model.days[0].date).toBe("Monday 7th Sep 2026");
    const a = parseDayDate(model.days[0])!, b = parseDayDate(model.days[1])!;
    expect(a.toDateString()).toBe("Mon Sep 07 2026");
    expect(b.getTime()).toBeGreaterThan(a.getTime());
  });

  it("reads the day banner's hours and day type, and its sunrise/sunset", () => {
    expect(model.days[0].hours).toBe("0800–1830");
    expect(model.days[0].type).toBe("SCWD");
    expect(model.days[0].sr).toBe("0622");
    expect(model.days[0].ss).toBe("1933");
    // "(0800- 1830) CWD*" — no dash before the type, trailing asterisk
    expect(model.days[1].hours).toBe("0800–1830");
    expect(model.days[1].type).toBe("CWD");
  });

  it("stitches a scene back together out of its scattered cells", () => {
    const s = model.days[0].scenes[0];
    expect(s.num).toBe("43");
    expect(s.ie).toBe("INT");
    expect(s.slug).toBe("Jay's Dad's Hospital Room - ICU");
    expect(s.tod).toBe("Day");
    expect(s.scriptDay).toBe("D4");
    expect(s.pages).toBe("1 3/8");
    expect(s.desc).toBe("Terry gives Jay some life advice");
  });

  it("takes the SA's column as the scene's crowd count", () => {
    expect(model.days[0].scenes.map((s) => s.sa)).toEqual([3, 150]);
    expect(model.days[1].scenes[0].sa).toBe(0);
  });

  it("reads the leading-dot lead codes and the stunt coordinator", () => {
    expect(model.days[0].scenes[0].cast.map((c) => c.code)).toEqual(["J", "17"]);
    const two = model.days[0].scenes[1].cast;
    expect(two.map((c) => c.code)).toEqual(["N", "S", "W", "9", "SC"]);
    expect(two.find((c) => c.code === "SC")!.type).toBe("stuntCoord");
    expect(model.castMap["J"]).toBe("Jay");
    expect(model.castMap["19"]).toBe("Ava (American Wedding Guest)");
    expect(model.castMap["SC"]).toBe("Stunt Coordinator");
  });

  it("keeps 'Sc.' split from its number out of the description", () => {
    const s = model.days[0].scenes[1];
    expect(s.num).toBe("87");
    expect(s.part).toBe("5/7");
    expect(s.desc).toBe("The Boys are relaxing in the Sauna");
  });

  it("attaches a centred instruction line to the scene it heads", () => {
    const s = model.days[0].scenes[1];
    expect(s.tags).toContain("Weather Cover");
    expect(s.status).toBe("weatherCover");
  });

  it("records the day's own page total and the days-off note", () => {
    expect(model.days[0].pages).toBe("3 6/8");
    expect(model.notes.some((n) => n.type === "rest" && /Days off/.test(n.text))).toBe(true);
  });

  it("returns null for anything that is not this format", () => {
    expect(parseHOD([[it_("Shoot Day # 1 Monday, 7 September 2026", 40, 700)]])).toBeNull();
  });
});
