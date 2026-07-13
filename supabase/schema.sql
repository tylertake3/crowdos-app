-- CrowdOS per-production persistence
-- Run this once in Supabase: Dashboard → SQL Editor → New query → paste → Run.

-- One row per production. PDF imports keep their extracted schedule text
-- (re-parsed on load by the same tested parser); manual productions start
-- from nothing. Both feed the identical ShootDay data shape in the app.
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

-- Hand-added shoot days. production_id null = a day added to the built-in
-- demo schedule.
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
alter table day_edits enable row level security;

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
create index if not exists day_edits_prod on day_edits(production_id);
