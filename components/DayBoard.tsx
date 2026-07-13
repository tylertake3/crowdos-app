"use client";

import type { CrowdCosts, ScheduleModel, StuntCosts } from "@/lib/engine";
import { personName } from "@/lib/demo-model";
import { fmtDate, gbp } from "@/lib/format";

export default function DayBoard({
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
  return (
    <div className="day-board">
      {model.days.map((d) => {
        const crowdEntry = crowd.perDay[d.id!];
        const stuntEntry = stunt.perDay[d.id!];
        const entry = mode === "crowd" ? crowdEntry : stuntEntry;
        return (
          <div key={d.id} className={`day-card${entry ? "" : " quiet"}`}>
            <div className="day-head">
              <span className={`unit-chip${d.unit === "2nd" ? " u2" : ""}`}>
                {d.unit === "2nd" ? "2nd Unit" : "Main"} · Day {d.num}
              </span>
              <span className="day-date">{d._date ? fmtDate(d._date) : d.date}</span>
              <span className="day-loc">
                {d.loc || "—"}
                {mode === "crowd" && crowdEntry && (
                  <span
                    className={`band-chip${crowdEntry.travel.known ? "" : " unknown"}`}
                    title={
                      crowdEntry.travel.known
                        ? `Travel Cat ${crowdEntry.travel.band} · ${gbp(crowdEntry.travel.amt)}/head`
                        : "Location not recognised — defaulted to Cat A, please check"
                    }
                  >
                    Cat {crowdEntry.travel.band}
                    {crowdEntry.travel.known ? "" : "?"}
                  </span>
                )}
              </span>
              {d.type && <span className="type-chip">{d.type}</span>}
              {d.hours && <span className="day-hours">{d.hours}</span>}
              {entry && <span className="day-cost">{gbp(Math.round(entry.cost))}</span>}
            </div>

            {mode === "crowd" && crowdEntry && (
              <div className="day-body">
                {crowdEntry.sa > 0 && (
                  <span className="req-chip pact">SA ×{crowdEntry.sa}</span>
                )}
                {Object.entries(crowdEntry.feats).map(([name, n]) => (
                  <span key={name} className="req-chip pact feat">
                    {name}
                    {n > 1 ? ` ×${n}` : ""}
                  </span>
                ))}
                {Object.entries(crowdEntry.spacts).map(([name, n]) => (
                  <span key={name} className="req-chip spact">
                    {name}
                    {n > 1 ? ` ×${n}` : ""}
                  </span>
                ))}
              </div>
            )}

            {mode === "stunt" && stuntEntry && (
              <div className="day-body">
                {stuntEntry.people.map((p, i) => (
                  <span
                    key={i}
                    className={`req-chip stunt${p.type === "stuntCoord" ? " coord" : ""}`}
                    title={`${gbp(p.cost)}${p.insured ? " · insurance day" : ""}`}
                  >
                    {p.type === "stuntExtra"
                      ? `${p.code}${p.count > 1 ? ` ×${p.count}` : ""}`
                      : personName(model.castMap, p.code)}
                    {p.insured ? " ●" : ""}
                  </span>
                ))}
              </div>
            )}

            {!entry && (
              <div className="day-body none">
                No {mode === "crowd" ? "crowd" : "stunt"} requirement
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
