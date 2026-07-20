// Supabase data layer for the board. Every function is safe to call when
// Supabase isn't configured or nobody is signed in — the board then behaves
// exactly as before (demo + localStorage).
/* eslint-disable */
import { supabase } from "../supabase";

export const cloudConfigured = () => !!supabase;

export async function getSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session || null;
}

// "JWT issued at future" / clock-skew / expired-token rejections are
// self-healing: a stale access token (minted while the client clock was
// briefly ahead — common right after the machine wakes) stays cached for up
// to an hour and keeps getting rejected even once the clock is fine. The cure
// is a fresh token, minted server-side, which sidesteps the client clock
// entirely. `authRetry` runs a Supabase call, and on a token/clock error
// forces one refreshSession() + retry — so the app recovers on its own
// instead of asking the user to reset their clock.
const AUTH_ERR = /jwt|issued at|token is expired|clock|invalid.*(token|claim)|iat|exp\b/i;
let refreshing = null; // dedupe concurrent refreshes (loadAll fires 7 calls at once)
export async function refreshSession() {
  if (!supabase) return { error: null };
  if (!refreshing) refreshing = supabase.auth.refreshSession().finally(() => { refreshing = null; });
  return refreshing;
}
async function authRetry(run) {
  let r = await run();
  if (r && r.error && AUTH_ERR.test(r.error.message || "")) {
    await refreshSession().catch(() => {});
    r = await run();
  }
  return r;
}

export function onAuthChange(cb) {
  if (!supabase) return;
  supabase.auth.onAuthStateChange((_event, session) => cb(session || null));
}

export const signIn = (email, password) =>
  supabase.auth.signInWithPassword({ email, password });
export const signUp = (email, password, firstName, lastName, role) =>
  supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        first_name: firstName || "",
        last_name: lastName || "",
        full_name: [firstName, lastName].filter(Boolean).join(" "),
        role: role || "",
      },
    },
  });
export const signInWithGoogle = () =>
  supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin },
  });
export const signOut = () => supabase.auth.signOut();

export async function loadAll() {
  // one retry wrapper around the whole fan-out: if the token is stale, the
  // first productions query 401s, we refresh once, then re-run everything
  const runAll = () => Promise.all([
    supabase.from("productions").select("*").order("created_at"),
    supabase.from("manual_days").select("*").order("created_at"),
    supabase.from("day_edits").select("*"),
    supabase.from("prods").select("*").order("created_at"),
    supabase.from("schedule_glossary").select("*").order("created_at"),
    supabase.from("production_events").select("*").order("created_at", { ascending: false }).limit(500),
    supabase.from("rate_cards").select("*").order("created_at"),
  ]);
  let [p, md, de, pr, gl, ev, rc] = await runAll();
  if ((p.error && AUTH_ERR.test(p.error.message || "")) || (de.error && AUTH_ERR.test(de.error.message || ""))) {
    await refreshSession().catch(() => {});
    [p, md, de, pr, gl, ev, rc] = await runAll();
  }
  return {
    productions: p.data || [],
    manualDays: md.data || [],
    dayEdits: de.data || [],
    prods: pr.data || [], // empty if the prods table predates this build
    glossary: gl.data || [], // empty if migration-2026-07-15b.sql hasn't run
    events: ev.data || [], // empty if migration-2026-07-15c.sql hasn't run
    rateCards: rc.data || [], // empty if migration-2026-07-16b.sql hasn't run
    error: p.error || md.error || de.error, // prods/glossary/events/rateCards tables are optional
  };
}

// ---- admin rate cards (account-wide; one card per department: sa | stunts) ----
export async function upsertRateCard(kind, name, vals) {
  return supabase.from("rate_cards").upsert(
    { kind, name, vals: vals || {}, updated_at: new Date().toISOString() },
    { onConflict: "owner,kind,name" }
  );
}
export async function deleteRateCard(kind, name) {
  return supabase.from("rate_cards").delete().eq("kind", kind).eq("name", name);
}

// ---- schedule glossary (term meanings; production null = global) ----
export async function upsertGlossaryTerm(term, answer, production) {
  return supabase.from("schedule_glossary").upsert(
    { term, answer, production: production || null, updated_at: new Date().toISOString() },
    { onConflict: "owner,term,production" }
  );
}
export async function deleteGlossaryTerm(term, production) {
  let q = supabase.from("schedule_glossary").delete().eq("term", term);
  q = production ? q.eq("production", production) : q.is("production", null);
  return q;
}

// Production entities (name-keyed). Tolerant of a pre-migration database
// that lacks the prods table — the app still works from per-schedule data.
export async function upsertProd(name, settings) {
  // rate_card jsonb: the v2 per-department shape ({sa:{name,vals},stunts:…})
  // when present, else a legacy pre-split single card
  const base = { name, colour: settings.colour || null, rate_card: settings.rateCards || settings.rateCard || null };
  // settings columns arrive with migration-2026-07-15c.sql
  const extra = {
    locations: settings.locations || null,
    info: settings.info || null,
    cast_list: settings.castList || null,
    columns: settings.columns || null,
  };
  // no_ai arrives with migration-2026-07-16.sql, rate_overrides with
  // migration-2026-07-16b.sql — each its own tier, so a database missing one
  // still saves every other setting
  let r = await supabase.from("prods").upsert(
    { ...base, ...extra, no_ai: !!settings.noAI, rate_overrides: settings.rateOverrides || null },
    { onConflict: "owner,name" }
  );
  if (r.error && /rate_overrides/i.test(r.error.message || ""))
    r = await supabase.from("prods").upsert({ ...base, ...extra, no_ai: !!settings.noAI }, { onConflict: "owner,name" });
  if (r.error && /no_ai/i.test(r.error.message || ""))
    r = await supabase.from("prods").upsert({ ...base, ...extra }, { onConflict: "owner,name" });
  if (r.error && /locations|cast_list|columns|info/i.test(r.error.message || ""))
    r = await supabase.from("prods").upsert(base, { onConflict: "owner,name" });
  return r;
}

// ---- production change history ----
export async function logEvent(production, kind, detail) {
  const email =
    (await supabase.auth.getSession()).data?.session?.user?.email || null;
  return supabase.from("production_events").insert({
    production, kind, detail: String(detail).slice(0, 500), actor_email: email,
  });
}
export async function deleteProd(name) {
  return supabase.from("prods").delete().eq("name", name);
}

// ---- productions ----
export async function insertProduction(rec) {
  const base = {
    title: rec.title,
    short: rec.short,
    kind: rec.kind,
    unit: rec.unit || null,
    schedule_text: rec.text || null,
    colour: rec.colour || null,
  };
  const meta = {
    production: rec.prod || null,
    version: rec.version || null,
    sched_date: rec.schedDate || null,
    format: rec.format || null,
    rate_card: rec.rateCard || null,
    is_current: !!rec.current,
  };
  // ai_model arrives with migration-2026-07-15.sql (the AI schedule reader);
  // doc_kind with migration-2026-07-15b.sql. Kept in their own tier so a
  // database without the columns still saves the grouping columns.
  const ai = { ai_model: rec.aiModel || null, doc_kind: rec.docKind || null };
  let { data, error } = await authRetry(() => supabase
    .from("productions")
    .insert({ ...base, ...meta, ...ai })
    .select("id")
    .single());
  if (error && /ai_model|doc_kind/i.test(error.message || "")) {
    ({ data, error } = await supabase.from("productions").insert({ ...base, ...meta }).select("id").single());
  }
  // grouping columns arrive with migration-2026-07-14.sql — insert without
  // them if the database predates it
  if (error && /column|schema/i.test(error.message || "")) {
    ({ data, error } = await supabase.from("productions").insert(base).select("id").single());
  }
  return { id: data && data.id, error };
}

export async function deleteProduction(id) {
  return supabase.from("productions").delete().eq("id", id);
}

export async function updateProduction(id, rec) {
  const meta = {
    production: rec.prod || null,
    version: rec.version || null,
    sched_date: rec.schedDate || null,
    unit: rec.unit || null,
    colour: rec.colour || null,
    format: rec.format || null,
    rate_card: rec.rateCard || null,
    is_current: !!rec.current,
  };
  const ai = { ai_model: rec.aiModel || null, doc_kind: rec.docKind || null }; // see insertProduction
  let r = await authRetry(() => supabase.from("productions").update({ ...meta, ...ai }).eq("id", id));
  if (r.error && /ai_model|doc_kind/i.test(r.error.message || ""))
    r = await supabase.from("productions").update(meta).eq("id", id);
  // pre-migration databases lack the grouping columns
  if (r.error && /column|schema/i.test(r.error.message || ""))
    r = await supabase.from("productions").update({ unit: rec.unit || null, colour: rec.colour || null }).eq("id", id);
  return r;
}

// ---- manual days ----
export async function upsertManualDay(productionId, d) {
  const base = {
    production_id: productionId,
    num: d.num,
    date: d.date,
    loc: d.loc || "",
    hours: d.hours || "",
    type: d.type || "",
    unit: d.unit || "Main",
  };
  // scene stubs arrive with migration-2026-07-15b.sql — save without them if
  // the database predates it. Descriptive fields only (num/part/ie/tod/
  // scriptDay/pages/slug/desc) — cast/crowd/stunt counts are SCED-derived and
  // always recomputed, never stored here.
  let r = await supabase.from("manual_days").upsert(
    {
      ...base,
      scenes: (d.scenes || []).map((s) => ({
        num: s.num, part: s.part || "", ie: s.ie || "", tod: s.tod || "",
        scriptDay: s.scriptDay || "", pages: s.pages || "",
        slug: s.slug || "", desc: s.desc || "",
      })),
    },
    { onConflict: "owner,production_id,unit,num" }
  );
  if (r.error && /scenes/i.test(r.error.message || ""))
    r = await supabase.from("manual_days").upsert(base, { onConflict: "owner,production_id,unit,num" });
  return r;
}

export async function deleteManualDay(productionId, unit, num) {
  let q = supabase.from("manual_days").delete().eq("unit", unit).eq("num", num);
  q = productionId ? q.eq("production_id", productionId) : q.is("production_id", null);
  return q;
}

// ---- day edits (crowd day configs + stunt adjustments) ----
// authRetry-wrapped: this is the highest-frequency write (fires on every
// crowd/stunt edit), so a stale token here would otherwise nag repeatedly.
export async function upsertDayEdit(productionId, key, kind, data) {
  return authRetry(() => supabase.from("day_edits").upsert(
    { production_id: productionId, key, kind, data },
    { onConflict: "owner,production_id,key,kind" }
  ));
}

export async function deleteDayEdit(productionId, key, kind) {
  let q = supabase.from("day_edits").delete().eq("key", key).eq("kind", kind);
  q = productionId ? q.eq("production_id", productionId) : q.is("production_id", null);
  return q;
}

// ---- profile photo (small JPEG data-URL in auth user_metadata) ----
export async function updateAvatar(dataURL) {
  return supabase.auth.updateUser({ data: { avatar: dataURL || null } });
}
