// Crowd engine: per-head dispatch, per-day cost, and whole-schedule totals.
// All totals derive from the single per-head functions in pact.ts / spact.ts —
// rate maths is never duplicated in views (RATE-ENGINE-NOTES.md).

import type {
  CharacterRow,
  CrowdDayConfig,
  CrowdTier,
  NamedCount,
  RecurringGroup,
  ReqTier,
  ScheduleModel,
  ShootDay,
  TravelBand,
} from "./types";
import {
  pactPerHead,
  pactFrameworkHours,
  PACT,
  PACT_DEFAULTS,
  type PactSettings,
  type PerHeadBreakdown,
} from "./pact";
import {
  spactPerHead,
  spactFrameworkHours,
  SP3,
  SPACT_DEFAULTS,
  type SpactSettings,
} from "./spact";
import { locationBand, UNKNOWN_LOCATION_BAND } from "./location";
import { dayPeakSA, weekKey } from "./model";
import { money, round2, sumMoney } from "./money";
import { carriedDaySuffix } from "./revise";
import {
  computeUplift,
  mealPenaltyPerHead,
  upliftInForce,
  upliftProvenanceLines,
  cancellationProvenanceLines,
  cancellationForCutDays,
  CANCELLATION_DEFAULTS,
  type CancellationSummary,
  MEAL_PENALTY_DEFAULTS,
  UPLIFT_DEFAULTS,
  type CancellationSettings,
  type DayUplift,
  type MealPenaltyCost,
  type MealPenaltySettings,
  type UpliftSettings,
} from "./oncosts";
import { bankHolidayName, bankHolidayYearKnown } from "./holidays";
import {
  findRole,
  rolePerHead,
  roleFlatPerHead,
  roleLabelOf,
  roleProvenanceLines,
  type CustomRole,
  type RoleDayTotal,
  type RoleTotal,
} from "./roles";

export interface CrowdSettings {
  pact: PactSettings;
  spact: SpactSettings;
  // Per-production travel-band overrides from Production Settings → Locations:
  // location name → forced band. Matched case-insensitively as a substring of
  // the day's location text (day locations often list several places).
  bands?: Record<string, TravelBand>;
  // Budget assumptions for UNEDITED days ("assume everyone's on CWD doing
  // 2h over"): days without their own calculator config are costed per-head
  // at these hours instead of the flat day rate. The wrap time anchors on the
  // SA framework, so SPACT (longer framework) correctly accrues less OT for
  // the same unit day. Absent = the old flat-rate default, unchanged.
  baseDay?: { fw: "std" | "cwd"; otHours: number };
  /**
   * Band charged for a location the gazetteer doesn't recognise. Defaults to
   * B — the safer, higher band, so an unlisted location can only make the
   * budget fall when it is identified, never rise. Set to "A" only to
   * reproduce the old (under-budgeting) behaviour.
   */
  unknownBand?: TravelBand;
  /**
   * On-costs charged on top of the artist fees: agency commission,
   * user-named additional percentage lines, and contingency (oncosts.ts).
   * Absent / all-zero — the default — changes nothing.
   */
  uplift?: UpliftSettings;
  /**
   * Meal-penalty rate card. Absent = the 2026 card figures
   * (MEAL_PENALTY_DEFAULTS). Penalties still cost NOTHING until a day
   * actually ticks one (CrowdDayConfig.meals).
   */
  meals?: MealPenaltySettings;
  /**
   * Auto-flag UK (England & Wales) bank holidays as public-holiday days.
   * Default OFF, so nobody's existing numbers move. A day whose config says
   * `phSet` — the user stated it themselves — is NEVER overridden.
   */
  autoPublicHolidays?: boolean;
  /**
   * Agency cancellation terms for a cut day (oncosts.ts). Default OFF: a cut
   * day reads as a full saving, exactly as it did before.
   */
  cancellation?: CancellationSettings;
  /**
   * User-defined roles with their own rate cards — "Stand-in", "Picture
   * double" (roles.ts). An ORDERED LIST, not a keyed map, because the rate-card
   * screen lists them in the order the user created them and a map would lose
   * that; look one up with `findRole(s.roles, id)`.
   *
   * Absent / empty — the default — changes nothing: a row only prices through
   * a role when it names one (`NamedCount.roleId` / `CharacterRow.roleId`).
   */
  roles?: CustomRole[];
}

// The band for a day's location: an override wins over the gazetteer.
export function bandFor(loc: string, s: CrowdSettings): { band: TravelBand; known: boolean } {
  const l = (loc || "").toLowerCase();
  if (s.bands && l) {
    for (const [name, band] of Object.entries(s.bands)) {
      if (name && l.includes(name.toLowerCase())) return { band, known: true };
    }
  }
  const lb = locationBand(loc, s.unknownBand ?? UNKNOWN_LOCATION_BAND);
  return { band: lb.band, known: lb.known };
}

// Defaults are deliberately inert: every on-cost is zero and auto public
// holidays are off, so a production's totals are exactly what they were before
// any of this existed until the user opts in.
export const CROWD_DEFAULTS: CrowdSettings = {
  pact: PACT_DEFAULTS,
  spact: SPACT_DEFAULTS,
  uplift: UPLIFT_DEFAULTS,
  meals: MEAL_PENALTY_DEFAULTS,
  autoPublicHolidays: false,
  cancellation: CANCELLATION_DEFAULTS,
};

export function tierFwHours(c: CrowdDayConfig, tier: CrowdTier): number {
  if (tier === "SPACT") return spactFrameworkHours(c.fw);
  return pactFrameworkHours(c.fw);
}

// ---------------------------------------------------------------------------
// Breakdown-import tolerance.
//
// An imported Crowd Breakdown puts things in the crowd columns that must not
// be priced by the crowd engine: dummies and dogs (not people), action
// vehicles, children, and stunts (explicitly "NOT A PART OF THE CROWD
// BUDGET"). They are imported so that the document's own totals reconcile and
// nothing is silently dropped — dropping them would make an imported
// breakdown irreconcilable — but they never reach a rate card.
//
// A row with no metadata is costable, which is why every pre-existing
// schedule-parsed row behaves exactly as before.
// ---------------------------------------------------------------------------
const COSTING_TIERS: readonly ReqTier[] = ["SA", "Featured", "SPACT"];

/**
 * Whether a requirement row reaches a rate card at all.
 *
 * CUSTOM ROLES. Naming a role is an affirmative statement that this group is
 * engaged and paid on a stated card, so a role makes the row a costing person:
 * it overrides both the `unitType` default and the never-cost tiers
 * (Stunt/Child/AV), which a role deliberately does NOT collide with — the role
 * lives in its own `roleId` field and leaves the imported taxonomy untouched.
 *
 * The ONE thing a role does not override is `budgetScope: "reference"`. That
 * is the user (or the breakdown importer) saying in as many words "this is
 * carried for reconciliation, it is not in the crowd budget" — typically a
 * stunt, which GoL states outright is not part of the crowd budget. Costing it
 * because it also carries a role would double-count it against the department
 * that really pays for it.
 */
export function costableReq(r: NamedCount): boolean {
  const hasRole = !!(r.roleId || "").trim();
  if (r.budgetScope === "reference") return false; //          out of crowd budget
  if (!hasRole) {
    if ((r.unitType ?? "person") !== "person") return false; // dummies, dogs, cars
    if (r.tier && !COSTING_TIERS.includes(r.tier)) return false; // Stunt/Child/AV
  }
  return true;
}

// The tier a row is actually priced on.
//
// "TBC whether Spact or SA" is real and common. Locked decision: cost at the
// HIGHER candidate rate, so resolving the tier can only ever move the budget
// DOWN. The winner is computed from the live rate card rather than assumed,
// because the cards are editable — we compare each candidate's flat per-head
// on a neutral day and take the max.
//
// A row on a LIVE custom role never reaches this: its rate is stated, so there
// is nothing to be TBC about. This function is still what prices such a row if
// its role is ever deleted — which is deliberate, because the tierTbc rule
// then applies to the fall-back exactly as it would have without the role.
export function effectiveTier(
  r: NamedCount,
  fallback: CrowdTier,
  s: CrowdSettings = CROWD_DEFAULTS
): CrowdTier {
  const declared = (r.tier && COSTING_TIERS.includes(r.tier) ? r.tier : fallback) as CrowdTier;
  if (!r.tierTbc) return declared;
  const cands = (r.tierCandidates ?? [declared, "SPACT"]).filter((t): t is CrowdTier =>
    COSTING_TIERS.includes(t)
  );
  if (!cands.length) return declared;
  const neutral: CrowdDayConfig = {
    shift: "Day",
    fw: "cwd",
    ph: false,
    call: "07:00",
    wrap: "18:00",
    travel: "A",
    chars: [],
  };
  let best = cands[0];
  let bestPer = -Infinity;
  for (const t of cands) {
    // supplementary fees are added by the caller's per-head path, not here
    const per = cdPerHead(neutral, t, s).per;
    if (per > bestPer) {
      bestPer = per;
      best = t;
    }
  }
  return best;
}

// The single per-head entry point — dispatches to the right rate card.
export function cdPerHead(
  c: CrowdDayConfig,
  tier: CrowdTier,
  s: CrowdSettings = CROWD_DEFAULTS
): PerHeadBreakdown {
  if (tier === "SPACT") {
    // The SPACT card prints its own travel table, so its own figures win.
    // Only when the card is silent on a band does it fall back to the PACT
    // card's — which is what every settings object saved before the SPACT
    // card carried travel of its own does.
    const spTravelA = s.spact.travelA;
    const spTravelB = s.spact.travelB;
    return spactPerHead(c, {
      ...s.spact,
      travelA: typeof spTravelA === "number" && spTravelA > 0 ? spTravelA : s.pact.travelA,
      travelB: typeof spTravelB === "number" && spTravelB > 0 ? spTravelB : s.pact.travelB,
    });
  }
  return pactPerHead(c, tier, s.pact);
}

export interface DayCost {
  /**
   * The ALL-IN day figure: artist cost + meal penalties + the uplift stack.
   * This is the number the day column prints and the number the grand total
   * sums, so the column still foots exactly. With the default (zero) uplifts
   * and no meal penalties it equals `artistCost`, penny for penny, which is
   * what it has always been.
   */
  cost: number;
  /** rate-card money the ARTISTS are paid: rates + supplementary fees + meal
   *  penalties. The base every uplift percentage is charged on. */
  artistCost: number;
  /** meal-break penalties inside `artistCost` (heads × per-head penalty) */
  mealCost: number;
  /** the per-head meal penalty and its named lines, for the breakdown */
  meals: MealPenaltyCost;
  /** agency / additional / contingency, broken out (all zero by default) */
  uplift: DayUplift;
  sa: number;
  featPD: number;
  spactPD: number;
  feats: Record<string, number>;
  spacts: Record<string, number>;
  saCost: number;
  featCost: number;
  spactCost: number;
  /** supplementary fees inside the day's cost (heads × per-head fee) */
  supCost: number;
  /** the same fees split by tier, so each card can show what it charged */
  supSA: number;
  supFeat: number;
  supSpact: number;
  // ---- custom roles (roles.ts). Empty / zero when none are in use. ----
  /**
   * Heads costed on a custom role today. EXCLUSIVE of `sa` / `featPD` /
   * `spactPD`: a group moved onto a role leaves its tier bucket, so no head is
   * ever counted twice. The day's true headcount is `heads` below.
   */
  roleHeads: number;
  /** their artist money — rates + fees. Inside `artistCost`. */
  roleCost: number;
  /** supplementary fees inside `roleCost` */
  supRole: number;
  /** per-role breakdown, keyed by `CustomRole.id`, so the UI and exports can
   *  print "Stand-in ×4 @ £180" beside the SA/Featured/SPACT lines. */
  roles: Record<string, RoleDayTotal>;
  /** role ids named on this day whose role no longer exists. Those rows were
   *  costed on their TIER (never dropped, never zero) and are listed here so
   *  the UI can say so. Empty is the normal case. */
  missingRoles: string[];
  /** every costing body on the day: sa + featPD + spactPD + roleHeads. This is
   *  what meal penalties and travel are charged on. */
  heads: number;
}

// The effective day config for one character row — a row with a call and/or
// wrap override is priced against those times instead of the day default
// (e.g. zombies called 04:00 for makeup while the rest of the crowd is
// called 08:00). Overriding only one of the pair leaves the other inherited.
export function cdRowConfig(c: CrowdDayConfig, ch: CharacterRow): CrowdDayConfig {
  if (!ch.call && !ch.wrap) return c;
  return { ...c, call: ch.call || c.call, wrap: ch.wrap || c.wrap };
}

// Cost of one configured day across all its character rows.
// Supplementary fees are per head (Featured = SA + sups).
export function cdDayCost(
  c: CrowdDayConfig,
  s: CrowdSettings = CROWD_DEFAULTS
): DayCost {
  let cost = 0, sa = 0, featPD = 0, spactPD = 0;
  let saCost = 0, featCost = 0, spactCost = 0, supCost = 0;
  let supSA = 0, supFeat = 0, supSpact = 0;
  let roleHeads = 0, roleCost = 0, supRole = 0;
  const feats: Record<string, number> = {};
  const spacts: Record<string, number> = {};
  const roles: Record<string, RoleDayTotal> = {};
  const missing = new Set<string>();
  for (const ch of c.chars) {
    const n = +ch.count || 0;
    const sup = round2(+(ch.sup ?? 0) || 0);
    const rowSup = money(sup, n);
    // A row naming a LIVE role prices through that role's own card, on its
    // base shape's framework. A row naming a role that has been deleted falls
    // straight through to its tier below and is reported — never dropped, and
    // never costed at zero.
    const rid = (ch.roleId || "").trim();
    const role = rid ? findRole(s.roles, rid) : undefined;
    if (rid && !role) missing.add(rid);
    if (role) {
      // one artist's settled day rate, then × the headcount (see money.ts)
      const perHead = rolePerHead(cdRowConfig(c, ch), role, s).per;
      const rowCost = money(round2(perHead + sup), n);
      cost += rowCost;
      supCost += rowSup;
      roleHeads += n;
      roleCost += rowCost;
      supRole += rowSup;
      const t = (roles[rid] ||= {
        roleId: rid,
        label: roleLabelOf(role),
        base: role.base,
        heads: 0,
        perHead,
        // a priced day's travel is inside the per-head day already
        travelPer: 0,
        cost: 0,
        sup: 0,
        groups: {},
      });
      t.heads += n;
      t.cost = round2(t.cost + rowCost);
      t.sup = round2(t.sup + rowSup);
      t.groups[ch.name] = (t.groups[ch.name] || 0) + n;
      continue;
    }
    // one artist's settled day rate, then × the headcount (see money.ts)
    const rowPer = round2(cdPerHead(cdRowConfig(c, ch), ch.tier, s).per + sup);
    const rowCost = money(rowPer, n);
    cost += rowCost;
    supCost += rowSup;
    if (ch.tier === "SA") {
      sa += n; saCost += rowCost; supSA += rowSup;
    } else if (ch.tier === "Featured") {
      featPD += n; featCost += rowCost; supFeat += rowSup;
      feats[ch.name] = (feats[ch.name] || 0) + n;
    } else {
      spactPD += n; spactCost += rowCost; supSpact += rowSup;
      spacts[ch.name] = (spacts[ch.name] || 0) + n;
    }
  }
  // Meal penalties are paid per head at the day or night rate, and they are
  // ARTIST money — so they sit inside the base the uplift percentages are
  // charged on, exactly like a supplementary fee. A stand-in on a custom role
  // is a body on the day like any other, so role heads are in this count.
  const heads = sa + featPD + spactPD + roleHeads;
  const meals = mealPenaltyPerHead(c.meals, c.shift, s.meals, !!c.ph);
  const mealCost = money(meals.per, heads);
  const artistCost = sumMoney(round2(cost), mealCost);
  const uplift = computeUplift(artistCost, s.uplift);
  return {
    cost: uplift.grand, artistCost, mealCost, meals, uplift,
    sa, featPD, spactPD, feats, spacts,
    saCost: round2(saCost), featCost: round2(featCost), spactCost: round2(spactCost),
    supCost: round2(supCost), supSA: round2(supSA),
    supFeat: round2(supFeat), supSpact: round2(supSpact),
    roleHeads, roleCost: round2(roleCost), supRole: round2(supRole), roles,
    missingRoles: [...missing].sort(),
    heads,
  };
}

// OT & early-call quantities for the day's SA rows, summed per row. Unlike
// base/holiday (which only depend on day-level shift/PH and so are uniform
// across every SA head), OT and early-call depend on call/wrap — and a row
// with its own override prices differently from the day default. So these
// must be summed row-by-row rather than computed once and multiplied by the
// day's total SA headcount.
function cdSaOtEarly(c: CrowdDayConfig, s: CrowdSettings) {
  let heads = 0, ot = 0, early = 0, otDayB = 0, otNightB = 0, earlyBlocks = 0, earlyTravelHeads = 0;
  for (const ch of c.chars) {
    if (ch.tier !== "SA") continue;
    const n = +ch.count || 0;
    if (!n) continue;
    const p = cdPerHead(cdRowConfig(c, ch), "SA", s);
    heads += n;
    ot += p.ot * n;
    early += (p.earlyPay + p.earlyTravel) * n;
    otDayB += p.otDayB * n;
    otNightB += p.otNightB * n;
    earlyBlocks += p.earlyBlocks * n;
    if (p.earlyTravel > 0) earlyTravelHeads += n;
  }
  return { heads, ot, early, otDayB, otNightB, earlyBlocks, earlyTravel: earlyTravelHeads > 0 };
}

// SA cost composition for a day — used by the views' hover tooltips.
export interface SaComp {
  rates: number;
  hol: number;
  ot: number;
  early: number;
  otPer: number;
  earlyPer: number;
  otDayB: number;
  otNightB: number;
  earlyBlocks: number;
  earlyTravel: boolean;
}

export interface CrowdDayEntry extends DayCost {
  saComp: SaComp;
  saChars: Record<string, number>; // named SA groups this day (name → peak count)
  /** supplementary fee per head, by group name — carried into the calculator */
  supBy: Record<string, number>;
  /**
   * What one head of each tier costs on this day BEFORE supplementary fees —
   * exactly the figure this day's branch priced with, so anything showing a
   * per-line cost agrees with the day total instead of re-deriving rates.
   */
  perHeadBy: { SA: number; Featured: number; SPACT: number };
  travel: { band: string; known: boolean; amt: number; total: number };
  chars: string;
  edited: boolean;
  /**
   * How this day came to be priced as a public holiday (or not).
   * `auto` is TRUE only when the ENGINE set it from the bank-holiday table —
   * the UI must show that differently from a tick the user made, and a user's
   * own choice (`user`) always wins.
   */
  ph: { applied: boolean; auto: boolean; user: boolean; name: string | null };
}

// Whether a day prices as a public holiday, and who decided.
//
// Precedence, in order:
//  1. the user said so on this day's config (`phSet`) — always wins, either way;
//  2. a legacy config with `ph: true` and no `phSet` — an explicit tick made
//     before `phSet` existed, so it is treated as the user's;
//  3. the bank-holiday table, but ONLY when autoPublicHolidays is on.
// The engine never silently overrides a choice; it only fills a blank.
export function resolveDayPh(
  d: Pick<ShootDay, "_date">,
  c: CrowdDayConfig | undefined,
  s: CrowdSettings
): { applied: boolean; auto: boolean; user: boolean; name: string | null } {
  const userSaid = !!c && (c.phSet === true || (c.phSet === undefined && c.ph === true));
  if (userSaid) return { applied: !!c!.ph, auto: false, user: true, name: null };
  const name = s.autoPublicHolidays ? bankHolidayName(d._date ?? null) : null;
  if (name) return { applied: true, auto: true, user: false, name };
  return { applied: !!c?.ph, auto: false, user: false, name: null };
}

/** TRUE when a date sits outside the years the bank-holiday table covers, so
 *  the UI can say "no holiday data for 2031" instead of implying there is
 *  none. */
export function bankHolidayDataMissing(d: Pick<ShootDay, "_date">): boolean {
  return !!d._date && !bankHolidayYearKnown(d._date);
}

export interface CrowdWeek {
  key: string;
  days: number;
  saDays: number;
  featDays: number;
  spactDays: number;
  /** head-days on custom roles this week (0 when none are in use) */
  roleDays: number;
  cost: number;
}

export interface PeopleAgg {
  code: string;
  dayCounts: Map<string, number>;
  heads: number;
  max: number;
}

// A recurring group rolled up across the whole run. The point of the two head
// numbers: `personDays` is the sum of every day's quantity (what you pay, day
// rate × heads × days — unchanged from before) while `uniqueHeads` is the peak
// (the same people drawn from a fixed pool, never re-booked). 150/50/150 →
// personDays 350, uniqueHeads 150.
export interface RunGroupAgg {
  id: string;
  name: string;
  tier: CrowdTier;
  poolSize: number; // as declared on the group
  dayCounts: Map<string, number>; // day id → quantity that day (peak across its scenes)
  personDays: number; // Σ daily quantities — the paid person-days
  peak: number; //       max daily quantity actually used
  uniqueHeads: number; // people booked = max(poolSize, peak); the run's true head count
  // Fees attributed to the group, split by how they recur.
  onceRunTotal: number; // once across the run, on uniqueHeads (fittings, wardrobe)
  perDayFeeTotal: number; // Σ over working days of (perDay fee × that day's quantity)
  feeTotal: number; //      onceRunTotal + perDayFeeTotal
}

export interface CrowdCosts {
  perDay: Record<string, CrowdDayEntry>;
  featPeople: Record<string, PeopleAgg>;
  spactPeople: Record<string, PeopleAgg>;
  // Recurring crowd groups, keyed by group id. Empty when the production defines
  // none — so existing productions are completely unaffected.
  groups: Record<string, RunGroupAgg>;
  // The once-per-run group fees summed across all groups. Added into `grand`
  // (these are real committed spend charged a single time, not per day).
  groupOnceRunTotal: number;
  weeks: CrowdWeek[];
  /** the all-in total: artist cost + meal penalties + uplifts. Always equal
   *  to the sum of the printed day figures. */
  grand: number;
  /** the same total split, so the UI can show
   *  "artist cost / agency / contingency / total" rather than one figure.
   *  With default settings artistGrand === grand and every uplift is 0. */
  artistGrand: number;
  mealGrand: number;
  upliftGrand: {
    agency: number;
    additional: number;
    contingency: number;
    total: number;
  };
  /** days the engine flagged as public holidays from the bank-holiday table
   *  (never days the user ticked) — day id → holiday name. */
  autoPhDays: Record<string, string>;
  /**
   * Whole-schedule totals per custom role, keyed by `CustomRole.id`, so a
   * budget can print "Stand-in ×4 @ £180" as its own line beside the tier
   * lines. Empty when no role is used. Every penny here is ALSO inside
   * `artistGrand` (and therefore inside the base agency commission and
   * contingency were charged on) — it is a breakdown, not an addition.
   */
  roleGrand: Record<string, RoleTotal>;
  /**
   * Role ids that rows still reference but which no longer exist, mapped to
   * the day ids that reference them. Those rows were costed on their TIER —
   * never dropped, never zero — so the total is safe and the UI can offer to
   * re-point or re-create the role. Empty is the normal case.
   */
  missingRoles: Record<string, string[]>;
}

/**
 * Build a day's per-role subtotals for an UNEDITED day from the pooled scene
 * groups. `perHeadOf` is the branch's own per-head figure for the role, so the
 * invariant `cost === money(perHead, heads) + sup` holds on every branch and a
 * printed role line always foots to the day.
 *
 * A role that has been deleted never reaches here — those groups were bucketed
 * onto their tier by `bucket()` and reported in `missingRoles`.
 */
function roleDayTotals(
  roleIds: string[],
  roleGroups: Record<string, Record<string, number>>,
  roleHeadsBy: Record<string, number>,
  roleSupBy: Record<string, number>,
  s: CrowdSettings,
  perHeadOf: (role: CustomRole) => number,
  travelPer = 0
): Record<string, RoleDayTotal> {
  const out: Record<string, RoleDayTotal> = {};
  for (const rid of roleIds) {
    const role = findRole(s.roles, rid);
    if (!role) continue;
    const heads = roleHeadsBy[rid] || 0;
    const sup = roleSupBy[rid] || 0;
    const perHead = round2(perHeadOf(role));
    out[rid] = {
      roleId: rid,
      label: roleLabelOf(role),
      base: role.base,
      heads,
      perHead,
      travelPer: round2(travelPer),
      cost: sumMoney(money(perHead, heads), sup),
      sup,
      groups: { ...roleGroups[rid] },
    };
  }
  return out;
}

// Whole-schedule crowd totals. `dayConfigs` holds per-day overrides keyed by
// `${unit}|${num}` (the prototype's CDAY); days without one use schedule
// defaults: peak SA / featured / SPACT counts costed at flat day rates plus
// holiday and auto-detected travel.
export function computeCrowdCosts(
  model: ScheduleModel,
  dayConfigs: Record<string, CrowdDayConfig> = {},
  s: CrowdSettings = CROWD_DEFAULTS
): CrowdCosts {
  const perDay: Record<string, CrowdDayEntry> = {};
  const featPeople: Record<string, PeopleAgg> = {};
  const spactPeople: Record<string, PeopleAgg> = {};
  const weeks: Record<string, CrowdWeek> = {};
  const autoPhDays: Record<string, string> = {};
  const roleGrand: Record<string, RoleTotal> = {};
  const missingRoles: Record<string, string[]> = {};
  let grand = 0;
  let artistGrand = 0, mealGrand = 0;
  let upAgency = 0, upAdditional = 0, upContingency = 0;

  // Recurring-group registry (production-level) → per-day quantity accumulator.
  // Only populated when the production defines groups, so nothing changes for
  // productions that don't use them.
  const groupDefs = new Map<string, RecurringGroup>(
    (model.recurringGroups || []).map((g) => [g.id, g])
  );
  // group id → (day id → quantity that day, peak across the day's scenes)
  const groupDayQty = new Map<string, Map<string, number>>();

  for (const d of model.days) {
    const saAnon = dayPeakSA(d); // anonymous "N x C" background, peak across scenes
    const feats: Record<string, number> = {};
    const spacts: Record<string, number> = {};
    const saChars: Record<string, number> = {}; // named SA groups
    // Per-group quantity for THIS day: peak of the group's rows across scenes,
    // so the same people in three scenes count once (mirrors the name pooling).
    const groupToday = new Map<string, number>();
    // named groups engaged on a custom role: roleId → group name → peak count
    const roleGroups: Record<string, Record<string, number>> = {};
    const dayMissing = new Set<string>();
    // Supplementary fees ride with the group, not the scene: a wig or a
    // uniform is paid once for the day however many scenes the group is in,
    // so the fee pools on the same identity the head count does.
    const supBy: Record<string, number> = {};
    const supByTier: Record<string, number> = {};
    for (const sc of d.scenes) {
      // weather-cover scenes are deliberately double-scheduled by some
      // productions — they must not add to the day's requirement
      if (sc.status === "weatherCover") continue;
      // An imported row can be a dummy, a dog, a child or a stunt sitting in a
      // crowd column; costableReq keeps those out of every bucket. A row whose
      // tier is TBC is bucketed on its effective (higher-rate) tier, so the
      // budget can only fall when the AD resolves it.
      // A row on a LIVE custom role goes into that role's own bucket instead
      // of a tier bucket — never both, so a stand-in is one body on the day and
      // is not also counted as an SA. A row whose role has been deleted falls
      // back to its tier here and is recorded for reporting.
      const bucket = (f: NamedCount, fallback: CrowdTier) => {
        if (!costableReq(f)) return;
        const rid = (f.roleId || "").trim();
        const role = rid ? findRole(s.roles, rid) : undefined;
        if (rid && !role) dayMissing.add(rid);
        const t = role ? null : effectiveTier(f, fallback, s);
        const into = role
          ? (roleGroups[rid] ||= {})
          : t === "SPACT"
            ? spacts
            : t === "Featured"
              ? feats
              : saChars;
        into[f.name] = Math.max(into[f.name] || 0, f.count);
        // Recurring-group membership: pool this row's quantity into the day's
        // per-group peak. Head counting/costing for the day is unchanged — this
        // only records how many of the group worked today for the run rollup.
        if (f.groupId && groupDefs.has(f.groupId)) {
          groupToday.set(f.groupId, Math.max(groupToday.get(f.groupId) || 0, f.count));
        }
        const sup = +(f.sup ?? 0) || 0;
        if (sup) {
          supBy[f.name] = Math.max(supBy[f.name] || 0, sup);
          // costing is keyed by bucket AND name: the same character name can
          // appear on two tiers, and a fee set on one must not charge the other
          const sk = (role ? "role:" + rid : t) + "|" + f.name;
          supByTier[sk] = Math.max(supByTier[sk] || 0, sup);
        }
      };
      for (const f of sc.saChars || []) bucket(f, "SA");
      for (const f of sc.featured || []) bucket(f, "Featured");
      for (const f of sc.spacts || []) bucket(f, "SPACT");
      // children and action vehicles are reference-only by construction and
      // never enter any costing bucket (see types.ts)
    }
    // named SAs count in the SA bucket at the SA rate (a character name does
    // not make someone Featured — Featured is a rare SA + supplementary fees)
    const saNamedPD = Object.values(saChars).reduce((a, n) => a + n, 0);
    const sa = saAnon + saNamedPD;
    const featPD = Object.values(feats).reduce((a, n) => a + n, 0);
    const spactPD = Object.values(spacts).reduce((a, n) => a + n, 0);
    // Role heads are NAMED groups, so they add on top of the anonymous
    // "N x C" peak exactly as a named SA group does — assigning a role MOVES a
    // group out of its tier bucket rather than duplicating it, and the
    // anonymous background peak is untouched either way.
    const roleIds = Object.keys(roleGroups);
    const roleHeadsBy: Record<string, number> = {};
    for (const rid of roleIds)
      roleHeadsBy[rid] = Object.values(roleGroups[rid]).reduce((a, n) => a + n, 0);
    const rolePD = roleIds.reduce((a, rid) => a + roleHeadsBy[rid], 0);
    // fees the day owes, per bucket, on the pooled counts
    const supOf = (m: Record<string, number>, tier: string): number =>
      round2(
        Object.entries(m).reduce(
          (a, [n, ct]) => a + money(supByTier[tier + "|" + n] || 0, ct),
          0
        )
      );
    const saSup = supOf(saChars, "SA");
    const featSup = supOf(feats, "Featured");
    const spactSup = supOf(spacts, "SPACT");
    const roleSupBy: Record<string, number> = {};
    for (const rid of roleIds) roleSupBy[rid] = supOf(roleGroups[rid], "role:" + rid);
    const roleSupTotal = sumMoney(...roleIds.map((rid) => roleSupBy[rid]));
    const supTotal = sumMoney(saSup, featSup, spactSup, roleSupTotal);

    const c = dayConfigs[cdayKey(d)];
    if (!c && !sa && !featPD && !spactPD && !rolePD) continue;
    const phInfo = resolveDayPh(d, c, s);

    let entry: CrowdDayEntry;
    // A merely-seeded config (calculator opened, nothing changed) is ignored for
    // costing — see CrowdDayConfig.seeded. Legacy configs have no flag and so
    // still take this branch.
    if (c && !c.seeded) {
      // The day is priced on its config, with `ph` resolved first: the user's
      // own choice if they made one, otherwise the bank-holiday table when
      // auto-PH is switched on. `c` itself is never mutated.
      const cEff = phInfo.applied === !!c.ph ? c : { ...c, ph: phInfo.applied };
      const r = cdDayCost(cEff, s);
      if (!r.sa && !r.featPD && !r.spactPD && !r.roleHeads) continue;
      const tAmt =
        c.travel === "A" ? s.pact.travelA : c.travel === "B" ? s.pact.travelB : 0;
      const headsE = r.heads;
      const p = cdPerHead(cEff, "SA", s);
      const agg = cdSaOtEarly(cEff, s);
      entry = {
        ...r,
        saComp: {
          rates: money(p.base, r.sa),
          hol: money(p.hol, r.sa),
          ot: round2(agg.ot),
          early: round2(agg.early),
          otPer: agg.heads ? round2(agg.ot / agg.heads) : p.ot,
          earlyPer: agg.heads ? round2(agg.early / agg.heads) : round2(p.earlyPay + p.earlyTravel),
          otDayB: agg.otDayB,
          otNightB: agg.otNightB,
          earlyBlocks: agg.earlyBlocks,
          earlyTravel: agg.earlyTravel,
        },
        saChars: {},
        perHeadBy: {
          SA: p.per,
          Featured: p.per, // Featured = SA rate + fees
          SPACT: cdPerHead(cEff, "SPACT", s).per,
        },
        // an edited day carries its fees on its own character rows
        supBy: Object.fromEntries(
          c.chars.filter((x) => +(x.sup ?? 0) > 0).map((x) => [x.name, +(x.sup ?? 0)])
        ),
        chars: c.chars
          .map((x) => x.name + (x.count > 1 ? " ×" + x.count : ""))
          .join(", "),
        travel: { band: c.travel, known: true, amt: round2(tAmt), total: money(tAmt, headsE) },
        edited: true,
        ph: phInfo,
      };
    } else if (s.baseDay) {
      // production-level budget assumption: cost unedited days per-head at
      // the assumed hours (07:00 start; wrap = SA framework + OT hours)
      const lb = bandFor(d.loc, s);
      const fwH = pactFrameworkHours(s.baseDay.fw);
      const wrapH = 7 + fwH + Math.max(0, s.baseDay.otHours || 0);
      const cfg: CrowdDayConfig = {
        shift: "Day", fw: s.baseDay.fw, ph: phInfo.applied,
        call: "07:00",
        wrap: `${String(Math.floor(wrapH) % 24).padStart(2, "0")}:${String(Math.round((wrapH % 1) * 60)).padStart(2, "0")}`,
        travel: lb.band, chars: [],
      };
      const saP = cdPerHead(cfg, "SA", s);
      const spP = cdPerHead(cfg, "SPACT", s);
      const heads = sa + featPD + spactPD + rolePD;
      // Featured = SA rate + the supplementary fees set on the group
      const saCost = sumMoney(money(saP.per, sa), saSup);
      const featCost = sumMoney(money(saP.per, featPD), featSup);
      const spactCost = sumMoney(money(spP.per, spactPD), spactSup);
      // Roles price on the same assumed day, through their own card and their
      // base shape's framework — so a SPACT-based role correctly accrues less
      // OT than an SA-based one for the same assumed unit day.
      const roles = roleDayTotals(roleIds, roleGroups, roleHeadsBy, roleSupBy, s, (role) =>
        rolePerHead(cfg, role, s).per
      );
      const roleCost = sumMoney(...Object.values(roles).map((t) => t.cost));
      // An unedited day has no meal penalties (nobody has said it ran one),
      // but it does carry the production's uplift stack.
      const artistCost = sumMoney(saCost, featCost, spactCost, roleCost);
      const uplift = computeUplift(artistCost, s.uplift);
      entry = {
        sa, feats, spacts, featPD, spactPD,
        cost: uplift.grand,
        artistCost, mealCost: 0, meals: { per: 0, lines: [] }, uplift,
        saCost, featCost, spactCost,
        supCost: supTotal, supSA: saSup, supFeat: featSup, supSpact: spactSup, supBy,
        roleHeads: rolePD, roleCost, supRole: roleSupTotal, roles,
        missingRoles: [...dayMissing].sort(), heads,
        perHeadBy: { SA: saP.per, Featured: saP.per, SPACT: spP.per },
        saComp: {
          rates: money(saP.base, sa),
          hol: money(saP.hol, sa),
          ot: money(saP.ot, sa),
          early: money(saP.earlyPay + saP.earlyTravel, sa),
          otPer: saP.ot,
          earlyPer: round2(saP.earlyPay + saP.earlyTravel),
          otDayB: saP.otDayB,
          otNightB: saP.otNightB,
          earlyBlocks: saP.earlyBlocks,
          earlyTravel: saP.earlyTravel > 0,
        },
        saChars,
        chars: "",
        travel: { band: lb.band, known: lb.known, amt: saP.travel, total: money(saP.travel, heads) },
        edited: false,
        ph: phInfo,
      };
    } else {
      const lb = bandFor(d.loc, s);
      const tAmt = round2(lb.band === "B" ? s.pact.travelB : s.pact.travelA);
      const heads = sa + featPD + spactPD + rolePD;
      // one artist's flat day, settled to the penny, then × heads.
      // A bank holiday (only ever auto-set here — an unedited day has no
      // config to tick) swaps in the public-holiday base on both cards, which
      // is the whole point: an unflagged bank holiday budgets ~50% under.
      const saBase = round2(phInfo.applied ? (s.pact.phDay ?? PACT.phDay) : s.pact.sa);
      const spactBase = round2(phInfo.applied ? (s.spact.phDay ?? SP3.phDay) : s.spact.basic);
      const flatSaPer = sumMoney(saBase, round2(saBase * s.pact.hol));
      const flatSpactPer = sumMoney(spactBase, round2(s.spact.hol));
      const saCost = sumMoney(money(flatSaPer, sa), saSup);
      const featCost = sumMoney(money(flatSaPer, featPD), featSup); // Featured = SA rate + fees
      const spactCost = sumMoney(money(flatSpactPer, spactPD), spactSup);
      // A role's flat day is its own basic + its base's holiday convention.
      // Travel is added once at day level below, on `heads`, which includes
      // role heads — exactly as it does for the tiers.
      const roles = roleDayTotals(
        roleIds, roleGroups, roleHeadsBy, roleSupBy, s,
        (role) => roleFlatPerHead(role, phInfo.applied, s),
        // travel is charged once at day level on this branch, so it is
        // reported beside the per-head figure rather than inside it
        tAmt
      );
      const roleCost = sumMoney(...Object.values(roles).map((t) => t.cost));
      const artistCost = sumMoney(
        saCost, featCost, spactCost, roleCost, money(tAmt, heads)
      );
      const uplift = computeUplift(artistCost, s.uplift);
      entry = {
        sa, feats, spacts, featPD, spactPD,
        cost: uplift.grand,
        artistCost, mealCost: 0, meals: { per: 0, lines: [] }, uplift,
        saCost, featCost, spactCost,
        supCost: supTotal, supSA: saSup, supFeat: featSup, supSpact: spactSup, supBy,
        roleHeads: rolePD, roleCost, supRole: roleSupTotal, roles,
        missingRoles: [...dayMissing].sort(), heads,
        perHeadBy: {
          SA: sumMoney(flatSaPer, tAmt),
          Featured: sumMoney(flatSaPer, tAmt),
          SPACT: sumMoney(flatSpactPer, tAmt),
        },
        saComp: {
          rates: money(saBase, sa),
          hol: money(round2(saBase * s.pact.hol), sa),
          ot: 0,
          early: 0,
          otPer: 0,
          earlyPer: 0,
          otDayB: 0,
          otNightB: 0,
          earlyBlocks: 0,
          earlyTravel: false,
        },
        saChars,
        chars: "",
        travel: { band: lb.band, known: lb.known, amt: tAmt, total: money(tAmt, heads) },
        edited: false,
        ph: phInfo,
      };
    }

    if (entry.ph.auto && d.id) autoPhDays[d.id] = entry.ph.name || "Bank holiday";
    perDay[d.id!] = entry;
    // The grand total is the sum of the day figures the user can see, so the
    // column always foots to the total. It is not a separate, more precise sum
    // that the printed days merely approximate.
    grand = round2(grand + entry.cost);
    // The split totals are accumulated the same way — each is the sum of the
    // per-day figures the UI can print, so "artist + agency + on-costs +
    // contingency" foots to the grand total exactly.
    artistGrand = round2(artistGrand + entry.artistCost);
    mealGrand = round2(mealGrand + entry.mealCost);
    upAgency = round2(upAgency + entry.uplift.agency);
    upAdditional = round2(upAdditional + entry.uplift.additionalTotal);
    upContingency = round2(upContingency + entry.uplift.contingency);

    // Record each recurring group's quantity for this costed day (a day skipped
    // above never gets here, so groups only accrue on days that actually work).
    for (const [gid, qty] of groupToday) {
      if (qty <= 0) continue;
      let m = groupDayQty.get(gid);
      if (!m) groupDayQty.set(gid, (m = new Map()));
      m.set(d.id!, qty);
    }

    for (const [name, count] of Object.entries(entry.feats)) {
      const p = (featPeople[name] ||= { code: name, dayCounts: new Map(), heads: 0, max: 0 });
      p.dayCounts.set(d.id!, count);
      p.heads += count;
      p.max = Math.max(p.max, count);
    }
    for (const [name, count] of Object.entries(entry.spacts)) {
      const p = (spactPeople[name] ||= { code: name, dayCounts: new Map(), heads: 0, max: 0 });
      p.dayCounts.set(d.id!, count);
      p.heads += count;
      p.max = Math.max(p.max, count);
    }

    // Per-role schedule totals — a breakdown of artistGrand, never an addition
    // to it. Kept beside the tier totals so a budget can print its own line
    // for "Stand-in" the way it prints one for SPACT.
    for (const t of Object.values(entry.roles)) {
      const g = (roleGrand[t.roleId] ||= {
        roleId: t.roleId,
        label: t.label,
        base: t.base,
        days: 0,
        heads: 0,
        maxPerDay: 0,
        cost: 0,
        sup: 0,
      });
      g.label = t.label; // the live label always wins
      g.days++;
      g.heads += t.heads;
      g.maxPerDay = Math.max(g.maxPerDay, t.heads);
      g.cost = round2(g.cost + t.cost);
      g.sup = round2(g.sup + t.sup);
    }
    for (const rid of entry.missingRoles) {
      (missingRoles[rid] ||= []).push(d.id!);
    }

    const wk = d._date ? weekKey(d._date) : "w?";
    const w = (weeks[wk] ||= {
      key: wk, days: 0, saDays: 0, featDays: 0, spactDays: 0, roleDays: 0, cost: 0,
    });
    w.days++;
    w.saDays += entry.sa;
    w.featDays += entry.featPD;
    w.spactDays += entry.spactPD;
    w.roleDays += entry.roleHeads;
    w.cost = round2(w.cost + entry.cost);
  }

  // ---- roll recurring groups up across the whole run ----
  // personDays = Σ daily quantities (what you pay — already in `grand` via the
  // per-day branches). uniqueHeads = the peak / declared pool (who you booked).
  // Group fees split by kind: onceRun charged a single time on uniqueHeads;
  // perDay charged on each working day's quantity. Only the onceRun total is
  // ADDED to grand here — perDay fees are surfaced for the panel but assumed to
  // already ride on the day rows' own `sup` where set, so they are not double
  // charged into grand.
  const groups: Record<string, RunGroupAgg> = {};
  let groupOnceRunTotal = 0;
  for (const g of groupDefs.values()) {
    const dayCounts = groupDayQty.get(g.id) || new Map<string, number>();
    let personDays = 0;
    let peak = 0;
    for (const qty of dayCounts.values()) {
      personDays += qty;
      peak = Math.max(peak, qty);
    }
    const uniqueHeads = Math.max(g.poolSize || 0, peak);
    const onceRunPer = (g.fees || [])
      .filter((f) => f.kind === "onceRun")
      .reduce((a, f) => a + (+f.amount || 0), 0);
    const perDayPer = (g.fees || [])
      .filter((f) => f.kind === "perDay")
      .reduce((a, f) => a + (+f.amount || 0), 0);
    const onceRunTotal = onceRunPer * uniqueHeads;
    const perDayFeeTotal = perDayPer * personDays;
    groupOnceRunTotal += onceRunTotal;
    groups[g.id] = {
      id: g.id,
      name: g.name,
      tier: g.tier,
      poolSize: g.poolSize || 0,
      dayCounts,
      personDays,
      peak,
      uniqueHeads,
      onceRunTotal,
      perDayFeeTotal,
      feeTotal: onceRunTotal + perDayFeeTotal,
    };
  }
  grand += groupOnceRunTotal;

  return {
    perDay,
    featPeople,
    spactPeople,
    groups,
    groupOnceRunTotal,
    weeks: Object.values(weeks).sort((a, b) => a.key.localeCompare(b.key)),
    grand,
    artistGrand,
    mealGrand,
    upliftGrand: {
      agency: upAgency,
      additional: upAdditional,
      contingency: upContingency,
      total: sumMoney(upAgency, upAdditional, upContingency),
    },
    autoPhDays,
    roleGrand,
    missingRoles,
  };
}

/**
 * Plain-English provenance for everything that sits on top of the rate cards —
 * uplifts, meal-penalty rates, auto public holidays and cancellation terms.
 * The provenance bar and every export footer print these verbatim, so a budget
 * always states what it does and does not include.
 */
export function crowdProvenanceLines(s: CrowdSettings = CROWD_DEFAULTS): string[] {
  const out = [...upliftProvenanceLines(s.uplift)];
  out.push(
    s.autoPublicHolidays
      ? "Public holidays: UK (England & Wales) bank holidays are flagged automatically; Scotland and Northern Ireland differ and a day you set yourself always wins."
      : "Public holidays: set by hand on each day — bank holidays are not flagged automatically."
  );
  out.push(...cancellationProvenanceLines(s.cancellation));
  // Only printed when the production has actually defined roles, so a budget
  // with none reads exactly as it did before.
  out.push(...roleProvenanceLines(s.roles));
  return out;
}

/** TRUE when any on-cost setting would move a number away from the artist
 *  fees alone — the one check a UI needs before showing the uplift split. */
export function crowdUpliftsInForce(s: CrowdSettings = CROWD_DEFAULTS): boolean {
  return upliftInForce(s.uplift);
}

/**
 * What cutting these days ACTUALLY saves.
 *
 * The revision diff reports a cut day as a clean negative — "you saved
 * £38,000". Inside the agency's notice window the production still owes most
 * of that, so the clean negative is a confidently wrong number. Feed the
 * diff's `cutDays` and the OLD revision's costs (the days no longer exist in
 * the new one, so only the old costing can price them) and report
 * `summary.saved` as the movement, with `summary.charge` shown beside it.
 *
 * With no cancellation terms set — the default — `charge` is 0 and `saved`
 * equals the full cost, which is exactly what the diff said before.
 */
export function cutDayCancellations(
  cutDays: ShootDay[],
  oldCosts: CrowdCosts,
  s: CrowdSettings = CROWD_DEFAULTS,
  asOf: Date = new Date()
): CancellationSummary {
  return cancellationForCutDays(
    cutDays,
    (d) => (d.id ? oldCosts.perDay[d.id]?.cost || 0 : 0),
    s.cancellation,
    asOf
  );
}

export function cdayKey(
  d: Pick<ShootDay, "unit" | "num"> & Partial<Pick<ShootDay, "collided" | "fromRev">>
): string {
  const base = (d.unit || "Main") + "|" + d.num;
  // A collided already-shot day is stitched back in under the SAME unit and
  // number as a live day in the new schedule — that reuse is what made it a
  // collision. Without the revision suffix the two share one config key, so the
  // shot day is priced with the live day's crowd numbers (or vice versa) and one
  // of the two silently disappears from the day column. This must stay in step
  // with cdayPlain() in lib/board/app.js, which keys the stored config.
  return d.collided ? base + "-" + carriedDaySuffix(d, "") : base;
}
