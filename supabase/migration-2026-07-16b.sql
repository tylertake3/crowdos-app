-- Admin rate cards: named, account-wide presets, one card PER DEPARTMENT —
-- 'sa' (crowd: PACT/FAA, PACT/Equity, customs) or 'stunts' (Equity Cinema
-- Feature Film / TV / SVOD, customs). Dancers/Actors departments arrive with
-- their costing build. Replaces the old browser-only "crowdos-ratecards"
-- localStorage mechanism (never synced, crowd-only).
-- Safe to re-run. Run in the Supabase SQL editor.

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
