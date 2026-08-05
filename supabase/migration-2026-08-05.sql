-- Two gaps closed here. Safe to re-run. Supabase → SQL Editor → Run.
--
-- 1. day_edits.kind has only ever allowed 'cday','adj','sced','stuntday'.
--    The app has been writing 'notes', 'briefs', 'dayloc' and 'stuntcfg'
--    through the same path since, and every one of those writes was rejected
--    by this check constraint — silently, because the call sites swallow the
--    error. Casting briefs, day notes, hand-set locations and stunt day
--    configs have therefore never reached anyone's account: they live in
--    whichever browser typed them. Widen the constraint to what the app
--    actually sends.
--
-- 2. Some things belong to the ACCOUNT, not to a production: the calculators'
--    scratch rows, the risk-assessment settings, and the dashboard's
--    stand-alone casting briefs (which by definition have no production).
--    user_blobs is one row per account per kind — the same blob pattern
--    day_edits uses, without a production to hang it on.

alter table day_edits drop constraint if exists day_edits_kind_check;
alter table day_edits
  add constraint day_edits_kind_check
  check (kind in ('cday','adj','sced','stuntday','stuntcfg','notes','briefs','dayloc'));

create table if not exists user_blobs (
  owner uuid not null references auth.users(id) on delete cascade default auth.uid(),
  -- 'ra' risk-assessment settings · 'raedits' hand-edited RA text ·
  -- 'freecalc'/'stuntcalc'/'dancecalc' calculator state · 'fcrows'/'srows'/
  -- 'drows' their saved rough-budget rows · 'dbriefs' dashboard briefs
  kind text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (owner, kind)
);

alter table user_blobs enable row level security;
drop policy if exists "own rows" on user_blobs;
create policy "own rows" on user_blobs
  for all using (owner = auth.uid()) with check (owner = auth.uid());
