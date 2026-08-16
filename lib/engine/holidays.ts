// UK bank holidays.
//
// The rate cards price a public holiday roughly 50% above a normal day, and
// until now a human had to tick `ph` on the day calculator for every one. Miss
// a bank holiday in the middle of an 80-day schedule and that day is ~50%
// under — silently, on one of the most expensive days in the budget.
//
// THIS TABLE IS ENGLAND & WALES ONLY. Scotland differs (2 Jan, and the
// Summer holiday falls on the FIRST Monday in August, not the last; St
// Andrew's Day is a holiday there and Easter Monday is not), and Northern
// Ireland adds St Patrick's Day and the Twelfth. A production shooting in
// Glasgow must set its public holidays by hand — which is why the auto-flag is
// opt-in (CrowdSettings.autoPublicHolidays, default OFF) and why a user's own
// choice always wins over this table.
//
// Dates are the substitute days as gazetted (e.g. Boxing Day 2026 falls on a
// Saturday, so the holiday is Monday 28 December). Verified against
// gov.uk/bank-holidays for 2026–2028.

/** ISO date (YYYY-MM-DD) → the holiday's name, England & Wales. */
export const UK_BANK_HOLIDAYS_ENGLAND_WALES: Readonly<Record<string, string>> = {
  // ---- 2026 ----
  "2026-01-01": "New Year's Day",
  "2026-04-03": "Good Friday",
  "2026-04-06": "Easter Monday",
  "2026-05-04": "Early May bank holiday",
  "2026-05-25": "Spring bank holiday",
  "2026-08-31": "Summer bank holiday",
  "2026-12-25": "Christmas Day",
  "2026-12-28": "Boxing Day (substitute day)",
  // ---- 2027 ----
  "2027-01-01": "New Year's Day",
  "2027-03-26": "Good Friday",
  "2027-03-29": "Easter Monday",
  "2027-05-03": "Early May bank holiday",
  "2027-05-31": "Spring bank holiday",
  "2027-08-30": "Summer bank holiday",
  "2027-12-27": "Christmas Day (substitute day)",
  "2027-12-28": "Boxing Day (substitute day)",
  // ---- 2028 ----
  "2028-01-03": "New Year's Day (substitute day)",
  "2028-04-14": "Good Friday",
  "2028-04-17": "Easter Monday",
  "2028-05-01": "Early May bank holiday",
  "2028-05-29": "Spring bank holiday",
  "2028-08-28": "Summer bank holiday",
  "2028-12-25": "Christmas Day",
  "2028-12-26": "Boxing Day",
};

/** The years this table actually covers — anything outside it is unknown, not
 *  "not a holiday", and callers that care can say so. */
export const BANK_HOLIDAY_YEARS: readonly number[] = [2026, 2027, 2028];

/** Local-calendar ISO date for a Date — never toISOString(), which shifts a
 *  London midnight in BST back into the previous day. */
export function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** The bank-holiday name for a date, or null. Accepts a Date or an ISO date. */
export function bankHolidayName(
  d: Date | string | null | undefined,
  table: Readonly<Record<string, string>> = UK_BANK_HOLIDAYS_ENGLAND_WALES
): string | null {
  if (!d) return null;
  const key = typeof d === "string" ? d.slice(0, 10) : isNaN(d.getTime()) ? "" : isoDate(d);
  return (key && table[key]) || null;
}

export function isBankHoliday(
  d: Date | string | null | undefined,
  table: Readonly<Record<string, string>> = UK_BANK_HOLIDAYS_ENGLAND_WALES
): boolean {
  return bankHolidayName(d, table) !== null;
}

/** TRUE when the date falls in a year the table covers, so a caller can tell
 *  "not a holiday" apart from "we have no data for 2031". */
export function bankHolidayYearKnown(d: Date | string | null | undefined): boolean {
  if (!d) return false;
  const y =
    typeof d === "string" ? Number(d.slice(0, 4)) : isNaN(d.getTime()) ? NaN : d.getFullYear();
  return BANK_HOLIDAY_YEARS.includes(y);
}
