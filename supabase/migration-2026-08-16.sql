-- ===========================================================================
-- Rate cards: let a SPACT card actually save
-- ===========================================================================
-- The rate_cards table was created with a kind check that listed
-- ('sa','stunts','dancers','actors') — but the app has had a SPACT talent type
-- since the department split, so every custom SPACT card was rejected by the
-- database and lived on one device only. The loader quietly coerced anything
-- it didn't recognise to 'sa' on the way back in, which hid the failure.
--
-- Safe to run more than once.

alter table if exists public.rate_cards
  drop constraint if exists rate_cards_kind_check;

alter table if exists public.rate_cards
  add constraint rate_cards_kind_check
  check (kind in ('sa','spact','stunts','dancers','actors'));
