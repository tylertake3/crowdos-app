// Shared shapes for the CrowdOS / StuntOS rate engine.
// Ported from prototype_1.html — see RATE-ENGINE-NOTES.md for the locked rules.

export type CastType =
  | "cast"
  | "double"
  | "offCam"
  | "stuntCoord"
  | "stuntPerf"
  | "stuntDbl"
  | "stuntExtra";

export interface CastToken {
  code: string;
  type: CastType;
}

// ---------------------------------------------------------------------------
// Crowd Breakdown import — the requirement line as a first-class object.
//
// A Crowd Breakdown (the document a Crowd 2nd AD builds FROM the schedule)
// carries constructs the schedule parser never sees: DEAD bodies, dummies,
// action vehicles, children, "TBC whether Spact or SA", and continuity
// pointers to other scenes. Five real productions were analysed and every one
// reduces to the same atomic unit:  [qty] [x] <name> [(tag)] [flags]
//
// Rather than a parallel Requirement type, NamedCount IS that unit — every
// field below is optional, so the existing saChars/featured/spacts/extras
// arrays carry breakdown metadata without any existing caller changing.
// Absent metadata means exactly what it meant before: a costable person on
// the tier of whichever array holds it.
// ---------------------------------------------------------------------------

// Tiers that the crowd cost engine prices.
export type CrowdTier = "SA" | "Featured" | "SPACT";
// The full imported taxonomy. Stunt/Child/AV are carried for visibility and
// reconciliation but never priced by the crowd engine (see costableReq).
export type ReqTier = CrowdTier | "Stunt" | "Child" | "AV";
// Not everything in the grid is a person — ADs count vehicles, animals and
// dummies in the same columns. Only `person` can ever cost.
export type ReqUnitType = "person" | "vehicle" | "animal" | "prop";
// 'reference' = imported so totals reconcile and nothing is silently dropped,
// but explicitly outside the crowd budget (stunts, children, action vehicles).
export type ReqBudgetScope = "crowd" | "reference";
// Display/continuity only — a flag never changes a rate.
export type ReqFlag = "dead" | "double" | "dummy" | "weatherCover" | "asAbove";
export type ReqSource = "schedule_import" | "breakdown_import" | "manual";

export interface NamedCount {
  name: string;
  count: number;
  // ---- optional breakdown-import metadata (all additive) ----
  // Explicit tier. Absent = the tier implied by the array holding this row.
  tier?: ReqTier;
  // "6 x St Mabyn's Lobby Mercs (SPACT?)" — tier genuinely unknown in the
  // source. Locked decision: cost at the HIGHER candidate rate with an amber
  // flag, so the budget can only move down when the AD resolves it.
  tierTbc?: boolean;
  tierCandidates?: ReqTier[];
  flags?: ReqFlag[];
  unitType?: ReqUnitType;
  budgetScope?: ReqBudgetScope;
  // Resolved continuity group — same people as another scene, possibly on
  // another day (the ⛓ mechanism).
  cont?: string;
  // Unresolved textual pointer straight from the source ("continuity from
  // alleyway 101/25", CONT column "sc302.16,18"). Never guessed into `cont`:
  // an ambiguous pointer stays here for the AD to confirm, because inventing
  // a target would duplicate bodies and inflate both headcount and cost.
  contRef?: string;
  // Verbatim parenthetical from the source ("all approx 18", "with Guns").
  note?: string;
  // Supplementary fee per head attached to this group (hair/shaving, own
  // clothing, uniforms, lookalike…). Set on the Crowd Breakdown or in the day
  // calculator; this is also how a Featured SA is built — SA rate + fees.
  sup?: number;
  // ---- recurring crowd group (cross-day continuity) ----
  // Links this row to a production-level RecurringGroup (see ScheduleModel.
  // recurringGroups). When set, every appearance of this group across scenes
  // AND days is understood as the SAME people drawn from a fixed pool — so the
  // run's unique-head count is the PEAK (the pool), never the sum, and once-per-
  // run fees are charged a single time on the pool. `count` on this row is that
  // day/scene's QUANTITY drawn from the pool (150, then 50, then 150), and may
  // be smaller than the pool without meaning new people.
  //
  // This is the cross-DAY promotion of the within-day `cont` mechanism: `cont`
  // pools "same people" inside one day; `groupId` pools them across the shoot.
  groupId?: string;
  source?: ReqSource;
}

// Two kinds of supplementary fee a recurring group can carry. The distinction
// only matters because a group is the SAME people across many days:
//  - "onceRun"  charged a single time on the pool across the whole run
//               (costume/wig fitting, wardrobe make-up test). A lighter day
//               that draws fewer heads adds no new fitting — they are already
//               in the pool.
//  - "perDay"   recurs on every day the group works (night premium, meal
//               penalty, action uplift). This is the existing per-head/per-day
//               behaviour and is unchanged.
export interface RecurringGroupFee {
  label: string; //  "Costume fitting", "Night premium"
  amount: number; // £ per head
  kind: "onceRun" | "perDay";
}

// A production-level named cohort attached to scenes by reference (NamedCount.
// groupId). The pool is the people you actually booked; each scene appearance
// draws a quantity from it. See NamedCount.groupId for the counting contract.
export interface RecurringGroup {
  id: string;
  name: string; //  "Hotel Guests", "Bob's Security"
  tier: CrowdTier; // SA | Featured | SPACT — the three costable tiers
  // The booked pool = the maximum number of distinct people this group can put
  // on the floor. Unique heads for the run derive from this (and are validated
  // against the peak per-day quantity actually used).
  poolSize: number;
  // Supplementary fees for the group, split by how they recur (see above).
  fees?: RecurringGroupFee[];
}

// Scene-level status. Weather-cover scenes are deliberately double-scheduled
// by some productions and must not add to a day's totals.
export type SceneStatus =
  | "normal"
  | "toStart"
  | "toComplete"
  | "weatherCover"
  | "pickup";

export interface Scene {
  num: string;
  part: string;
  ie: string;
  slug?: string;
  tod: string;
  scriptDay: string;
  pages: string;
  unit: string;
  desc: string;
  sa: number;
  // Continuity flag for the ANONYMOUS background bucket. `sa` is a bare integer
  // with no row to hang a per-row `asAbove` flag on, so its "same people as an
  // earlier scene" state lives here. Every surface that shows the bucket has to
  // read it, or the day board and the breakdown disagree about the same people.
  saAbove?: boolean;
  veh: number;
  pod: boolean;
  podVeh?: number;
  cast: CastToken[];
  extras?: NamedCount[]; // "Stunt Performers" block (named stunt extras)
  spacts?: NamedCount[];
  saChars?: NamedCount[]; // named SA groups ("20 passersby", "8 airmen") — SA tier
  featured?: NamedCount[]; // only the explicit "Featured Background Actors" — SA rate + supplementary fees
  vehNames?: string[];
  tags: string[];
  // ---- breakdown-import homes for tiers the schedule parser never produces.
  // Both are reference-only: carried so imported totals reconcile and nothing
  // is dropped, never priced by the crowd engine. (Stunts already have
  // `extras`; a stunt's crowd-budget exclusion is asserted per-row via
  // budgetScope, because GoL states "STUNTS ARE NOT A PART OF THE CROWD
  // BUDGET" while still requiring them visible alongside SA and SPACT.)
  children?: NamedCount[]; // LR CHILD column / colour-coded elsewhere
  avs?: NamedCount[]; //      action vehicles ("2 x AV Cars (Action)")
  status?: SceneStatus;
  // WHOLE-SCENE continuity. POP carries a bare "(FROM ABOVE)" in a cell with
  // no requirement lines at all (sc 54B, 76, 91PT) — one cell inherits the
  // entire previous scene's list. That cannot be modelled on a requirement row
  // because there is no row to hang it on, so it lives here.
  //
  // IMPORTANT for anything that consumes this: an inheriting scene is NOT a
  // scene with no crowd. Within one day it needs no materialising — the day's
  // requirement is a peak across scenes, so the same bodies counted once is
  // already the right answer. ACROSS days it must be materialised (or followed)
  // by the importer, or the second day silently under-counts.
  contFrom?: string; // resolved scene id/number this scene's list comes from
  contFromRef?: string; // unresolved source text ("(FROM ABOVE)", "(from above - redressed)")
  // Explicit "N/A" in a requirement cell, as distinct from an empty cell.
  // 'none'    = the AD has affirmatively stated no crowd — a CLOSED item.
  // 'pending' = nobody has filled it in yet — an OPEN item to chase.
  // absent    = the rows on this scene are the statement.
  // A plain count cannot express this: both "confirmed zero" and "not yet
  // known" would be 0, and conflating them either chases settled scenes or
  // budgets an unfilled one at nothing.
  reqStatus?: "none" | "pending";
  // Any source line that did not parse, kept verbatim against its scene for
  // manual triage. Nothing is ever silently dropped.
  unparsed?: string[];
}

export interface ShootDay {
  num: number;
  date: string;
  sr: string;
  ss: string;
  loc: string;
  hours: string;
  type: string;
  cams: string;
  scenes: Scene[];
  pages: string;
  unit?: string; // 'Main' | '2nd', set by prepModel
  id?: string; //  M12 / U3, set by prepModel
  _date?: Date | null; // parsed calendar date, set by prepModel
  // Already-shot history stitched in from the previous revision — mid-shoot
  // schedules only cover the remaining days, but the production keeps its
  // full timeline (and true total spend). Set by the revision-update flow.
  carried?: boolean;
  fromRev?: string; // revision label the day was shot under, e.g. "Blue"
  // ---- breakdown import ----
  // Shoot vs prep. Prep days carry fitting/test/rehearsal calls rather than
  // scenes (PDX tracks 6 prep weeks before SD1). Reserved so the model can
  // hold them; nothing costs them yet, and the review UI must report them as
  // "imported, not costed" rather than omitting them — otherwise an imported
  // breakdown's totals can never be reconciled. NOTE: this is deliberately
  // NOT `type`, which already means Day/Night/CWD on a shoot day.
  phase?: "shoot" | "prep";
  // What KIND of unit this day's record is, not just its name. POP totals
  // Rehearsal / Weather Cover / Splinter as separate buckets in its end-of-
  // shoot footer, which a bare unit name ('Main' | '2nd') cannot reproduce.
  // GoL likewise runs "Main + BRETT UNIT + CHRIS CAM" on one calendar date —
  // one date, several day records, each with its own kind and totals.
  //
  // Deliberately does NOT affect costing: a rehearsal call is genuinely paid
  // under PACT/FAA, whereas weather cover may never be shot, so whether each
  // bucket belongs in the committed total is a rate decision, not a schema
  // one. The field exists so the footer can be reproduced; costing is
  // unchanged until that call is made.
  unitKind?: "main" | "second" | "splinter" | "rehearsal" | "weatherCover" | "reshoot";
  // The document's OWN stated totals for this day, per category, exactly as
  // printed. Kept separately from the derived sums so the review screen can
  // diff them. A non-zero delta is not a parser failure — real breakdowns
  // contain arithmetic errors, and surfacing them is the point.
  declaredTotals?: Partial<Record<ReqTier, number>>;
  // Distinct scene-location banners on this day, in the order they appear.
  // Each is one "location block": the fictional/scene place exactly as the
  // schedule states it (e.g. "FOUR SEASONS HOTEL MOROCCO"), plus the index of
  // the first scene that falls under it. A day that moves between two sets
  // carries two blocks. Set by prepModel; a day with a single banner collapses
  // to one block equal to `loc`. The block's `loc` text is the SCENE location
  // and is never overwritten — the real shooting location is held separately.
  locBlocks?: LocBlock[];
  unparsed?: string[];
}

export interface LocBlock {
  // Scene-location text, verbatim from the schedule (the story-side place).
  loc: string;
  // Index into `scenes` of the first scene under this banner.
  from: number;
}

export interface ScheduleNote {
  type: string;
  text: string;
  afterDay: number | null;
}

export interface ScheduleModel {
  days: ShootDay[];
  castMap: Record<string, string>;
  notes: ScheduleNote[];
  multiUnit?: boolean;
  // ---- breakdown import ----
  source?: ReqSource;
  // From the breakdown's own header: "As per schedule dated 19.02.26". Links a
  // breakdown revision to the schedule revision it was built from, so the two
  // import directions can be diffed against each other.
  sourceScheduleDate?: string;
  // Block/grand totals as printed in the source, for the same reconciliation
  // purpose as ShootDay.declaredTotals.
  declaredTotals?: Partial<Record<ReqTier, number>>;
  // Colour→tier legend read from the document's own key line. Never hardcoded:
  // blue means doubles on one production and SPACT on another. Where a
  // document encodes tiers ONLY in colour and no key is found, rows import as
  // tierTbc for the AD to map, rather than guessing from the colour.
  colourKey?: Record<string, ReqTier>;
  // Production-level registry of recurring crowd groups. Rows reference these by
  // NamedCount.groupId. Persisted per production (not derived from the schedule
  // text), so it survives re-parses and is available to attach anywhere.
  recurringGroups?: RecurringGroup[];
}

// CrowdTier is declared with the requirement model above.
export type TravelBand = "A" | "B";

export interface CharacterRow {
  name: string;
  count: number;
  tier: CrowdTier;
  scene?: string; // scene refs this character belongs to
  sup?: number; //  supplementary fees per head (this is how Featured works)
  // Per-row call/wrap overrides — e.g. zombies called 04:00 for makeup while
  // the rest of the day's crowd is called 08:00. Unset = inherit the day's
  // call/wrap. Overriding one of the pair leaves the other inherited.
  call?: string;
  wrap?: string;
}

// Per-day crowd configuration (call/wrap etc.) — the prototype's CDAY entries.
export interface CrowdDayConfig {
  shift: "Day" | "Night";
  fw: "std" | "cwd";
  ph: boolean; // public holiday
  call: string; // "07:00"
  wrap: string; // "18:00"
  travel: TravelBand;
  chars: CharacterRow[];
  // TRUE while this config was auto-created just to render the day calculator
  // and the user has not changed anything yet. A seeded config must NOT flip
  // the day onto the per-head costing branch: that branch charges overtime the
  // flat unedited branch does not, so merely OPENING a day would raise its cost
  // (measured at +£3,741 on one day before this flag existed).
  //
  // Deliberately checked as `!c.seeded`, so a config saved before this field
  // existed (undefined) still counts as a real user edit and keeps costing
  // exactly as it did.
  seeded?: boolean;
}
