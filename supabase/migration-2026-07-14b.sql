-- Cloud-sync the two remaining browser-local stores:
--   · per-scene crowd/stunt edits (kind 'sced')
--   · manual per-day stunt entries (kind 'stuntday')
-- They live in the existing day_edits table (one blob row per production per
-- kind), so this just widens the allowed kinds. Run once in the SQL Editor.

alter table day_edits drop constraint if exists day_edits_kind_check;
alter table day_edits
  add constraint day_edits_kind_check
  check (kind in ('cday', 'adj', 'sced', 'stuntday'));
