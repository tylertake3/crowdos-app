-- Productions gain grouping metadata: the production name groups multiple
-- uploaded schedules (units / versions) in the sidebar, e.g.
--   Victura
--     · Main Unit – B&W – 11 May
--   Piccadilly
--     · Main Unit – Blue – 3 Jul
--     · 2nd Unit – Blue – 3 Jul
-- Run once in Supabase: Dashboard → SQL Editor → paste → Run.

alter table productions add column if not exists production text;
alter table productions add column if not exists version text;
alter table productions add column if not exists sched_date text;

-- production settings: declared schedule format (auto / expanded / oneliner)
-- and the production's own rate card ({name, vals}) applied when opened
alter table productions add column if not exists format text;
alter table productions add column if not exists rate_card jsonb;

-- Productions become a real entity: created once with settings, then
-- schedules are imported INTO them (the `productions` table above is,
-- historically, one row per SCHEDULE; new rows link to a prod).
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
