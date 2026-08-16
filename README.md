# CrowdOS

Crowd and stunt budgeting and scheduling for UK film & TV production.

You import a shooting schedule — a PDF, or photographed pages — and CrowdOS
turns it into a day board with a cost breakdown: supporting artiste numbers,
day rates, overtime, night premiums, holiday pay, travel bands and agency fees,
costed against the PACT/FAA and Take 3 SPACT rate cards or your production's own
card. StuntOS is the companion side of the same app for stunt performer
budgeting.

Everything you create is private to your account and synced across your devices.

**Every figure it produces is an estimate — check it against your own rate card
before you rely on it.** See [`/privacy`](app/privacy/page.tsx) for the full
terms and privacy policy.

---

## Running locally

**1. Install dependencies**

```
npm install
```

**2. Set up a Supabase project and its database**

Create a project at [supabase.com](https://supabase.com), then:

> Dashboard → SQL Editor → New query → paste the whole of
> **`supabase/setup-all.sql`** → Run.

That one file creates all 8 tables, their indexes and row-level-security
policies, and the private `schedule-files` storage bucket with its policies. It
is safe to re-run. It ends with a verification query — check you get 8 rows, all
showing `rls_enabled = true` and `status = OK`.

> `supabase/schema.sql` and the `migration-*.sql` files are the original
> migration history, kept for reference. **Do not run them individually**, and
> do not run `cat supabase/*.sql | psql` — `schema.sql` sorts last
> alphabetically, so the migrations would run before their tables exist and fail
> immediately. `setup-all.sql` applies everything in the correct order.

**3. Add your environment variables**

Copy `.env.local.example` to `.env.local` and fill it in. See
[Environment variables](#environment-variables) below.

**4. Start the dev server**

```
npm run dev
```

Open http://localhost:3000.

**With Supabase configured you land on a sign-in gate** — the app requires an
account. Create one from the gate (or add a user in the Supabase dashboard with
*Auto Confirm* ticked), and you land in an empty dashboard ready for your first
production.

If `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` are missing, the
gate never appears and the app runs entirely in the browser: nothing is saved to
an account and nothing syncs. That is a useful mode for poking at the UI, and a
silent disaster in production — see the redeploy warning in
[`docs/LAUNCH.md`](docs/LAUNCH.md).

---

## Environment variables

Six in total. `.env.local.example` is the authoritative copy with full notes;
this is the summary.

| Variable | Required | Read at | Notes |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | **build** | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | **build** | Public by design; RLS is what protects the data |
| `ANTHROPIC_API_KEY` | for AI reading | runtime, server only | Never prefix with `NEXT_PUBLIC_` |
| `SUPABASE_DB_URL` | for backups | runtime, local only | Full-access DB credential — **never put this on Vercel** |
| `CSP_REPORT_URI` | no | **build** | CSP violation collector endpoint (`next.config.mjs`) |

**Build-time matters.** `NEXT_PUBLIC_*` values and `CSP_REPORT_URI` are baked
into the build. Changing one on Vercel does nothing until you **redeploy**.

`SUPABASE_DB_URL` is the Session-pooler connection string from Supabase →
Connect, with the password filled in. `npm run backup` exits 1 without it. It
bypasses row-level security entirely, so it lives in your local `.env.local` and
nowhere else.

---

## Tests

```
npm test
```

Vitest, pinned to `TZ=Europe/London` (dates and shoot-day boundaries are
timezone-sensitive). Covers the rate engine, the schedule parser, revision
merging, money rounding and the parse-schedule route's helpers.

A production build, including type-checking, without touching the dev server's
`.next` cache:

```
npm run build:check
```

Run both before pushing.

---

## Deploying

Hosted on Vercel, connected to this GitHub repo — a push to `main` deploys.

Before a real user signs up, work through
**[`docs/LAUNCH.md`](docs/LAUNCH.md)**. It covers everything that is a dashboard
setting rather than a commit: the Anthropic spend limit (the app calls Claude on
*your* key and there is no per-user billing), Supabase auth and storage
configuration, the Vercel environment variables and the redeploy they require,
the function-duration ceiling, a smoke test done as a stranger would experience
it, and how to delete a user and all their data.

Backups:

```
npm run backup
```

Dumps the `public` and `auth` schemas to a dated, gzipped file in `backups/`.
Needs `SUPABASE_DB_URL` and `pg_dump` (`brew install libpq`). It does **not**
back up Storage — uploaded PDFs are not in the dump.

---

## Project structure

| Path | What's in it |
| --- | --- |
| `app/` | Next.js App Router — layout, page, `/privacy`, and the `parse-schedule` API route |
| `app/api/parse-schedule/` | The AI schedule reader. Server-only; requires a signed-in user; per-user rate limited |
| `lib/engine/` | The rate engine (PACT/FAA and Take 3 SPACT in separate modules), schedule parser, revision merge, cost breakdown — all covered by `npm test` |
| `lib/board/app.js` | The board UI, ported from the validated prototype |
| `lib/board/cloud.js` | The Supabase data layer — auth, per-table sync, file upload |
| `lib/supabase.ts` | The shared Supabase client (`null` when not configured) |
| `supabase/setup-all.sql` | **The database.** Run this one file |
| `supabase/schema.sql`, `migration-*.sql` | Migration history, for reference only |
| `scripts/backup-db.sh` | `npm run backup` |
| `docs/LAUNCH.md` | Pre-launch checklist |
| `next.config.mjs` | Security headers and the Content Security Policy (with an honest note on what it is and is not worth) |

---

## Privacy note for contributors

Schedules are confidential. When AI reading is enabled, schedule text and page
images are sent to Anthropic; day locations are sent to open-meteo for the
forecast. Both are disabled by the per-production **AI schedule reading** switch.
`app/privacy/page.tsx` documents this precisely — **if you change what leaves
the app, change that page in the same commit.**
