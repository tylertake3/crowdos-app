// On-costs: the money a UK crowd budget owes on top of the artists' fees.
//
// The rate cards in pact.ts / spact.ts price what the ARTIST is paid. That is
// not what the production pays. A line-producer's own sheet for the same week
// carries, on top of the artist fee:
//
//   · agency commission — UK crowd is booked through a casting agency that
//     charges a handling fee on the fees it invoices, commonly 15–20%;
//   · whatever employment on-costs the production carries (these vary with the
//     engagement model, so the engine does NOT encode UK employment law — the
//     user adds them as free-form labelled percentage lines);
//   · contingency, commonly 5–10% of the lot.
//
// Missing that stack is why the headline number read 15–20% light.
//
// EVERYTHING HERE DEFAULTS TO ZERO / OFF. An existing production's totals do
// not move by a penny until the user sets a percentage.
//
// Money rules (money.ts): percentages settle to the penny per DAY, and the day
// total is the sum of already-settled components — so the day column still
// foots exactly to the grand total.

import { round2, sumMoney } from "./money";

// ---------------------------------------------------------------------------
// 1. Uplift stack
// ---------------------------------------------------------------------------

/** One free-form uplift line the user names themselves ("Employer NI",
 *  "Payroll admin", "Costume handling"). `pct` is a PERCENTAGE: 13.8 = 13.8%. */
export interface UpliftLine {
  label: string;
  pct: number;
}

/**
 * The uplift stack. All percentages are PERCENT numbers (17.5 = 17.5%), not
 * fractions — unlike PactSettings.hol, which is a fraction because that is how
 * the holiday rule is written on the card.
 */
export interface UpliftSettings {
  /** agency handling fee, charged on the artist cost. 0 / absent = none. */
  agencyPct?: number;
  /** contingency, charged on the subtotal (artist + agency + additional). */
  contingencyPct?: number;
  /** user-named extra on-cost lines, each charged on the artist cost. */
  additional?: UpliftLine[];
}

export const UPLIFT_DEFAULTS: UpliftSettings = {
  agencyPct: 0,
  contingencyPct: 0,
  additional: [],
};

/** One day's uplift, broken out so the UI can print
 *  "artist cost / agency / <named lines> / contingency / total". */
export interface DayUplift {
  /** the artist cost the percentages were charged on (incl. meal penalties) */
  base: number;
  agency: number;
  /** each user-named line, with the percentage that produced it */
  additional: { label: string; pct: number; amt: number }[];
  additionalTotal: number;
  /** artist + agency + additional — what contingency is charged on */
  subtotal: number;
  contingency: number;
  /** agency + additional + contingency — what the uplift stack ADDS */
  total: number;
  /** base + total — the all-in day figure */
  grand: number;
}

const pct = (n: number | undefined): number => (Number.isFinite(n) ? (n as number) : 0);

/** A percentage of a settled amount, settled to the penny. */
export function pctOf(amount: number, percent: number | undefined): number {
  const p = pct(percent);
  if (!p) return 0;
  return round2(round2(amount) * (p / 100));
}

/**
 * ORDER OF APPLICATION — explicit, because the order changes the number.
 *
 *   1. artist cost  (rate card + supplementary fees + meal penalties)
 *   2. agency commission  = agencyPct  × artist cost
 *   3. each additional line = its pct   × artist cost   (NOT compounded on
 *      the agency fee, and never on each other)
 *   4. subtotal = 1 + 2 + 3
 *   5. contingency = contingencyPct × subtotal
 *
 * Reasoning:
 *  · An agency invoices its handling fee on the fees it pays out — the artist
 *    cost — not on the production's own on-costs. Charging commission on top
 *    of an employer-NI line would invent money nobody bills.
 *  · Employment on-costs are likewise assessed on what the ARTIST is paid, so
 *    they sit beside the commission on the same base rather than on top of it.
 *    Both being flat on the same base also makes them commutative: the order
 *    the user happens to add their lines in cannot change the total.
 *  · Contingency is a buffer against the production's COMMITTED spend, and the
 *    production is committed to the agency fee too — so it is the only line
 *    charged on the subtotal. This is the conservative reading, and matches
 *    how a contingency line sits at the bottom of a budget page.
 *
 * A user who wants commission compounded on an on-cost can express it as a
 * single combined percentage; there is no way back from an over-stated number.
 */
export function computeUplift(
  artistCost: number,
  u: UpliftSettings | undefined
): DayUplift {
  const base = round2(artistCost);
  const agency = pctOf(base, u?.agencyPct);
  const additional = (u?.additional ?? [])
    .filter((l) => l && pct(l.pct) !== 0)
    .map((l) => ({
      label: (l.label || "Additional").trim() || "Additional",
      pct: pct(l.pct),
      amt: pctOf(base, l.pct),
    }));
  const additionalTotal = sumMoney(...additional.map((l) => l.amt));
  const subtotal = sumMoney(base, agency, additionalTotal);
  const contingency = pctOf(subtotal, u?.contingencyPct);
  const total = sumMoney(agency, additionalTotal, contingency);
  return {
    base,
    agency,
    additional,
    additionalTotal,
    subtotal,
    contingency,
    total,
    grand: sumMoney(base, total),
  };
}

/** TRUE when the stack would change any number at all. */
export function upliftInForce(u: UpliftSettings | undefined): boolean {
  if (!u) return false;
  return (
    pct(u.agencyPct) !== 0 ||
    pct(u.contingencyPct) !== 0 ||
    (u.additional ?? []).some((l) => pct(l?.pct) !== 0)
  );
}

const pctText = (p: number) => `${round2(p)}%`;

/**
 * Plain-English provenance for the uplift stack — one line per uplift in
 * force, for the on-screen provenance bar and every export footer. Returns a
 * single "no uplifts" line when nothing is set, so a budget can always state
 * what it does and does not include.
 */
export function upliftProvenanceLines(u: UpliftSettings | undefined): string[] {
  if (!upliftInForce(u)) {
    return [
      "No uplifts applied: artist fees only — no agency commission, on-costs or contingency.",
    ];
  }
  const out: string[] = [];
  if (pct(u!.agencyPct))
    out.push(
      `Agency commission ${pctText(u!.agencyPct!)}, charged on the artist cost (rate card, supplementary fees and meal penalties).`
    );
  for (const l of u!.additional ?? []) {
    if (!pct(l?.pct)) continue;
    out.push(
      `${(l.label || "Additional").trim() || "Additional"} ${pctText(l.pct)}, charged on the artist cost.`
    );
  }
  if (pct(u!.contingencyPct))
    out.push(
      `Contingency ${pctText(u!.contingencyPct!)}, charged on the subtotal (artist cost plus commission and on-costs).`
    );
  return out;
}

// ---------------------------------------------------------------------------
// 2. Meal penalties
// ---------------------------------------------------------------------------
//
// The rates were already on the card (RATE-ENGINE-NOTES.md: "short or late
// lunch £23.38 day / £35.08 night") but could only be used in the standalone
// day calculator, so they never reached a budget. They are paid PER HEAD, and
// a late lunch on a 200-head day is ~£4,676 in one hit — routine on big crowd
// days, and exactly the kind of money a producer's own sheet carries.

export type MealPenaltyKey = "short" | "late" | "supper";

export const MEAL_PENALTY_KEYS: MealPenaltyKey[] = ["short", "late", "supper"];

export interface MealPenaltyRate {
  label: string;
  day: number;
  night: number;
  /** public-holiday rates. Optional — a card that doesn't print them falls
   *  back to the ordinary day/night figures, which is what the app charged
   *  before public-holiday meal money was on the card at all. */
  phDay?: number;
  phNight?: number;
}

export type MealPenaltySettings = Partial<Record<MealPenaltyKey, MealPenaltyRate>>;

export const MEAL_PENALTY_DEFAULTS: Record<MealPenaltyKey, MealPenaltyRate> = {
  short: {
    label: "Short lunch (meal break under 1 hour)",
    day: 23.38,
    night: 35.08,
    phDay: 35.08,
    phNight: 52.58,
  },
  late: {
    label: "Late lunch (no break within 6 hours of call)",
    day: 23.38,
    night: 35.08,
    phDay: 35.08,
    phNight: 52.58,
  },
  supper: {
    label: "Short supper (no 2nd break within 13 hours of call)",
    day: 23.38,
    night: 35.08,
    phDay: 35.08,
    phNight: 52.58,
  },
};

/** Which penalties a day incurred. Absent / all-false = none, which is the
 *  default and costs nothing. */
export type DayMeals = Partial<Record<MealPenaltyKey, boolean>>;

export interface MealPenaltyCost {
  /** per head, settled to the penny */
  per: number;
  lines: { key: MealPenaltyKey; label: string; per: number }[];
}

/** Meal penalties owed by ONE head on a day, at the day/night rate. */
export function mealPenaltyPerHead(
  meals: DayMeals | undefined,
  shift: "Day" | "Night",
  s: MealPenaltySettings = MEAL_PENALTY_DEFAULTS,
  ph = false
): MealPenaltyCost {
  const lines: { key: MealPenaltyKey; label: string; per: number }[] = [];
  if (meals) {
    for (const key of MEAL_PENALTY_KEYS) {
      if (!meals[key]) continue;
      const rate = s?.[key] ?? MEAL_PENALTY_DEFAULTS[key];
      const night = shift === "Night";
      // a public-holiday rate only applies when the card prints one; without
      // it the ordinary day/night figure stands
      const phRate = night ? rate.phNight : rate.phDay;
      const per = round2(
        (ph && phRate ? phRate : night ? rate.night : rate.day) || 0
      );
      if (!per) continue;
      lines.push({ key, label: rate.label || MEAL_PENALTY_DEFAULTS[key].label, per });
    }
  }
  return { per: sumMoney(...lines.map((l) => l.per)), lines };
}

// ---------------------------------------------------------------------------
// 3. Cancellation of a cut day
// ---------------------------------------------------------------------------
//
// When a revision drops a shoot day the diff reports a clean negative — "you
// saved £38,000". Inside the agency's notice window the production still owes
// most of it, so that clean negative is a confidently wrong number in the one
// place this product is unique. Terms vary by agency and by production, so
// this is OFF by default and the numbers are the user's to state.

export interface CancellationSettings {
  /** cancel this many days or fewer before the shoot date and the charge
   *  applies. 0 / absent = the window never catches anything. */
  noticeDays?: number;
  /** percentage of the day's full cost still payable inside the window
   *  (100 = the whole day). 0 / absent = nothing is charged. */
  pct?: number;
}

export const CANCELLATION_DEFAULTS: CancellationSettings = { noticeDays: 0, pct: 0 };

export interface CancellationCharge {
  /** the day's full cost had it shot (all-in, including uplifts) */
  fullCost: number;
  /** whole days of notice given; null when the day has no usable date */
  daysNotice: number | null;
  withinNotice: boolean;
  noticeDays: number;
  pct: number;
  /** what is still payable */
  charge: number;
  /** what is actually saved by cutting it: fullCost − charge */
  saved: number;
}

/** TRUE when the cancellation terms would charge anything at all. */
export function cancellationInForce(c: CancellationSettings | undefined): boolean {
  return !!c && pct(c.noticeDays) > 0 && pct(c.pct) !== 0;
}

const MS_DAY = 86400000;

/** Whole days from `asOf` to `shootDate` (negative = the date has passed). */
export function noticeDaysBetween(asOf: Date, shootDate: Date): number {
  const a = Date.UTC(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
  const b = Date.UTC(shootDate.getFullYear(), shootDate.getMonth(), shootDate.getDate());
  return Math.round((b - a) / MS_DAY);
}

/**
 * The cancellation charge for one cut day.
 *
 * A day cut with `daysNotice` <= the agreed notice window is charged `pct` of
 * its full cost. A day already in the past is inside the window by definition
 * (you cannot give notice backwards). A day with no usable date is treated as
 * OUTSIDE the window — the engine will not invent a charge it cannot date;
 * `daysNotice: null` marks it so the UI can ask.
 */
export function cancellationCharge(
  fullCost: number,
  daysNotice: number | null,
  s: CancellationSettings | undefined
): CancellationCharge {
  const noticeDays = Math.max(0, pct(s?.noticeDays));
  const percent = pct(s?.pct);
  const full = round2(fullCost);
  const within =
    cancellationInForce(s) && daysNotice !== null && daysNotice <= noticeDays;
  const charge = within ? pctOf(full, percent) : 0;
  return {
    fullCost: full,
    daysNotice,
    withinNotice: within,
    noticeDays,
    pct: percent,
    charge,
    saved: sumMoney(full, -charge),
  };
}

/** One cut day priced for the revision diff. */
export interface CutDayCancellation extends CancellationCharge {
  dayId: string;
  dayNum: number;
  unit: string;
  date: Date | null;
}

export interface CancellationSummary {
  days: CutDayCancellation[];
  /** what the cut days would have cost had they shot */
  fullCost: number;
  /** what is still payable because of the notice window */
  charge: number;
  /** the REAL saving: fullCost − charge. This is the number the diff should
   *  report, not fullCost. */
  saved: number;
  inForce: boolean;
}

/**
 * Price a set of cut days. `costOf` returns a day's all-in cost (typically
 * `costs.perDay[d.id!].cost`); days it cannot price contribute nothing.
 *
 * `asOf` is when notice was given — the upload date of the revision that cut
 * them — and defaults to today.
 */
export function cancellationForCutDays(
  cutDays: { id?: string; num: number; unit?: string; _date?: Date | null }[],
  costOf: (d: { id?: string; num: number; unit?: string }) => number,
  s: CancellationSettings | undefined,
  asOf: Date = new Date()
): CancellationSummary {
  const days: CutDayCancellation[] = [];
  for (const d of cutDays) {
    const full = round2(costOf(d) || 0);
    if (!full) continue;
    const date = d._date instanceof Date && !isNaN(d._date.getTime()) ? d._date : null;
    const notice = date ? noticeDaysBetween(asOf, date) : null;
    days.push({
      ...cancellationCharge(full, notice, s),
      dayId: d.id || (d.unit || "Main") + "|" + d.num,
      dayNum: d.num,
      unit: d.unit || "Main",
      date,
    });
  }
  const fullCost = sumMoney(...days.map((x) => x.fullCost));
  const charge = sumMoney(...days.map((x) => x.charge));
  return {
    days,
    fullCost,
    charge,
    saved: sumMoney(fullCost, -charge),
    inForce: cancellationInForce(s),
  };
}

/** Plain-English provenance for the cancellation terms in force. */
export function cancellationProvenanceLines(
  s: CancellationSettings | undefined
): string[] {
  if (!cancellationInForce(s))
    return [
      "No cancellation terms set: a cut day is reported as a full saving.",
    ];
  return [
    `Cancellation: a day cut ${Math.max(0, pct(s!.noticeDays))} days or fewer before its shoot date is charged at ${pctText(pct(s!.pct))} of its full cost.`,
  ];
}
