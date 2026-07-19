-- Production Settings screen: per-production configuration + change history.
-- Safe to re-run. Run in the Supabase SQL editor for project ermmzgdxppyzawiueghz.

-- Per-production settings, all optional:
--   locations: [{name, override:'A'|'B'|null}]           (travel-band overrides)
--   info:      {company, people:[{role,name,email,invited}]}
--   cast_list: {"1":{character:"Maia",performer:"..."}, ...}
--   columns:   {cast:true, stunts:true, crowd:true}      (day-board visibility)
alter table prods add column if not exists locations jsonb;
alter table prods add column if not exists info jsonb;
alter table prods add column if not exists cast_list jsonb;
alter table prods add column if not exists columns jsonb;

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
