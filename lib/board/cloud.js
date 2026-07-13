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

export function onAuthChange(cb) {
  if (!supabase) return;
  supabase.auth.onAuthStateChange((_event, session) => cb(session || null));
}

export const signIn = (email, password) =>
  supabase.auth.signInWithPassword({ email, password });
export const signUp = (email, password) => supabase.auth.signUp({ email, password });
export const signOut = () => supabase.auth.signOut();

export async function loadAll() {
  const [p, md, de] = await Promise.all([
    supabase.from("productions").select("*").order("created_at"),
    supabase.from("manual_days").select("*").order("created_at"),
    supabase.from("day_edits").select("*"),
  ]);
  return {
    productions: p.data || [],
    manualDays: md.data || [],
    dayEdits: de.data || [],
    error: p.error || md.error || de.error,
  };
}

// ---- productions ----
export async function insertProduction(rec) {
  const { data, error } = await supabase
    .from("productions")
    .insert({
      title: rec.title,
      short: rec.short,
      kind: rec.kind,
      unit: rec.unit || null,
      schedule_text: rec.text || null,
      colour: rec.colour || null,
    })
    .select("id")
    .single();
  return { id: data && data.id, error };
}

export async function deleteProduction(id) {
  return supabase.from("productions").delete().eq("id", id);
}

// ---- manual days ----
export async function upsertManualDay(productionId, d) {
  return supabase.from("manual_days").upsert(
    {
      production_id: productionId,
      num: d.num,
      date: d.date,
      loc: d.loc || "",
      hours: d.hours || "",
      type: d.type || "",
      unit: d.unit || "Main",
    },
    { onConflict: "owner,production_id,unit,num" }
  );
}

export async function deleteManualDay(productionId, unit, num) {
  let q = supabase.from("manual_days").delete().eq("unit", unit).eq("num", num);
  q = productionId ? q.eq("production_id", productionId) : q.is("production_id", null);
  return q;
}

// ---- day edits (crowd day configs + stunt adjustments) ----
export async function upsertDayEdit(productionId, key, kind, data) {
  return supabase.from("day_edits").upsert(
    { production_id: productionId, key, kind, data },
    { onConflict: "owner,production_id,key,kind" }
  );
}

export async function deleteDayEdit(productionId, key, kind) {
  let q = supabase.from("day_edits").delete().eq("key", key).eq("kind", kind);
  q = productionId ? q.eq("production_id", productionId) : q.is("production_id", null);
  return q;
}
