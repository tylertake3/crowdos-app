-- AI schedule reader (prototype): store the AI's parsed structure alongside the
-- raw schedule text, so an AI-read schedule (e.g. a one-liner the quick parser
-- can't read) survives a reload instead of being re-parsed from text and lost.
--
-- Safe to re-run. Run in the Supabase SQL editor for project ermmzgdxppyzawiueghz.

alter table public.productions
  add column if not exists ai_model jsonb;
