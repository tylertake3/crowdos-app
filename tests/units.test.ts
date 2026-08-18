// Which unit a scene belongs to — lib/engine/units.ts.
//
// A shoot day runs more than one crew, and neither the schedule nor the crowd
// breakdown gives the second one its own day: the drone plates and car mounts
// are printed inside the main unit's day under a banner. Crowd is booked and
// priced per unit, so reading those markings wrong either hides a unit's work
// or claims main-unit scenes for a crew that never shot them.
//
// Every string below is taken verbatim from the FML schedule.
import { describe, it, expect } from "vitest";
import { sceneUnit, resolveDayUnits, unitsPresent, sceneInUnit } from "../lib/engine/units";
import type { Scene, ShootDay } from "../lib/engine/types";

const scene = (extra: Partial<Scene> = {}): Scene => ({
  num: "1", part: "", ie: "INT", slug: "", tod: "", scriptDay: "", pages: "",
  unit: "Main", desc: "", sa: 0, veh: 0, pod: false, cast: [], tags: [], ...extra,
});
const day = (scenes: Scene[], extra: Partial<ShootDay> = {}): ShootDay =>
  ({ num: 11, date: "", sr: "", ss: "", loc: "", hours: "", type: "", cams: "",
     pages: "", scenes, ...extra });

describe("sceneUnit", () => {
  it("reads a banner tag against the scene it heads", () => {
    expect(sceneUnit(scene({
      num: "Est", desc: "Establishers of Hotel",
      tags: ["2nd Unit/Splinter Unit - (to be filmed durig 16pt1/2)", "Loc: Audley End Estate"],
    }))).toBe("splinter"); // names both — splinter is the more specific
  });

  it("reads a unit written into the scene's own description", () => {
    expect(sceneUnit(scene({
      num: "55", desc: "Drone - The Blue Car drives along the Driveway - 2nd Unit (Storyboard 2A)",
    }))).toBe("second");
  });

  it("lets an explicit Main unit win inside a block of second-unit work", () => {
    expect(sceneUnit(scene({
      desc: "Main unit - The Boys are chasing the Man - (Pod Car, Bonnet Mount)",
    }))).toBe("main");
  });

  it("does not read a note ABOUT a rehearsal as a unit marking", () => {
    // This tag sits on scene 15pt1/2, a main-unit scene. It is a note that a
    // rehearsal will happen on another day — treating it as a unit marking
    // would take a main-unit scene off the main unit's board.
    expect(sceneUnit(scene({
      num: "15", part: "1/2", desc: "Will is enroute to the Wedding - (Drone, Wides etc.....)",
      tags: ["Rehearsal of Sc 15pt, 16pt will be required beforehand", "Loc: Audley End Estate"],
    }))).toBe("main");
  });

  it("does not claim a scene that merely sits below a unit banner", () => {
    // FML's weather-cover scene follows the 2nd unit block on day 11 and
    // belongs to neither. Nothing is inferred from position for this reason.
    expect(sceneUnit(scene({
      num: "W/C", desc: "Weather Cover - Sc 23,24,25",
      tags: ["WEATHER COVER SCENES ARE INT DINNER AREA", "Loc: Audley End Estate"],
    }))).toBe("main");
  });
});

describe("resolveDayUnits", () => {
  it("tags a mixed day scene by scene, leaving the day itself main", () => {
    const d = resolveDayUnits(day([
      scene({ num: "15", part: "1/2" }),
      scene({ num: "16", part: "1/2" }),
      scene({ num: "Est", tags: ["2nd Unit/Splinter Unit - (to be filmed durig 16pt1/2)"] }),
      scene({ num: "55", part: "6/29", desc: "Drone - 2nd Unit (Storyboard 2A)" }),
      scene({ num: "W/C", desc: "Weather Cover - Sc 23,24,25" }),
    ]));
    expect(d.scenes.map((s) => s.unit2)).toEqual(["main", "main", "splinter", "second", "main"]);
    expect(d.unitKind).toBeUndefined(); // a mixed day is still the main unit's day
  });

  it("calls a day whose every scene is second unit a second unit day", () => {
    const d = resolveDayUnits(day([
      scene({ num: "1", desc: "STUNT UNIT - 2nd Unit filming sc1pt and 2pt Opening seq" }),
    ]));
    expect(d.unitKind).toBe("second");
  });

  it("never overrides a unit the document stated for itself", () => {
    // The crowd breakdown prints "REHEARSAL DAY" as its own banner. That is a
    // statement, and it outranks anything inferred from scene text.
    const d = resolveDayUnits(day([scene({ desc: "Drone - 2nd Unit" })], { unitKind: "rehearsal" }));
    expect(d.unitKind).toBe("rehearsal");
  });
});

describe("unitsPresent / sceneInUnit", () => {
  it("offers only the units a schedule actually has work in", () => {
    const days = [
      resolveDayUnits(day([scene({}), scene({ desc: "Drone - 2nd Unit" })])),
      resolveDayUnits(day([scene({})])),
    ];
    expect(unitsPresent(days)).toEqual(["main", "second"]);
  });

  it("puts every scene in scope when the view is All", () => {
    const s = scene({ desc: "Drone - 2nd Unit" });
    resolveDayUnits(day([s]));
    expect(sceneInUnit(s, null)).toBe(true);
    expect(sceneInUnit(s, "second")).toBe(true);
    expect(sceneInUnit(s, "main")).toBe(false);
  });
});
