-- Schedule review screen: glossary of schedule terms + document kind.
-- Safe to re-run. Run in the Supabase SQL editor for project ermmzgdxppyzawiueghz.

-- Answers to "what does this notation mean?" questions, remembered so the
-- parser never asks twice. production null = global (industry convention);
-- set = that production's own meaning, which overrides the global answer for
-- that production only. Scoped by production NAME to match the app's
-- name-keyed production registry.
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
