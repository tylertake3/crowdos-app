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
