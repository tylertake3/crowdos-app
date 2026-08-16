// ===========================================================================
// Custom crowd roles — a named role with its own rate card
// ===========================================================================
//
// WHY THIS EXISTS
// The engine shipped with exactly three costing tiers — SA, Featured, SPACT —
// hardcoded through costableReq / effectiveTier / cdPerHead and the totals. A
// stand-in or a picture double could therefore only be modelled as an SA plus
// a supplementary fee, which is not how a production pays or budgets one: a
// stand-in is engaged on its own negotiated day rate, with its own overtime
// and its own travel. Line producers set those up per production, so they
// cannot be another frozen constant — they are user data.
//
// THE BASE SHAPE IS STRUCTURAL, NOT MONETARY
// A role declares `base: "sa" | "spact"`. That choice decides ONLY:
//   · the framework hours of the working day — SA is 9h standard / 7h CWD,
//     SPACT is 10h standard (incl. 1h lunch) / 8h CWD; and
//   · the overtime granularity and the 07:00 framework rule that go with it.
// Those are properties of the AGREEMENT'S DAY, not of the money. A stand-in
// paid £180 still works a PACT-shaped day if that is the day they are on.
//
// Everything monetary belongs to the role: day rate, night rate, holiday,
// overtime day/night, public-holiday bases and OT, early-call travel and the
// Cat A/B travel allowances.
//
// HOLIDAY FOLLOWS THE BASE'S CONVENTION — a role never invents a third one:
//   · base "sa"    → `hol` is a FRACTION (0.1207 = 12.07% of the day rate),
//                    because that is how the PACT/FAA card is written;
//   · base "spact" → `hol` is a FLAT sterling payment in lieu of holiday
//                    (£15.50/day), because that is how the Take 3 card is
//                    written.
//
// DEFAULTS. Every money field except `day` is optional and inherits from the
// live rate card for the role's base. A production with no roles defined is
// byte-identical to the engine before this file existed.
//
// Roles are CROWD-ONLY. They price through the PACT/SPACT day frameworks in
// pact.ts / spact.ts; the stunt engine (stunt.ts) has its own agreement, its
// own weekly/usage/insurance mechanics and no framework hours, so a crowd role
// is meaningless there. See RATE-ENGINE-NOTES.md.

import type { CrowdDayConfig } from "./types";
import {
  PACT,
  PACT_DEFAULTS,
  OTINC,
  pactPerHead,
  pactFrameworkHours,
  type PactSettings,
  type PerHeadBreakdown,
} from "./pact";
import {
  SP3,
  SP3_OT,
  SPACT_DEFAULTS,
  spactPerHead,
  spactFrameworkHours,
  type SpactSettings,
} from "./spact";
import { round2, sumMoney } from "./money";

/** The STRUCTURAL agreement a role's working day is shaped by. Framework hours
 *  and OT mechanics only — never the money. */
export type RoleBase = "sa" | "spact";

/**
 * One user-defined role with its own rate card — "Stand-in", "Picture double",
 * "Photo double", "Driver". Crowd groups and character rows reference it by
 * `id`.
 *
 * `id` must be stable for the life of the production: it is what rows carry.
 * Renaming a role (`label`) is free; changing its `id` orphans every row that
 * points at it (which falls back safely — see crowd.ts).
 */
export interface CustomRole {
  /** stable identity — rows reference this, never the label */
  id: string;
  /** what the budget prints: "Stand-in", "Picture double" */
  label: string;
  /** structural base: framework hours + OT rules (NOT the money) */
  base: RoleBase;

  // ---- the money. Only `day` is required; the rest inherit from the live
  // card for `base` (see roleCardFor for the exact inheritance rules). ----

  /** basic daily rate (day shoot, not a public holiday) */
  day: number;
  /** night basic daily rate. Absent → the day rate scaled by the base card's
   *  own night:day ratio, so a role can never price a night BELOW its day. */
  night?: number;
  /** public-holiday day base. Absent → scaled from `day` the same way. */
  phDay?: number;
  /** public-holiday night base. Absent → scaled from `day` the same way. */
  phNight?: number;
  /** holiday: a FRACTION when base is "sa", a FLAT amount when base is
   *  "spact" (the base's own convention). Absent → the base card's figure. */
  hol?: number;
  /** day overtime per 30 min, holiday-inclusive. Absent → base card. */
  otDay?: number;
  /** night OT & early call per 30 min. Absent → base card. */
  otNight?: number;
  /** day OT per 30 min on a public holiday. Absent → base card. */
  otPhDay?: number;
  /** night OT & early call per 30 min on a public holiday. Absent → base. */
  otPhNight?: number;
  /** early-call travel (called at or before 06:00). Absent → base card. */
  earlyTravel?: number;
  /** travel allowance Cat A (TfL Z1–3). Absent → the PACT card's figure. */
  travelA?: number;
  /** travel allowance Cat B (studios / beyond Z3). Absent → PACT's figure. */
  travelB?: number;
  /** free-form note for the rate-card screen and export footers */
  note?: string;
}

/** The live cards a role inherits its unstated money from. `CrowdSettings`
 *  satisfies this structurally, which is why roles.ts never imports crowd.ts
 *  (and so the two do not form a cycle). */
export interface RoleCards {
  pact: PactSettings;
  spact: SpactSettings;
}

const CARDS_FALLBACK: RoleCards = { pact: PACT_DEFAULTS, spact: SPACT_DEFAULTS };

const num = (v: number | undefined, fallback: number): number =>
  Number.isFinite(v) ? (v as number) : fallback;

/**
 * A rate that the base card states relative to its own day rate — night and
 * public-holiday bases. A role that states £180/day and nothing else must not
 * inherit the SA card's £166.82 night base, which would price its nights BELOW
 * its days. Scaling by the card's own night:day ratio preserves the
 * agreement's relationship and can only ever move the figure the way the card
 * moves it.
 */
function scaledFromDay(dayRate: number, cardDay: number, cardOther: number): number {
  if (!(cardDay > 0)) return round2(cardOther);
  return round2(dayRate * (cardOther / cardDay));
}

/** The PACT-shaped settings a role with base "sa" prices through. */
export function rolePactSettings(
  role: CustomRole,
  cards: RoleCards = CARDS_FALLBACK
): PactSettings {
  const p = cards?.pact ?? PACT_DEFAULTS;
  const day = round2(num(role.day, p.sa));
  const cardDay = p.sa || PACT.dayBDR;
  return {
    sa: day,
    hol: num(role.hol, p.hol),
    otDay: num(role.otDay, p.otDay),
    otNight: num(role.otNight, p.otNight),
    earlyTravel: num(role.earlyTravel, p.earlyTravel),
    travelA: num(role.travelA, p.travelA),
    travelB: num(role.travelB, p.travelB),
    night: num(role.night, scaledFromDay(day, cardDay, p.night ?? PACT.nightBDR)),
    phDay: num(role.phDay, scaledFromDay(day, cardDay, p.phDay ?? PACT.phDay)),
    phNight: num(role.phNight, scaledFromDay(day, cardDay, p.phNight ?? PACT.phNight)),
    otPhDay: num(role.otPhDay, p.otPhDay ?? OTINC.phDay),
    otPhNight: num(role.otPhNight, p.otPhNight ?? OTINC.phNight),
    // framework hours are the base shape's, taken from the live card
    fwStd: p.fwStd,
    fwCwd: p.fwCwd,
  };
}

/** The SPACT-shaped settings a role with base "spact" prices through. Travel
 *  mirrors the PACT card's editable A/B values exactly as cdPerHead does. */
export function roleSpactSettings(
  role: CustomRole,
  cards: RoleCards = CARDS_FALLBACK
): SpactSettings {
  const sp = cards?.spact ?? SPACT_DEFAULTS;
  const p = cards?.pact ?? PACT_DEFAULTS;
  const day = round2(num(role.day, sp.basic));
  const cardDay = sp.basic || SP3.day;
  return {
    basic: day,
    night: num(role.night, scaledFromDay(day, cardDay, sp.night ?? SP3.night)),
    hol: num(role.hol, sp.hol), // FLAT payment in lieu of holiday
    otDay: num(role.otDay, sp.otDay),
    otNight: num(role.otNight, sp.otNight),
    earlyTravel: num(role.earlyTravel, sp.earlyTravel),
    travelA: num(role.travelA, p.travelA),
    travelB: num(role.travelB, p.travelB),
    phDay: num(role.phDay, scaledFromDay(day, cardDay, sp.phDay ?? SP3.phDay)),
    phNight: num(role.phNight, scaledFromDay(day, cardDay, sp.phNight ?? SP3.phNight)),
    otPhDay: num(role.otPhDay, sp.otPhDay ?? SP3_OT.phDay),
    otPhNight: num(role.otPhNight, sp.otPhNight ?? SP3_OT.phNight),
    fwStd: sp.fwStd,
    fwCwd: sp.fwCwd,
  };
}

/** Framework hours for a role's day — the base shape's, never the money's. */
export function roleFrameworkHours(
  fw: "std" | "cwd",
  base: RoleBase,
  cards?: RoleCards
): number {
  return base === "spact"
    ? spactFrameworkHours(fw, cards?.spact)
    : pactFrameworkHours(fw, cards?.pact);
}

/**
 * Per-head cost for one artist on a custom role, on a configured day.
 *
 * Deliberately routed through the SAME pactPerHead / spactPerHead functions
 * the tiers use: the 07:00 framework rule, the 30-minute OT rounding, the
 * 22:00 night-OT switch, early-call blocks, early-call travel and the A/B
 * travel bands are all agreement mechanics, and duplicating them here is
 * exactly the kind of second implementation RATE-ENGINE-NOTES.md forbids.
 */
export function rolePerHead(
  c: CrowdDayConfig,
  role: CustomRole,
  cards: RoleCards = CARDS_FALLBACK
): PerHeadBreakdown {
  return role.base === "spact"
    ? spactPerHead(c, roleSpactSettings(role, cards))
    : pactPerHead(c, "SA", rolePactSettings(role, cards));
}

/**
 * The FLAT per-head figure for a role on an un-priced day — basic + holiday,
 * with NO travel and no overtime. This is the role's analogue of the unedited
 * day's `flatSaPer` / `flatSpactPer`, and it is settled the same way (each
 * component to the penny, then summed) so the two branches stay comparable.
 * Travel is added by the caller at day level, exactly as it is for the tiers.
 */
export function roleFlatPerHead(
  role: CustomRole,
  ph: boolean,
  cards: RoleCards = CARDS_FALLBACK
): number {
  if (role.base === "spact") {
    const s = roleSpactSettings(role, cards);
    const base = round2(ph ? (s.phDay ?? SP3.phDay) : s.basic);
    return sumMoney(base, round2(s.hol)); // flat payment in lieu of holiday
  }
  const s = rolePactSettings(role, cards);
  const base = round2(ph ? (s.phDay ?? PACT.phDay) : s.sa);
  return sumMoney(base, round2(base * s.hol)); // percentage of the day rate
}

/** Look a role up by id. Blank/unknown ids return undefined — the caller is
 *  responsible for falling back to the row's tier and REPORTING it. */
export function findRole(
  roles: CustomRole[] | undefined,
  id: string | undefined
): CustomRole | undefined {
  const key = (id || "").trim();
  if (!key || !roles?.length) return undefined;
  return roles.find((r) => r && r.id === key);
}

/** What a role is called on screen, with a safe fall-back for a role whose
 *  label was left blank. */
export function roleLabelOf(role: CustomRole): string {
  return (role.label || "").trim() || role.id || "Role";
}

/** One role's money on ONE day. INVARIANT (all three costing branches):
 *  `cost === money(perHead, heads) + sup`, so a day line always foots. */
export interface RoleDayTotal {
  roleId: string;
  label: string;
  base: RoleBase;
  /** heads on this role today */
  heads: number;
  /** one artist's settled day BEFORE supplementary fees. Includes travel on
   *  the per-head branches (edited day / budget assumption) and EXCLUDES it on
   *  the flat branch, exactly as the SA/Featured/SPACT subtotals do — there
   *  travel is a day-level line (`DayCost` callers see it in `travel.total`). */
  perHead: number;
  /**
   * The day's travel allowance per head that is NOT already inside `perHead`
   * — zero on the priced branches (where the agreement's own travel is part of
   * the per-head day), and the day's Cat A/B amount on an un-priced day, where
   * travel is charged once at day level on the whole body count.
   *
   * `cost` deliberately excludes it, so the day still foots exactly once. It
   * exists because the TIER per-head figures (`CrowdDayEntry.perHeadBy`)
   * always carry travel: a surface printing a role line beside a tier line —
   * the crowd breakdown document — adds this so the two are comparable, and a
   * stand-in does not read cheaper than an SA by exactly the travel allowance.
   */
  travelPer: number;
  /** all artist money this role costs today: heads × perHead, plus fees */
  cost: number;
  /** supplementary fees inside `cost` */
  sup: number;
  /** the crowd groups on this role today: group name → heads */
  groups: Record<string, number>;
}

/** One role's money across the WHOLE schedule. */
export interface RoleTotal {
  roleId: string;
  label: string;
  base: RoleBase;
  /** days on which this role costs anything */
  days: number;
  /** head-days across the schedule (4 stand-ins on 10 days = 40) */
  heads: number;
  /** the largest headcount this role reaches on any single day */
  maxPerDay: number;
  /** artist money — rates + fees. Inside `CrowdCosts.artistGrand`, and so
   *  inside the base agency commission and contingency are charged on. */
  cost: number;
  sup: number;
}

/** Plain-English provenance for the custom roles a production has defined.
 *  Returns [] when there are none, so nothing is printed by default. */
export function roleProvenanceLines(roles: CustomRole[] | undefined): string[] {
  if (!roles?.length) return [];
  return roles.map(
    (r) =>
      `${roleLabelOf(r)}: own rate card at ${gbp(round2(r.day))}/day, worked on the ${
        r.base === "spact" ? "SPACT" : "SA"
      } day framework (${roleFrameworkHours("std", r.base)}h standard / ${roleFrameworkHours(
        "cwd",
        r.base
      )}h CWD).`
  );
}

const gbp = (n: number): string =>
  "£" + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
