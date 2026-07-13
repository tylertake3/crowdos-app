"use client";

import type { CrowdCosts, ScheduleModel, StuntCosts } from "@/lib/engine";
import { PACT, OTINC } from "@/lib/engine/pact";
import { SP3 } from "@/lib/engine/spact";
import { personName } from "@/lib/demo-model";
import { fmtWeek, gbp, gbpRound } from "@/lib/format";

export default function Breakdown({
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
  return mode === "crowd" ? <CrowdBreakdown crowd={crowd} /> : <StuntBreakdown model={model} stunt={stunt} />;
}

function CrowdBreakdown({ crowd }: { crowd: CrowdCosts }) {
  const t = crowd.weeks.reduce(
    (a, w) => ({ days: a.days + w.days, sa: a.sa + w.saDays, feat: a.feat + w.featDays, spact: a.spact + w.spactDays, cost: a.cost + w.cost }),
    { days: 0, sa: 0, feat: 0, spact: 0, cost: 0 }
  );
  return (
    <div className="breakdown">
      <div className="rate-cards">
        <section className="rate-card pact-card">
          <h3>PACT/FAA 2026 — SA &amp; Featured</h3>
          <p>
            SA basic daily rate {gbp(PACT.dayBDR)} + {(PACT.hol * 100).toFixed(2)}% holiday on the day rate.
            Night BDR {gbp(PACT.nightBDR)} (scheduled night shoots only). Framework from 07:00 — Standard Day {PACT.stdHrs}h / CWD {PACT.cwdHrs}h.
            OT &amp; early call charged holiday-inclusive: {gbp(OTINC.day)} day / {gbp(OTINC.night)} night &amp; early per 30 min.
            Travel Cat A {gbp(PACT.travelA)} / Cat B {gbp(PACT.travelB)}; early-call travel {gbp(PACT.early)} (call ≤ 06:00).
            <b> There is no Featured rate — Featured SA = SA rate + supplementary fees.</b>
          </p>
        </section>
        <section className="rate-card spact-card">
          <h3>Take 3 SPACT 2026</h3>
          <p>
            {gbp(SP3.day)} basic + {gbp(SP3.hol)} flat payment in lieu of holiday (not a %). Night {gbp(SP3.night)};
            public holiday {gbp(SP3.phDay)} / {gbp(SP3.phNight)}. Framework SWD {SP3.fwStd}h (incl. lunch) / CWD {SP3.fwCwd}h.
            Same OT money as PACT; early-call travel {gbp(SP3.earlyTravel)}. A separate rate card — never blended with PACT/FAA.
          </p>
        </section>
      </div>

      <section className="bd-section">
        <h3>Cost by week</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Week</th><th className="num">Days</th><th className="num">SA artiste-days</th><th className="num">Featured days</th><th className="num">SPACT days</th><th className="num">Cost</th></tr>
            </thead>
            <tbody>
              {crowd.weeks.map((w) => (
                <tr key={w.key}>
                  <td>{fmtWeek(w.key)}</td>
                  <td className="num">{w.days}</td>
                  <td className="num">{w.saDays.toLocaleString()}</td>
                  <td className="num">{w.featDays}</td>
                  <td className="num">{w.spactDays}</td>
                  <td className="num">{gbpRound(w.cost)}</td>
                </tr>
              ))}
              <tr className="total">
                <td>Total</td>
                <td className="num">{t.days}</td>
                <td className="num">{t.sa.toLocaleString()}</td>
                <td className="num">{t.feat}</td>
                <td className="num">{t.spact}</td>
                <td className="num">{gbpRound(t.cost)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <div className="bd-cols">
        <PeopleTable title="Featured characters (PACT/FAA)" cls="pact-card" people={crowd.featPeople} />
        <PeopleTable title="SPACT characters (Take 3)" cls="spact-card" people={crowd.spactPeople} />
      </div>
    </div>
  );
}

function PeopleTable({
  title,
  cls,
  people,
}: {
  title: string;
  cls: string;
  people: CrowdCosts["featPeople"];
}) {
  const rows = Object.values(people).sort((a, b) => b.heads - a.heads);
  if (!rows.length) return null;
  return (
    <section className={`bd-section ${cls}`}>
      <h3>{title}</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Character</th><th className="num">Days</th><th className="num">Artiste-days</th><th className="num">Peak</th></tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.code}>
                <td>{p.code}</td>
                <td className="num">{p.dayCounts.size}</td>
                <td className="num">{p.heads}</td>
                <td className="num">{p.max}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function StuntBreakdown({ model, stunt }: { model: ScheduleModel; stunt: StuntCosts }) {
  const t = stunt.weeks.reduce(
    (a, w) => ({ days: a.days + w.days, perf: a.perf + w.perfDays, coord: a.coord + w.coordDays, ins: a.ins + w.ins, cost: a.cost + w.cost }),
    { days: 0, perf: 0, coord: 0, ins: 0, cost: 0 }
  );
  const people = Object.values(stunt.perPerson).sort((a, b) => b.total - a.total);
  return (
    <div className="breakdown">
      <div className="rate-cards">
        <section className="rate-card stunt-card">
          <h3>StuntOS rates</h3>
          <p>
            Performer {gbp(stunt.R.perf)}/day, coordinator {gbp(stunt.R.coord)}/day; + {gbp(stunt.R.hol)} holiday flat;
            + {(stunt.R.usePct * 100).toFixed(1)}% usage on the day rate. Insurance {gbp(stunt.R.ins)} on the first {stunt.R.insDays} working
            days per person per week (shared across units). Per-head day: performer {gbp(stunt.perfBase)}, coordinator {gbp(stunt.coordBase)} (+ insurance where due).
          </p>
        </section>
      </div>

      <section className="bd-section">
        <h3>Cost by week</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Week</th><th className="num">Days</th><th className="num">Performer-days</th><th className="num">Coordinator-days</th><th className="num">Insurance</th><th className="num">Cost</th></tr>
            </thead>
            <tbody>
              {stunt.weeks.map((w) => (
                <tr key={w.key}>
                  <td>{fmtWeek(w.key)}</td>
                  <td className="num">{w.days}</td>
                  <td className="num">{w.perfDays}</td>
                  <td className="num">{w.coordDays}</td>
                  <td className="num">{gbpRound(w.ins)}</td>
                  <td className="num">{gbpRound(w.cost)}</td>
                </tr>
              ))}
              <tr className="total">
                <td>Total</td>
                <td className="num">{t.days}</td>
                <td className="num">{t.perf}</td>
                <td className="num">{t.coord}</td>
                <td className="num">{gbpRound(t.ins)}</td>
                <td className="num">{gbpRound(t.cost)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="bd-section">
        <h3>Per person</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Who</th><th>Type</th><th className="num">Days</th><th className="num">Rate</th><th className="num">Usage</th><th className="num">Holiday</th><th className="num">Insurance</th><th className="num">Total</th></tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.code + p.type}>
                  <td>{p.type === "stuntExtra" ? p.code : personName(model.castMap, p.code)}</td>
                  <td>{{ stuntCoord: "Coordinator", stuntPerf: "Performer", stuntDbl: "Stunt double", stuntExtra: "Stunt performers" }[p.type] ?? p.type}</td>
                  <td className="num">{p.days}</td>
                  <td className="num">{gbpRound(p.rate)}</td>
                  <td className="num">{gbpRound(p.usage)}</td>
                  <td className="num">{gbpRound(p.hol)}</td>
                  <td className="num">{gbpRound(p.ins)}</td>
                  <td className="num">{gbpRound(p.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
