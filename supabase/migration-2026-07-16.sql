-- Per-production "no AI" mode (confidentiality): when no_ai is true, schedule
-- parsing uses ONLY the built-in deterministic parser — no schedule text is
-- ever sent to an external AI API for that production.
-- Safe to re-run. Run in the Supabase SQL editor.

alter table prods add column if not exists no_ai boolean not null default false;
