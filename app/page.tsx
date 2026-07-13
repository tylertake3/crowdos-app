"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type SupabaseStatus = "unconfigured" | "checking" | "connected" | "error";

export default function Home() {
  const [status, setStatus] = useState<SupabaseStatus>(
    supabase ? "checking" : "unconfigured"
  );

  useEffect(() => {
    if (!supabase) return;
    supabase.auth
      .getSession()
      .then(() => setStatus("connected"))
      .catch(() => setStatus("error"));
  }, []);

  return (
    <main>
      <h1>CrowdOS</h1>
      <p className="tagline">
        Crowd budgeting &amp; scheduling for UK film and TV
      </p>

      <div className="status-card">
        <h2>Setup check</h2>
        <div className="status-row">
          <span className="dot ok" />
          <span>Next.js is running</span>
        </div>
        <div className="status-row">
          {status === "unconfigured" && (
            <>
              <span className="dot pending" />
              <span>Supabase — not connected yet (keys not in .env.local)</span>
            </>
          )}
          {status === "checking" && (
            <>
              <span className="dot pending" />
              <span>Supabase — checking connection…</span>
            </>
          )}
          {status === "connected" && (
            <>
              <span className="dot ok" />
              <span>Supabase — connected</span>
            </>
          )}
          {status === "error" && (
            <>
              <span className="dot error" />
              <span>Supabase — connection failed (check the keys)</span>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
