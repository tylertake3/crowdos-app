-- Recurring crowd groups. Safe to re-run. Supabase → SQL Editor → Run.
--
-- A recurring group is a production-level named cohort ("Hotel Guests",
-- "Bob's Security") that scenes reference across days, so the run's unique-head
-- count is the pool (peak), not the sum. The registry is one blob row per
-- production, synced through the same day_edits path as sced/briefs/notes.
-- Widen the kind constraint to admit 'rgroups' (previous write would have been
-- silently rejected by the check constraint, exactly like notes/briefs were).

alter table day_edits drop constraint if exists day_edits_kind_check;
alter table day_edits
  add constraint day_edits_kind_check
  check (kind in ('cday','adj','sced','stuntday','stuntcfg','notes','briefs','dayloc','rgroups'));
