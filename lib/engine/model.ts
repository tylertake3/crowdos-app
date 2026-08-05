// Model helpers: dates, week grouping, per-day peaks, unit prep & merging.

import type { CastToken, ScheduleModel, Scene, ShootDay } from "./types";

const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};
// Call sheets write months every which way: "April", "APRIL", "Apr", "Sept.".
// Full names win; a 3–5 letter word is accepted as an abbreviation, which keeps
// ordinary words ("Marketing") from being read as a month.
function monthNum(word: string): number | null {
  const w = word.toLowerCase().replace(/\.$/, "");
  if (MONTHS[w] != null) return MONTHS[w];
  if (w.length < 3 || w.length > 5) return null;
  for (const name of Object.keys(MONTHS))
    if (name.startsWith(w)) return MONTHS[name];
  return null;
}

// NOTE: the /i flags matter. Schedules routinely shout their dates
// ("MONDAY 14TH APRIL"), and a case-sensitive ordinal suffix left every such
// day with a null _date — which silently broke date sorting, week grouping,
// continuity and the calendar for that production.
export function parseDayDate(d: Pick<ShootDay, "date">): Date | null {
  let m = d.date.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z.]+)(?:\s+(\d{4}))?/i);
  let mo = m && monthNum(m[2]);
  if (m && mo != null) return new Date(+(m[3] || 2026), mo, +m[1]);
  m = d.date.match(/([A-Za-z.]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?/i);
  mo = m && monthNum(m[1]);
  if (m && mo != null) return new Date(+(m[3] || 2026), mo, +m[2]);
  return null;
}

// Week key, verbatim from the prototype. NOTE: toISOString shifts the local
// Monday back to the Sunday UTC date during British Summer Time, so week
// labels render as e.g. "w/c 5 Jul" for the week starting Monday 6 Jul —
// that is exactly what the prototype shows, so it is preserved (grouping is
// unaffected). Tests pin behaviour by running with TZ=Europe/London.
export function weekKey(date: Date): string {
  const d = new Date(date);
  const wd = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - wd);
  return d.toISOString().slice(0, 10);
}

export const isPerf = (c: CastToken) =>
  c.type === "stuntPerf" || c.type === "stuntDbl";
export const isStuntTok = (c: CastToken) => c.type === "stuntCoord" || isPerf(c);

export function dayPeakSA(d: ShootDay): number {
  return Math.max(0, ...d.scenes.map((s: Scene) => s.sa), 0);
}

export function prepModel(model: ScheduleModel, unit: "Main" | "2nd"): ScheduleModel {
  for (const d of model.days) {
    d.unit = unit;
    d.id = (unit === "2nd" ? "U" : "M") + d.num;
    d._date = parseDayDate(d);
    if (/^studio$/i.test((d.loc || "").trim())) d.loc = "OMAX Studio";
  }
  model.multiUnit = false;
  return model;
}

export function mergeModels(a: ScheduleModel, b: ScheduleModel): ScheduleModel {
  const days = [...a.days, ...b.days].sort(
    (x, y) =>
      (x._date?.getTime() || 0) - (y._date?.getTime() || 0) || x.num - y.num
  );
  return {
    days,
    castMap: Object.assign({}, a.castMap, b.castMap),
    notes: a.notes || [],
    multiUnit: true,
  };
}
