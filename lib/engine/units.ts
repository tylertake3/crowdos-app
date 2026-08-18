// Which UNIT each scene belongs to.
//
// A shoot day is not one crew. The main unit shoots the day's pages while a
// splinter or 2nd unit picks up drone plates, car mounts and establishers
// alongside it, and neither the 1st AD's schedule nor the crowd breakdown gives
// those blocks their own day — they are printed inside the day they run beside,
// under a banner:
//
//   Sc. Est   Establishers of Hotel        "2nd Unit/Splinter Unit -
//                                           (to be filmed durig 16pt1/2)"
//   Sc. 55    Drone - The Blue Car drives along the Driveway - 2nd Unit
//   Sc. 55    Car Mount - The Boys are chasing the Blue Car - 2nd Unit
//
// Read as one list they make a day look like a single crew doing eight things.
// Crowd is booked per unit and priced per unit, so the person building the
// breakdown needs main and 2nd unit apart — and then, at the end, together.
//
// WHY THIS READS SCENES AND DOES NOT SPLIT DAYS
//
// The obvious move is to break the day into two day RECORDS. It is the wrong
// one here: the shooting schedule is the source of truth for structure, and it
// deliberately puts these scenes on this day, on this date, at these hours. A
// second record would invent a day the 1st AD never issued, give it an id that
// day settings and costs then attach to, and put the two halves out of step the
// next time the schedule moved. Tagging the SCENES leaves the schedule's own
// shape untouched and still lets every view be scoped to one unit.
//
// WHAT COUNTS AS A MARKING — and what deliberately does not
//
// Only an explicit unit name on the scene itself: a banner tag against that
// scene, or the unit written into its own description. Nothing is inferred
// from position, because the markings are not reliably block-shaped — on FML
// the weather-cover scene sits directly below the 2nd unit block and belongs
// to neither. And "Rehearsal of Sc 15pt, 16pt will be required beforehand" is a
// note about a rehearsal happening on another day, not a rehearsal scene, so
// rehearsal is never inferred from schedule prose at all. A rehearsal DAY is
// marked by the document's own day banner (ShootDay.unitKind), which is a
// different and unambiguous thing.

import type { Scene, ShootDay } from "./types";

/** The unit streams a scene can belong to. `main` is the default and the vast
 *  majority; everything else is a block running alongside it. */
export type SceneUnit = "main" | "second" | "splinter";

export const SCENE_UNIT_LABEL: Record<SceneUnit, string> = {
  main: "Main unit",
  second: "2nd unit",
  splinter: "Splinter unit",
};

// "2nd Unit", "SECOND UNIT", "2ND UNIT STUNT FILMING TODAY"
const SECOND_RX = /\b(?:2nd|second)\s*unit\b/i;
// "Splinter Unit", "2nd Unit/Splinter Unit"
const SPLINTER_RX = /\bsplinter\s*unit\b/i;
// "Main unit - The Boys are chasing the Man" — an explicit return to main, and
// the reason a scene naming BOTH is read as main: the phrase that wins is the
// one describing this scene, not the block it shoots beside.
const MAIN_RX = /\bmain\s*unit\b/i;

/** Every piece of text on a scene that could carry a unit marking. */
const textOf = (sc: Scene): string[] => [sc.desc || "", ...(sc.tags || [])];

/**
 * The unit ONE scene belongs to.
 *
 * Splinter wins over 2nd where a banner names both ("2nd Unit/Splinter Unit"),
 * because that is the more specific of the two and is what the AD calls it on
 * the floor. An explicit "Main unit" anywhere on the scene beats both — it is
 * how a schedule says "this one is ours" inside a block of second-unit work.
 */
export function sceneUnit(sc: Scene): SceneUnit {
  const texts = textOf(sc);
  if (texts.some((t) => MAIN_RX.test(t))) return "main";
  if (texts.some((t) => SPLINTER_RX.test(t))) return "splinter";
  if (texts.some((t) => SECOND_RX.test(t))) return "second";
  return "main";
}

/**
 * Tag every scene on a day with its unit, in place, and return the day.
 *
 * A day whose scenes ALL belong to one non-main unit is that unit's day
 * outright — schedules do run a whole day of 2nd unit stunt filming, and
 * calling such a day "Main" on the board would be simply untrue. The day's
 * `unitKind` is only filled in where the document has not already stated one:
 * an explicit banner ("REHEARSAL DAY") outranks anything inferred from scenes.
 */
export function resolveDayUnits(d: ShootDay): ShootDay {
  const scenes = d.scenes || [];
  for (const sc of scenes) sc.unit2 = sceneUnit(sc);
  const kinds = new Set(scenes.map((sc) => sc.unit2));
  if (!d.unitKind && scenes.length && !kinds.has("main")) {
    d.unitKind = kinds.has("splinter") ? "splinter" : "second";
  }
  return d;
}

/** Which unit streams a day actually has work in — what a unit switcher offers
 *  for this schedule, so a shoot with no splinter work never shows the tab. */
export function unitsPresent(days: ShootDay[]): SceneUnit[] {
  const seen = new Set<SceneUnit>();
  for (const d of days) for (const sc of d.scenes || []) seen.add(sc.unit2 || "main");
  return (["main", "second", "splinter"] as SceneUnit[]).filter((u) => seen.has(u));
}

/**
 * Is this scene in scope for the unit being viewed? `null` means "All" — the
 * combined view, which is the document the crowd department actually issues at
 * the end and the only place the two units are ever added together.
 */
export function sceneInUnit(sc: Scene, scope: SceneUnit | null): boolean {
  return !scope || (sc.unit2 || "main") === scope;
}
