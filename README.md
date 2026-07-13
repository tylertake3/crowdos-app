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
- `lib/supabase.ts` — the shared Supabase client
- `.env.local` — your secret keys (never committed to git)

## Roadmap

- **Phase 1 (done):** working scaffold — Next.js + Supabase + GitHub + Vercel
- **Phase 2:** port the rate engine (PACT/FAA 2026 and Take 3 SPACT 2026
  rate cards), day calculator, and character/role tracking from the prototype
- **Phase 3:** schedule PDF import, day board, calendar, and cost breakdown views
