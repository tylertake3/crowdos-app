// Model helpers: dates, week grouping, per-day peaks, unit prep & merging.

import type { CastToken, ScheduleModel, Scene, ShootDay } from "./types";

const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

export function parseDayDate(d: Pick<ShootDay, "date">): Date | null {
  let m = d.date.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)(?:\s+(\d{4}))?/);
  if (m && MONTHS[m[2].toLowerCase()] != null)
    return new Date(+(m[3] || 2026), MONTHS[m[2].toLowerCase()], +m[1]);
  m = d.date.match(/([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})?/);
  if (m && MONTHS[m[1].toLowerCase()] != null)
    return new Date(+(m[3] || 2026), MONTHS[m[1].toLowerCase()], +m[2]);
  return null;
}

// Monday-of-week key, computed from local date parts so results do not
// depend on the machine's timezone (the prototype used toISOString, which
// shifts dates on non-UK machines).
export function weekKey(date: Date): string {
  const d = new Date(date);
  const wd = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - wd);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
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
