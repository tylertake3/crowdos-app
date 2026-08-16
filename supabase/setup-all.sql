-- ============================================================================
-- CrowdOS — complete database setup, in one file.
-- ============================================================================
--
-- WHAT THIS IS
--   Everything a brand-new Supabase project needs to run CrowdOS: all 8 tables,
--   their columns, indexes and row-level-security policies, plus the private
--   'schedule-files' Storage bucket and its 4 object policies.
--
--   It replaces running schema.sql and the ten migration-*.sql files by hand.
--   Those files are kept alongside this one purely as history — you do NOT need
--   to run them, and running `cat supabase/*.sql | psql` does NOT work
--   (schema.sql sorts last alphabetically, so the migrations would run against
--   tables that don't exist yet). Run THIS file instead.
--
-- HOW TO RUN
--   Supabase Dashboard → SQL Editor → New query → paste this whole file → Run.
--
-- SAFE TO RE-RUN
--   Every statement is idempotent (`create table if not exists`,
--   `add column if not exists`, `drop policy if exists` before `create policy`,
--   `on conflict do nothing`). Running it twice on a live database changes
--   nothing and destroys nothing. The one historically destructive statement —
--   a DELETE that removed duplicate `prods` rows — is guarded so it can only
--   fire on a database that has never had the unique constraint. See STEP 6.
--
-- WHAT IT DOES NOT DO
--   It does not create your Supabase project, set your Site URL, configure
--   auth, or set the bucket's file-size / MIME limits. Those are dashboard
--   settings — see docs/LAUNCH.md.
--
-- Source files, in the order they are applied below:
--   schema.sql
--   migration-2026-07-14.sql    migration-2026-07-14b.sql
--   migration-2026-07-15.sql    migration-2026-07-15b.sql
--   migration-2026-07-15c.sql   migration-2026-07-15d.sql
--   migration-2026-07-16.sql    migration-2026-07-16b.sql
--   migration-2026-08-05.sql    migration-2026-08-10.sql
-- ============================================================================


-- ============================================================================
-- STEP 1 — core tables (from schema.sql)
-- ============================================================================

-- One row per SCHEDULE (historically "production"). PDF imports keep their
-- extracted schedule text (re-parsed on load by the same tested parser);
-- manual productions start from nothing. Both feed the identical ShootDay
-- data shape in the app. Rows link to a `prods` row via prod_id (STEP 2).
create table if not exists productions (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade default auth.uid(),
  title text not null,
  short text,
  kind text not null check (kind in ('pdf','manual')),
  unit text,
  schedule_text text,
  colour text,
  created_at timestamptz not null default now()
);

-- Hand-added shoot days. production_id null = a day added outside any
-- imported schedule.
create table if not exists manual_days (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade default auth.uid(),
  production_id uuid references productions(id) on delete cascade,
  num int not null,
  date text not null,
  loc text default '',
  hours text default '',
  type text default '',
  unit text not null default 'Main',
  created_at timestamptz not null default now(),
  unique nulls not distinct (owner, production_id, unit, num)
);

-- Per-day data keyed like the app: key = 'Main|13'.
-- kind 'cday' = crowd day-calculator config · kind 'adj' = stunt adjustments.
-- (The full set of allowed kinds is widened in STEP 3 and STEP 9.)
create table if not exists day_edits (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade default auth.uid(),
  production_id uuid references productions(id) on delete cascade,
  key text not null,
  kind text not null check (kind in ('cday','adj')),
  data jsonb not null,
  updated_at timestamptz not null default now(),
  unique nulls not distinct (owner, production_id, key, kind)
);

-- Row-level security: every row is private to the account that created it.
alter table productions enable row level security;
alter table manual_days enable row level security;
alter table day_edits  enable row level security;

drop policy if exists "own rows" on productions;
create policy "own rows" on productions
  for all using (owner = auth.uid()) with check (owner = auth.uid());

drop policy if exists "own rows" on manual_days;
create policy "own rows" on manual_days
  for all using (owner = auth.uid()) with check (owner = auth.uid());

drop policy if exists "own rows" on day_edits;
create policy "own rows" on day_edits
  for all using (owner = auth.uid()) with check (owner = auth.uid());

create index if not exists manual_days_prod on manual_days(production_id);
create index if not exists day_edits_prod   on day_edits(production_id);


-- ============================================================================
-- STEP 2 — productions gain grouping metadata + the `prods` entity
--          (from migration-2026-07-14.sql)
-- ============================================================================

-- Grouping metadata: the production name groups multiple uploaded schedules
-- (units / versions) in the sidebar, e.g.
--   Victura
--     · Main Unit – B&W – 11 May
--   Piccadilly
--     · Main Unit – Blue – 3 Jul
--     · 2nd Unit  – Blue – 3 Jul
alter table productions add column if not exists production  text;
alter table productions add column if not exists version     text;
alter table productions add column if not exists sched_date  text;

-- Declared schedule format (auto / expanded / oneliner) and the production's
-- own rate card ({name, vals}) applied when opened.
alter table productions add column if not exists format    text;
alter table productions add column if not exists rate_card jsonb;

-- Schedule revision history: many uploads per unit; is_current marks the one
-- that drives live numbers (default = newest upload; this is the manual
-- override).
alter table productions add column if not exists is_current boolean default false;

-- Productions become a real entity: created once with settings, then
-- schedules are imported INTO them.
create table if not exists prods (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null,
  colour text,
  rate_card jsonb,
  created_at timestamptz not null default now(),
  unique (owner, name)
);
alter table prods enable row level security;
drop policy if exists "own rows" on prods;
create policy "own rows" on prods
  for all using (owner = auth.uid()) with check (owner = auth.uid());

alter table productions add column if not exists prod_id uuid references prods(id) on delete cascade;
create index if not exists productions_prod on productions(prod_id);


-- ============================================================================
-- STEP 3 — widen day_edits kinds for per-scene edits + manual stunt days
--          (from migration-2026-07-14b.sql)
-- ============================================================================
-- Superseded by STEP 9, which widens the same constraint further. Applied here
-- in order so the file mirrors the real migration history.

alter table day_edits drop constraint if exists day_edits_kind_check;
alter table day_edits
  add constraint day_edits_kind_check
  check (kind in ('cday','adj','sced','stuntday'));


-- ============================================================================
-- STEP 4 — AI schedule reader: store the parsed structure
--          (from migration-2026-07-15.sql)
-- ============================================================================
-- Keeps an AI-read schedule (e.g. a one-liner the quick parser can't read)
-- alive across a reload instead of being re-parsed from text and lost.

alter table public.productions add column if not exists ai_model jsonb;


-- ============================================================================
-- STEP 5 — schedule glossary, document kind, scene stubs
--          (from migration-2026-07-15b.sql)
-- ============================================================================

-- Answers to "what does this notation mean?", remembered so the parser never
-- asks twice. production null = global (industry convention); set = that
-- production's own meaning, which overrides the global answer for that
-- production only. Scoped by production NAME to match the app's name-keyed
-- production registry.
create table if not exists schedule_glossary (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade default auth.uid(),
  term text not null,
  answer text not null,
  production text, -- null = global
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (owner, term, production)
);
alter table schedule_glossary enable row level security;
drop policy if exists "own rows" on schedule_glossary;
create policy "own rows" on schedule_glossary
  for all using (owner = auth.uid()) with check (owner = auth.uid());

-- What kind of document a schedule revision came from:
-- 'oneliner' | 'fullfat' | 'merged' (one-liner spine + Full Fat detail).
alter table productions add column if not exists doc_kind text;

-- Scene stubs on hand-added shoot days (the bulk calendar flow creates days
-- with their scene numbers in one pass). [{"num":"12"},{"num":"12A"},...]
alter table manual_days add column if not exists scenes jsonb;


-- ============================================================================
-- STEP 6 — production settings + change history, and the prods unique key
--          (from migration-2026-07-15c.sql and migration-2026-07-15d.sql)
-- ============================================================================

-- Per-production settings, all optional:
--   locations: [{name, override:'A'|'B'|null}]        (travel-band overrides)
--   info:      {company, people:[{role,name,email,invited}]}
--   cast_list: {"1":{character:"Maia",performer:"..."}, ...}
--   columns:   {cast:true, stunts:true, crowd:true}   (day-board visibility)
alter table prods add column if not exists locations jsonb;
alter table prods add column if not exists info      jsonb;
alter table prods add column if not exists cast_list jsonb;
alter table prods add column if not exists columns   jsonb;

-- Change history: one row per action on a production (publish, merge, settings
-- change, glossary answer, revision delete…). actor_email matters once invites
-- exist; until then it's the owner's email.
create table if not exists production_events (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade default auth.uid(),
  production text not null,
  actor_email text,
  kind text not null check (kind in ('schedule','settings','people')),
  detail text not null,
  created_at timestamptz not null default now()
);
alter table production_events enable row level security;
drop policy if exists "own rows" on production_events;
create policy "own rows" on production_events
  for all using (owner = auth.uid()) with check (owner = auth.uid());
create index if not exists production_events_prod on production_events(owner, production, created_at desc);

-- ---------------------------------------------------------------------------
-- The prods unique (owner, name) constraint.
--
-- ⚠️  DESTRUCTIVE STATEMENT — READ BEFORE EDITING ⚠️
--
-- Some early databases created `prods` with `create table if not exists`
-- BEFORE the unique constraint was part of the definition, so every prods
-- upsert failed with 42P10 and production settings silently didn't save.
-- The original fix (migration-2026-07-15d.sql) began with an unguarded
--
--     delete from prods a using prods b
--       where a.owner = b.owner and a.name = b.name and a.created_at < b.created_at;
--
-- which PERMANENTLY DELETES the older of any two same-named productions for
-- the same account — i.e. real production settings, rate-card overrides,
-- locations and cast lists.
--
-- Here it is guarded: the cleanup only runs when the unique constraint is
-- ABSENT. Once the constraint exists (which is the normal state, and the state
-- this file leaves the database in), duplicates cannot exist, the branch is
-- skipped entirely, and re-running this file can never delete anything.
--
-- On a brand-new project the table has no rows, so nothing is deleted at all.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.prods'::regclass
      and conname  = 'prods_owner_name_key'
  ) then
    -- Only reachable on a legacy database that never had the constraint.
    -- Keeps the NEWEST row per (owner, name); drops older duplicates.
    delete from prods a using prods b
      where a.owner = b.owner and a.name = b.name and a.created_at < b.created_at;

    alter table prods add constraint prods_owner_name_key unique (owner, name);
  end if;
end $$;


-- ============================================================================
-- STEP 7 — per-production "no AI" mode (confidentiality)
--          (from migration-2026-07-16.sql)
-- ============================================================================
-- When no_ai is true, schedule parsing uses ONLY the built-in deterministic
-- parser — no schedule text is ever sent to an external AI API for that
-- production, and the day-board weather lookup is disabled too.

alter table prods add column if not exists no_ai boolean not null default false;


-- ============================================================================
-- STEP 8 — admin rate cards + per-production rate overrides
--          (from migration-2026-07-16b.sql)
-- ============================================================================
-- Named, account-wide presets, one card PER DEPARTMENT — 'sa' (crowd:
-- PACT/FAA, PACT/Equity, customs) or 'stunts' (Equity Cinema Feature Film /
-- TV / SVOD, customs). Replaces the old browser-only "crowdos-ratecards"
-- localStorage mechanism (never synced, crowd-only).

create table if not exists rate_cards (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade default auth.uid(),
  kind text not null default 'sa' check (kind in ('sa','stunts','dancers','actors')),
  name text not null,
  vals jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (owner, kind, name)
);
alter table rate_cards enable row level security;
drop policy if exists "own rows" on rate_cards;
create policy "own rows" on rate_cards
  for all using (owner = auth.uid()) with check (owner = auth.uid());

-- Per-production field-level overrides on top of the production's chosen
-- cards — same override pattern as Locations' travel-band overrides.
-- Field ids are unique across departments, so one flat map covers both.
alter table prods add column if not exists rate_overrides jsonb;


-- ============================================================================
-- STEP 9 — final day_edits kinds + account-level blobs
--          (from migration-2026-08-05.sql)
-- ============================================================================
-- 1. The app writes 'notes', 'briefs', 'dayloc' and 'stuntcfg' through the
--    day_edits path. Under the STEP 3 constraint every one of those writes was
--    rejected — silently, because the call sites swallow the error. Widen the
--    constraint to what the app actually sends.
alter table day_edits drop constraint if exists day_edits_kind_check;
alter table day_edits
  add constraint day_edits_kind_check
  check (kind in ('cday','adj','sced','stuntday','stuntcfg','notes','briefs','dayloc'));

-- 2. Some things belong to the ACCOUNT, not to a production: the calculators'
--    scratch rows, the risk-assessment settings, and the dashboard's
--    stand-alone casting briefs (which by definition have no production).
--    user_blobs is one row per account per kind.
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


-- ============================================================================
-- STEP 10 — original uploaded documents: manifest column + private bucket
--           (from migration-2026-08-10.sql)
-- ============================================================================
-- Two parts:
--   1. productions.pdf_files — a small JSON manifest [{name,type,path}] that
--      points at files kept in the private Storage bucket below. The file
--      bytes never sit in a table row; only the manifest does.
--   2. a private Storage bucket ('schedule-files') that holds the bytes, each
--      file stored under  <auth.uid()>/<production_id>/<n>_<name>  so
--      row-level rules can scope every object to the account that owns it.

alter table productions add column if not exists pdf_files jsonb;

insert into storage.buckets (id, name, public)
values ('schedule-files', 'schedule-files', false)
on conflict (id) do nothing;

-- Row-level security on the stored objects: an account may only touch files
-- whose first path segment is its own user id. auth.uid() is the signed-in
-- user; storage.foldername(name) splits the object path on '/'.
drop policy if exists "schedule-files read own"   on storage.objects;
drop policy if exists "schedule-files insert own" on storage.objects;
drop policy if exists "schedule-files update own" on storage.objects;
drop policy if exists "schedule-files delete own" on storage.objects;

create policy "schedule-files read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'schedule-files'
         and (storage.foldername(name))[1] = auth.uid()::text);

create policy "schedule-files insert own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'schedule-files'
              and (storage.foldername(name))[1] = auth.uid()::text);

create policy "schedule-files update own" on storage.objects
  for update to authenticated
  using (bucket_id = 'schedule-files'
         and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'schedule-files'
              and (storage.foldername(name))[1] = auth.uid()::text);

create policy "schedule-files delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'schedule-files'
         and (storage.foldername(name))[1] = auth.uid()::text);


-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- The SELECTs below run automatically when you paste this whole file into the
-- SQL Editor; the last one is what the Results pane shows. Check it before
-- you tell anyone the database is ready.
--
-- Expect exactly 8 rows, every one with rls_enabled = true and its expected
-- policy count. Anything else means a step above did not apply.
-- ============================================================================

select
  t.tablename                                    as table_name,
  c.relrowsecurity                               as rls_enabled,
  (select count(*) from pg_policies p
     where p.schemaname = 'public'
       and p.tablename  = t.tablename)           as policies,
  case when c.relrowsecurity
        and (select count(*) from pg_policies p
               where p.schemaname = 'public' and p.tablename = t.tablename) >= 1
       then 'OK' else 'PROBLEM' end              as status
from pg_tables t
join pg_class c on c.oid = ('public.' || t.tablename)::regclass
where t.schemaname = 'public'
  and t.tablename in (
    'productions','manual_days','day_edits','prods',
    'schedule_glossary','production_events','rate_cards','user_blobs'
  )
order by t.tablename;

-- Storage: expect one row — schedule-files, public = false, policies = 4.
select
  b.id                                           as bucket,
  b.public                                       as is_public,
  (select count(*) from pg_policies p
     where p.schemaname = 'storage'
       and p.tablename  = 'objects'
       and p.policyname like 'schedule-files %') as policies,
  case when b.public = false
        and (select count(*) from pg_policies p
               where p.schemaname = 'storage'
                 and p.tablename  = 'objects'
                 and p.policyname like 'schedule-files %') = 4
       then 'OK' else 'PROBLEM' end              as status
from storage.buckets b
where b.id = 'schedule-files';
