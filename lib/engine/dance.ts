// ============================================================
// Dance — Equity TV Agreement (PACT TV) 2026, weekly engagement model
// ============================================================
// Faithful port of Take 3's dance rate calculator
// (take3-dancecalculator.netlify.app) — same constants, same day rules,
// same weekly composition. Minimum rates; negotiate upwards.
//
// Model shape: a WEEK is the unit. One shoot day = One Day Engagement fee;
// 2+ shoot days = weekly Engagement fee, each further shoot day a Production
// Day fee. Usage/buy-out applies to shoot fees only. Rehearsals & fittings
// sit outside the shoot days (no usage). Holiday pay per day attended.
// Overtime is per shoot day: 30-min blocks or part, first 2 hrs at the
// standard rate, beyond that (or any night work) enhanced; night work adds a
// flat payment; dawn calls (04:00–05:00) cap basic hours at 5.

export interface DanceRates {
  engBroadcast: number; //  Engagement Fee — per week (2+ shoot days)
  engSVOD: number; //       Appendix TL SVOD Engagement Fee
  oneBroadcast: number; //  One Day Engagement Fee — single shoot day
  oneSVOD: number; //       SVOD One Day Engagement Fee
  prodDay: number; //       each further shoot day in the week
  rehearsal: number; //     rehearsal period day T(14)
  fitting: number; //       fitting — same as production day fee
  holidayPay: number; //    per day of attendance T(27)
  otStd: number; //         per 30 min or part, first 2 hrs T(22)2
  otEnh: number; //         per 30 min beyond 2 hrs, or night work T(22)3
  nightStd: number; //      beyond midnight / before 04:00 T(21)8
  seventh: number; //       7th day payment
  travelHr: number; //      T(44)2 per hour of travel time (max 2)
  mileage: number; //       per mile
  penDefer: number;
  penCurtail: number;
  penRest: number;
}

export const DANCE_2026: DanceRates = {
  engBroadcast: 635.5,
  engSVOD: 848.0,
  oneBroadcast: 402.0,
  oneSVOD: 474.5,
  prodDay: 70.0,
  rehearsal: 132.5,
  fitting: 70.0,
  holidayPay: 17.5,
  otStd: 25.5,
  otEnh: 49.5,
  nightStd: 35.0,
  seventh: 105.0,
  travelHr: 25.5,
  mileage: 0.55,
  penDefer: 8.5,
  penCurtail: 49.5,
  penRest: 49.5,
};

export const DANCE_BASIC = { nwd: 10, cwd: 8 } as const; // hrs; NWD incl. 1 hr lunch

export interface DanceDayTimes { start: number; end: number } // minutes; end may pass 1440

export interface DanceWeek {
  eng: "svod" | "broadcast";
  pat: "nwd" | "cwd";
  shoot: number; //  1..7 shoot days in the week
  reh: number; //    rehearsal days (outside the shoot days)
  fit: number; //    fittings
  usage: number; //  % applied to shoot fees (engagement + production days)
  days: DanceDayTimes[]; // one per shoot day
  travelH: number; // travel hours per shoot day (capped at 2)
  miles: number; //   round-trip miles per shoot day
  pens: { defer: boolean; curtail: boolean; rest: boolean };
}

export interface DanceDayCalc {
  totalHrs: number;
  night: boolean;
  dawn: boolean;
  basicCap: number;
  otHrs: number;
  blocks: number;
  otStdBlocks: number;
  otEnhBlocks: number;
  ot: number;
  nightPay: number;
}

// One shoot day's hours → overtime & night money.
export function danceDayCalc(day: DanceDayTimes, pat: "nwd" | "cwd", R: DanceRates = DANCE_2026): DanceDayCalc {
  const totalHrs = (day.end - day.start) / 60;
  // before 04:00 or past midnight = night work; call 04:00–05:00 = dawn call
  const night = day.end > 1440 || day.start < 4 * 60;
  const dawn = !night && day.start >= 4 * 60 && day.start <= 5 * 60;
  const basicCap = dawn ? 5 : DANCE_BASIC[pat];
  const otHrs = Math.max(0, totalHrs - basicCap);
  const blocks = Math.ceil(otHrs * 2 - 1e-9);
  let otStdBlocks = 0, otEnhBlocks = 0;
  if (night) otEnhBlocks = blocks;
  else { otStdBlocks = Math.min(blocks, 4); otEnhBlocks = Math.max(0, blocks - 4); }
  const ot = otStdBlocks * R.otStd + otEnhBlocks * R.otEnh;
  return { totalHrs, night, dawn, basicCap, otHrs, blocks, otStdBlocks, otEnhBlocks, ot, nightPay: night ? R.nightStd : 0 };
}

export interface DanceWeekCalc {
  days: number; oneDay: boolean;
  perDay: DanceDayCalc[];
  totalHrs: number; otHrsAll: number; nightDays: number;
  engFee: number; prodDays: number; prodFees: number;
  usageBase: number; usage: number;
  rehFees: number; fitFees: number; holiday: number;
  ot: number; nightPay: number;
  travelPerDay: number; milesPerDay: number; travel: number;
  penPerDay: number; pens: number;
  seventhPay: number; additionals: number;
  gross: number; // per dancer, per week
}

// The whole week, per dancer.
export function danceWeek(S: DanceWeek, R: DanceRates = DANCE_2026): DanceWeekCalc {
  // one timeline per shoot day — pad by copying the last, trim extras
  const days: DanceDayTimes[] = [...S.days];
  while (days.length < S.shoot) days.push({ ...days[days.length - 1] });
  days.length = S.shoot;

  const attendance = S.shoot + S.reh + S.fit;
  const perDay = days.map((d) => danceDayCalc(d, S.pat, R));
  const totalHrs = perDay.reduce((a, d) => a + d.totalHrs, 0);
  const otHrsAll = perDay.reduce((a, d) => a + d.otHrs, 0);
  const nightDays = perDay.filter((d) => d.night).length;

  const oneDay = S.shoot === 1;
  const engFee = oneDay
    ? (S.eng === "svod" ? R.oneSVOD : R.oneBroadcast)
    : (S.eng === "svod" ? R.engSVOD : R.engBroadcast);
  const prodDays = Math.max(0, S.shoot - 1);
  const prodFees = prodDays * R.prodDay;
  const usageBase = engFee + prodFees;
  const usage = usageBase * (S.usage / 100);

  const rehFees = S.reh * R.rehearsal;
  const fitFees = S.fit * R.fitting;
  const holiday = attendance * R.holidayPay;

  const travelPerDay = Math.min(2, S.travelH) * R.travelHr;
  const milesPerDay = S.miles * R.mileage;
  const penPerDay = (S.pens.defer ? R.penDefer : 0) + (S.pens.curtail ? R.penCurtail : 0) + (S.pens.rest ? R.penRest : 0);

  const ot = perDay.reduce((a, d) => a + d.ot, 0);
  const nightPay = perDay.reduce((a, d) => a + d.nightPay, 0);
  const travel = (travelPerDay + milesPerDay) * S.shoot;
  const pens = penPerDay * S.shoot;

  const seventhPay = S.shoot === 7 ? R.seventh : 0;
  const additionals = ot + nightPay + travel + pens;

  const gross = engFee + prodFees + usage + rehFees + fitFees + holiday + ot + nightPay + travel + pens + seventhPay;
  return { days: attendance, oneDay, perDay, totalHrs, otHrsAll, nightDays, engFee, prodDays, prodFees, usageBase, usage, rehFees, fitFees, holiday, ot, nightPay, travelPerDay, milesPerDay, travel, pens, penPerDay, seventhPay, additionals, gross };
}
