"use client";

import { useEffect, useMemo, useState } from "react";
import { computeCrowdCosts, computeStuntCosts } from "@/lib/engine";
import { buildDemoSources } from "@/lib/demo-model";
import { gbpRound } from "@/lib/format";
import DayBoard from "@/components/DayBoard";
import CalendarView from "@/components/CalendarView";
import Breakdown from "@/components/Breakdown";

type Mode = "crowd" | "stunt";
type View = "board" | "calendar" | "breakdown";

export default function Home() {
  // date parsing depends on the browser timezone, so build after mount to
  // keep server and client HTML identical
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [mode, setMode] = useState<Mode>("crowd");
  const [srcIdx, setSrcIdx] = useState(2); // Full Schedule
  const [view, setView] = useState<View>("board");

  const sources = useMemo(() => (mounted ? buildDemoSources() : null), [mounted]);
  const model = sources?.[srcIdx].model;
  const crowd = useMemo(() => (model ? computeCrowdCosts(model) : null), [model]);
  const stunt = useMemo(() => (model ? computeStuntCosts(model) : null), [model]);

  if (!sources || !model || !crowd || !stunt) {
    return (
      <main className="app">
        <p className="loading">Loading schedule…</p>
      </main>
    );
  }

  const crowdDays = model.days.filter((d) => crowd.perDay[d.id!]).length;
  const stuntDays = model.days.filter((d) => stunt.perDay[d.id!]).length;
  const saDays = Object.values(crowd.perDay).reduce((a, e) => a + e.sa, 0);
  const featDays = Object.values(crowd.perDay).reduce((a, e) => a + e.featPD, 0);
  const spactDays = Object.values(crowd.perDay).reduce((a, e) => a + e.spactPD, 0);
  const perfDays = Object.values(stunt.perPerson).filter((p) => p.type !== "stuntCoord").reduce((a, p) => a + p.heads, 0);
  const coordDays = Object.values(stunt.perPerson).filter((p) => p.type === "stuntCoord").reduce((a, p) => a + p.heads, 0);

  return (
    <main className="app" data-mode={mode}>
      <header className="topbar">
        <div className="brand">
          <h1>{mode === "crowd" ? "CrowdOS" : "StuntOS"}</h1>
          <span className="brand-sub">{sources[srcIdx].title}</span>
        </div>
        <div className="mode-toggle" role="tablist" aria-label="App mode">
          <button className={mode === "crowd" ? "on" : ""} onClick={() => setMode("crowd")}>Crowd</button>
          <button className={mode === "stunt" ? "on" : ""} onClick={() => setMode("stunt")}>Stunts</button>
        </div>
      </header>

      <div className="src-bar" role="tablist" aria-label="Schedule source">
        {sources.map((s, i) => (
          <button key={s.short} className={i === srcIdx ? "on" : ""} onClick={() => setSrcIdx(i)} title={s.title}>
            <span className="k">{s.model.days.length}d</span>
            {s.short}
          </button>
        ))}
        <span className="demo-note">Demo schedule — PDF upload coming in the next step</span>
      </div>

      <section className="summary">
        <div className="stat hero">
          <div className="n">{gbpRound(mode === "crowd" ? crowd.grand : stunt.grand)}</div>
          <div className="l">Total {mode} cost</div>
        </div>
        <div className="stat">
          <div className="n">
            {mode === "crowd" ? crowdDays : stuntDays}
            <span className="of">/{model.days.length}</span>
          </div>
          <div className="l">{mode === "crowd" ? "Crowd" : "Stunt"} days</div>
        </div>
        {mode === "crowd" ? (
          <>
            <div className="stat"><div className="n">{saDays.toLocaleString()}</div><div className="l">SA artiste-days</div></div>
            <div className="stat"><div className="n">{featDays}</div><div className="l">Featured days</div></div>
            <div className="stat"><div className="n">{spactDays}</div><div className="l">SPACT days</div></div>
          </>
        ) : (
          <>
            <div className="stat"><div className="n">{perfDays}</div><div className="l">Performer-days</div></div>
            <div className="stat"><div className="n">{coordDays}</div><div className="l">Coordinator-days</div></div>
            <div className="stat">
              <div className="n">{stuntDays ? gbpRound(stunt.grand / stuntDays) : "—"}</div>
              <div className="l">Avg cost / stunt day</div>
            </div>
          </>
        )}
      </section>

      <nav className="view-tabs" role="tablist" aria-label="View">
        {(
          [
            ["board", "Day board"],
            ["calendar", "Calendar"],
            ["breakdown", "Cost breakdown"],
          ] as [View, string][]
        ).map(([v, label]) => (
          <button key={v} className={view === v ? "on" : ""} onClick={() => setView(v)}>
            {label}
          </button>
        ))}
      </nav>

      {view === "board" && <DayBoard model={model} mode={mode} crowd={crowd} stunt={stunt} />}
      {view === "calendar" && <CalendarView model={model} mode={mode} crowd={crowd} stunt={stunt} />}
      {view === "breakdown" && <Breakdown model={model} mode={mode} crowd={crowd} stunt={stunt} />}
    </main>
  );
}
