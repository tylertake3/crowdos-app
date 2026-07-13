# CrowdOS

Crowd budgeting and scheduling platform for the UK film & TV industry, with
StuntOS as a companion tool for stunt performer budgeting.

Built with Next.js + Supabase, deployed on Vercel.

## Running locally

1. Install dependencies (first time only):

   ```
   npm install
   ```

2. Copy `.env.local.example` to `.env.local` and fill in your Supabase
   project URL and anon key (from Supabase → Project Settings → API).

3. Start the dev server:

   ```
   npm run dev
   ```

4. Open http://localhost:3000 — the home page shows a setup check that
   confirms Next.js and Supabase are both working.

## Project structure

- `app/` — pages and layout (Next.js App Router)
- `lib/engine/` — the rate engine (PACT/FAA 2026 and Take 3 SPACT 2026 kept
  in separate modules), schedule parser, and demo data — covered by `npm test`
- `lib/board/` — the board UI (ported from the validated prototype) and the
  Supabase cloud-sync layer
- `supabase/schema.sql` — database schema; run once in the Supabase SQL Editor
- `lib/supabase.ts` — the shared Supabase client
- `.env.local` — your secret keys (never committed to git)

## Cloud persistence

Signed out, the app runs on the demo schedule and keeps any work in the
browser only. Signing in (email + password, top right) stores productions,
manual shoot days, and day-calculator edits privately per account in
Supabase, synced across devices. The built-in demo schedule and its edits
always stay local.

## Roadmap

- **Phase 1 (done):** working scaffold — Next.js + Supabase + GitHub + Vercel
- **Phase 2:** port the rate engine (PACT/FAA 2026 and Take 3 SPACT 2026
  rate cards), day calculator, and character/role tracking from the prototype
- **Phase 3:** schedule PDF import, day board, calendar, and cost breakdown views
