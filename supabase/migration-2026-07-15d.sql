-- Fix: the prods table is missing its unique (owner, name) constraint in some
-- databases (created by an early `create table if not exists` before the
-- constraint was in the definition), so every prods upsert fails with 42P10
-- and production settings silently don't save to the cloud.
-- Safe to re-run. Run in the Supabase SQL editor.

-- 1) remove any duplicate rows first (keep the newest per owner+name)
delete from prods a using prods b
  where a.owner = b.owner and a.name = b.name and a.created_at < b.created_at;

-- 2) ensure the constraint the app's upsert relies on
alter table prods drop constraint if exists prods_owner_name_key;
alter table prods add constraint prods_owner_name_key unique (owner, name);
