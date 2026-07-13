"use client";

import type { CrowdCosts, ScheduleModel, ShootDay, StuntCosts } from "@/lib/engine";
import { fmtMonth, gbp } from "@/lib/format";

const WD_HEAD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function CalendarView({
  model,
  mode,
  crowd,
  stunt,
}: {
  model: ScheduleModel;
  mode: "crowd" | "stunt";
  crowd: CrowdCosts;
  stunt: StuntCosts;
}) {
  const perDay = mode === "crowd" ? crowd.perDay : stunt.perDay;

  // group shoot days by calendar month, then by day-of-month
  const months = new Map<string, { y: number; m: number; byDate: Map<number, ShootDay[]> }>();
  for (const d of model.days) {
    if (!d._date) continue;
    const y = d._date.getFullYear();
    const m = d._date.getMonth();
    const key = `${y}-${m}`;
    const entry = months.get(key) ?? { y, m, byDate: new Map() };
    const list = entry.byDate.get(d._date.getDate()) ?? [];
    list.push(d);
    entry.byDate.set(d._date.getDate(), list);
    months.set(key, entry);
  }

  return (
    <div className="calendar">
      {[...months.values()].map(({ y, m, byDate }) => {
        const offset = (new Date(y, m, 1).getDay() + 6) % 7; // Monday-first
        const daysInMonth = new Date(y, m + 1, 0).getDate();
        return (
          <section key={`${y}-${m}`} className="cal-month">
            <h3>{fmtMonth(y, m)}</h3>
            <div className="cal-grid">
              {WD_HEAD.map((w) => (
                <div key={w} className="cal-wd">{w}</div>
              ))}
              {Array.from({ length: offset }, (_, i) => (
                <div key={`b${i}`} className="cal-cell blank" />
              ))}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const date = i + 1;
                const shoots = byDate.get(date) ?? [];
                const wd = (offset + i) % 7;
                return (
                  <div key={date} className={`cal-cell${wd >= 5 ? " wkend" : ""}`}>
                    <div className="cal-date">{date}</div>
                    {shoots.map((d) => {
                      const e = perDay[d.id!];
                      return (
                        <div key={d.id} className={`cal-shoot${d.unit === "2nd" ? " u2" : ""}${e ? "" : " quiet"}`}>
                          <span className="cal-id">{d.id}</span>
                          <span className="cal-cost">{e ? gbp(Math.round(e.cost)) : "—"}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
