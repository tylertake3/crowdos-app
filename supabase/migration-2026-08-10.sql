-- Store the ORIGINAL uploaded schedule documents (PDFs / photographed pages)
-- so a schedule's source can be re-opened side-by-side at any time, on any
-- device. Safe to re-run. Supabase → SQL Editor → paste → Run.
--
-- Two parts:
--   1. productions.pdf_files — a small JSON manifest [{name,type,path}] that
--      points at the files kept in the private Storage bucket below. The file
--      bytes never sit in a table row; only the manifest does.
--   2. a private Storage bucket ('schedule-files') that actually holds the
--      bytes, each file stored under  <auth.uid()>/<production_id>/<n>_<name>
--      so row-level rules can scope every object to the account that owns it.

-- 1. manifest column ---------------------------------------------------------
alter table productions add column if not exists pdf_files jsonb;

-- 2. private bucket ----------------------------------------------------------
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
