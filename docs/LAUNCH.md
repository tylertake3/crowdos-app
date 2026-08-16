# Deployment / pre-launch checklist

Everything you have to do **outside the codebase** before someone who is not
you can sign up. The code being correct is not the same as the deployment being
safe — most of what follows is a dashboard setting, and none of it can be fixed
by a commit.

Work top to bottom. The two items that matter most, if you only do two:

1. **Set a monthly spend limit on your Anthropic key** (§1) — otherwise your
   card is the only thing standing between you and a runaway bill.
2. **Turn off open sign-ups and create the first account by hand** (§2.7) —
   free, reversible, and it removes almost the entire abuse surface.

> **After launch, read `docs/OPERATIONS.md`.** This file is the one-off list you
> work through once. That one is how you *run* the thing afterwards: how you
> find out something broke, what to check weekly, how to read your AI spend, and
> what to do when a user says they have lost their work. Worth ten minutes
> before you invite anyone, so you are not reading it for the first time during
> an incident.

---

## 1. Anthropic Console — spend limits

The app calls Claude on **your** API key. Every AI schedule read a user runs is
billed to you. There is no per-user billing, no quota, and no card on file for
them.

### Why the numbers get big fast

The schedule reader splits a schedule into chunks and reads them in parallel.
Claude Opus is **$5 per million input tokens and $25 per million output
tokens**; photographed pages cost roughly 20,000 image tokens each, several
times a text chunk.

A real feature schedule extracts to roughly 150–400KB of text, so **one full
read is on the order of 40–100k input tokens** — cents to tens of cents. That
sounds fine. The problem is multiplication:

- The per-user rate limit in `app/api/parse-schedule/helpers.ts` allows roughly
  **40 full reads per user per hour**. That is deliberately generous, so a
  producer fixing a schedule in one sitting never hits it.
- 40 reads/hour is on the order of **£15–30 per user per hour** at the top end
  — of *one* user being enthusiastic, not malicious.
- 50 curious sign-ups in an afternoon, each poking at it, is realistically
  **~£750**. Someone deliberately hammering it with maximum-size uploads across
  several accounts is **£1,000+ in ten minutes**.

Two things make the in-app rate limit weaker than it looks, and you should
assume both:

- It is **in-memory, per serverless instance**. Vercel runs many instances and
  recycles them; the counter resets on every cold start and is not shared
  between concurrent instances. The real ceiling is higher than 40/hour.
- It is **per user id**. With open sign-ups, one person can have as many user
  ids as they like. This is why §2.7 matters.

### Do this

- [ ] **Create a separate production API key.** Console → API keys → Create Key,
      name it something like `crowdos-production`. Do not reuse your personal
      development key — you want to be able to revoke one without breaking the
      other, and you want the usage graph to mean something.
- [ ] **Set a monthly spend limit** on the workspace the production key belongs
      to (Console → Settings → Limits). Pick a number you would be annoyed but
      not ruined by — for early access, something like **£50–100/month** is
      sensible. You can always raise it.
- [ ] **Set an alert threshold** below the limit (e.g. alert at 50%), with your
      email on it, so you find out from a notification rather than from an
      invoice.
- [ ] **Consider a separate workspace** for production, so the limit applies
      only to the app and your own experimenting cannot eat the budget.
- [ ] Put the production key in Vercel as `ANTHROPIC_API_KEY` (§3), and keep
      your dev key in local `.env.local` only.

If the limit is hit, schedule reading fails and the app falls back to the
built-in parser. That is a much better failure than a bill.

---

## 2. Supabase

### 2.1 Run the database setup

- [ ] Dashboard → SQL Editor → New query → paste the whole of
      **`supabase/setup-all.sql`** → Run.
- [ ] Check the results pane: **8 rows, every one `rls_enabled = true`,
      `status = OK`**, then the storage row showing `schedule-files`,
      `is_public = false`, `policies = 4`, `status = OK`.

Do **not** run the individual `migration-*.sql` files, and do not try
`cat supabase/*.sql | psql` — `schema.sql` sorts last alphabetically, so the
migrations would run before the tables exist. `setup-all.sql` is the single
correct path and is safe to re-run.

### 2.2 Storage bucket

Dashboard → Storage → `schedule-files`:

- [ ] It shows **Private**, not Public. (The SQL sets this; verify it visually
      anyway — this is where users' uploaded schedules live.)
- [ ] Set a **file size limit of 25MB**. Bucket settings → File size limit.
- [ ] Set **allowed MIME types**, exactly these four:
      `application/pdf`, `image/jpeg`, `image/png`, `image/webp`.
      Without this, the bucket accepts anything a signed-in user sends it.

### 2.3 Site URL — the one that silently breaks sign-ups

Dashboard → Authentication → URL Configuration:

- [ ] **Site URL** must be your real production URL
      (`https://your-domain.com`), **not** `http://localhost:3000`.

If this is left on localhost, every confirmation email you send contains a link
to `localhost:3000` — which works on your machine and is a dead link for
everyone else. The user signs up, gets an email, clicks it, gets nothing, and
concludes the product is broken. This is the single most common way a first
invite fails.

- [ ] **Redirect URLs** — add all of these:
  - `https://your-domain.com/**`
  - your Vercel preview pattern, e.g. `https://*-your-team.vercel.app/**`
  - `http://localhost:3000/**` (so your own dev sign-in still works)

The Site URL must match the production domain you set in Vercel (§3) exactly —
same scheme, same host, no trailing slash mismatch.

### 2.4 Email confirmation

Dashboard → Authentication → Providers → Email:

- [ ] **Confirm email = ON.** Without it, anyone can sign up with an address
      they do not control.

### 2.5 Password policy

Dashboard → Authentication → Policies (or Providers → Email):

- [ ] Raise **Minimum password length from 6 to 10**.
- [ ] If offered, enable the leaked-password check.

Six characters is Supabase's default and is not a real password.

> ### ⚠️ Known inconsistency — the client still says 6
>
> **If you set Supabase to 10, the sign-up form will let people type an
> 8-character password, accept it, and then fail.** The client-side check in
> `lib/board/app.js` enforces a minimum of **6**, not 10. Supabase rejects the
> password on the server, and the user sees a raw API error rather than "your
> password needs to be at least 10 characters" — at the exact moment they are
> deciding whether this product is any good.
>
> This is a **code change and it is not fixed here** (this checklist and the
> board are owned separately). Two ways out, pick one:
>
> - **Preferred — align the client.** Raise the client-side minimum in
>   `lib/board/app.js` to 10 so the form validates before submitting. Raise it
>   as a task for whoever owns the board. There are **five** places, and missing
>   one leaves the same bug in a different corner:
>   1. `if(pw.length<6)` — the sign-up / sign-in check (~line 11424)
>   2. `if(a.length<6)` — the "choose a new password" reset panel (~line 11489)
>   3. the `#auPassHint` text set at ~line 11370 (both the sign-up and sign-in
>      variants say "At least 6 characters")
>   4. the two hard-coded `At least 6 characters.` hints in the gate markup
>      (~lines 130 and 158)
>   5. the friendly-error mapping at ~line 11388, which rewrites Supabase's
>      rejection as "It needs to be at least 6 characters" — with Supabase set
>      to 10, that message is actively wrong and will send users in circles
> - **Interim — leave Supabase at its default of 6** until the client is
>   aligned, and accept weaker passwords for a hand-invited launch where you
>   created every account yourself (§2.7). Weak-but-working beats
>   strong-but-broken-signup.
>
> **What you must not do is set 10 here and change nothing else**, which is what
> this checklist told you to do before this note existed. Whichever you pick,
> test it: try to create an account with a 7-character password and see what the
> user actually gets.

### 2.6 Rate limits

Dashboard → Authentication → Rate Limits. Lower these from the defaults:

- [ ] Sign-ups per hour — set it low (e.g. 5–10). This is a direct brake on the
      spend scenario in §1.
- [ ] Emails per hour — low, or the built-in SMTP will be exhausted anyway.
- [ ] Token refreshes / verification attempts — leave generous enough that real
      use is not affected, but below the default.

### 2.7 ⭐ Turn OFF open sign-ups (highest value, costs nothing)

Dashboard → Authentication → Providers → Email → **Allow new users to sign up:
OFF**.

Then create each real account by hand:

- Dashboard → Authentication → Users → **Add user**
- Enter their email, set a temporary password
- **Tick Auto Confirm User** (otherwise they sit unconfirmed)
- Send them the address and password out of band; they change it on first
  sign-in.

With sign-ups closed, the only people who can spend your Anthropic budget are
people you personally added. Every abuse scenario in §1 requires an account.
This is reversible in one click when you are ready to open up, and it is the
right posture for early access with a handful of users.

The app's sign-in gate still shows a "Create account" button — it will simply
fail for anyone who is not you. That is acceptable for a hand-invited launch;
if it bothers you, that is a code change for another day.

### 2.8 Emails — actually test them

- [ ] Change the sender name from **"Supabase Auth"** to something a human
      recognises (Authentication → Emails → Templates / SMTP settings). An
      email from "Supabase Auth" about a product called CrowdOS looks like
      phishing and gets deleted.
- [ ] Consider configuring your own SMTP (Resend, Postmark, SES). The built-in
      Supabase mailer is rate-limited and intended for development; it is not a
      delivery guarantee.
- [ ] **Send yourself a real confirmation email, to an address on a different
      provider than yours**, and click the link end to end. Check it does not
      land in spam. Do this after §2.3, or you will just be testing localhost.

### 2.9 Google sign-in — configure it or hide the button

The sign-in gate shows a **"Continue with Google"** button. If Google OAuth is
not configured in Supabase, that button leads to an error page, which is a
terrible first impression.

- [ ] Either: configure it properly — Google Cloud Console → OAuth consent
      screen (published, with the privacy policy URL pointing at
      `https://your-domain.com/privacy`) → Credentials → OAuth client ID, with
      Supabase's callback URL as an authorised redirect URI; then paste the
      client id and secret into Supabase → Authentication → Providers → Google.
- [ ] Or: have the Google button hidden. That is a code change in
      `lib/board/app.js` — raise it as a task rather than shipping a button that
      does not work.

Do not leave it half-done.

---

## 3. Vercel

### 3.1 Environment variables

Project → Settings → Environment Variables. Add all three to **Production AND
Preview**:

- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] `ANTHROPIC_API_KEY` — the production key from §1

Do **not** add `SUPABASE_DB_URL`. That is a full-access database credential that
bypasses row-level security; the app never reads it, and it belongs only in your
local `.env.local` for `npm run backup`.

### 3.2 ⚠️ REDEPLOY after adding them

- [ ] Deployments → latest → **Redeploy**.

`NEXT_PUBLIC_*` values are **inlined into the browser bundle at build time**.
An existing deployment was built without them and will never pick them up, no
matter how long you wait or how many times you reload.

**The symptom is not an error.** `lib/supabase.ts` returns `null` when the URL
and key are missing, and the app is written to keep working without a backend:
the sign-in gate never appears, nothing syncs, and everything is stored in the
one browser. It looks like it is working. Your tester will do an afternoon of
real work and lose all of it.

If you add or change a `NEXT_PUBLIC_*` variable, redeploy. Every time.

### 3.3 Function duration — check the 300-second limit is real

`app/api/parse-schedule/route.ts` declares `maxDuration = 300`. Whether you
actually get 300 seconds depends on the plan:

- **Hobby without Fluid Compute: the ceiling is 60 seconds**, and the declared
  300 is silently clamped. Large schedule reads die at 60s. The route is written
  to return whatever it has managed to read, so the user sees a partial
  schedule and no obvious error — which is worse than a clean failure, because
  they may not notice days are missing.

- [ ] Project → Settings → Functions → confirm **Fluid Compute is ON**, or that
      your plan otherwise allows 300s.
- [ ] Verify it for real: upload the biggest schedule you have and confirm it
      completes rather than truncating at the one-minute mark.

### 3.4 Domain

- [ ] Project → Settings → Domains → set the production domain.
- [ ] It must **match the Supabase Site URL from §2.3 exactly** — same scheme,
      same host. A mismatch breaks confirmation and OAuth redirects.

---

## 4. Smoke test — as the stranger, not as you

Do this in a **private / incognito window**, signed out of everything, ideally
on a different device or network. Your normal browser has a session, a cache and
a localStorage full of your own data; it will hide exactly the failures you are
looking for.

- [ ] Open the production URL. **The sign-in gate appears.** If it does not, the
      env vars did not reach the build — go back to §3.2.
- [ ] Create an account (or sign in with the one you created by hand in §2.7).
- [ ] Receive the confirmation email. Check the sender name. Check it is not in
      spam. Click the link — it goes to the production domain, not localhost.
- [ ] Land in the app signed in.
- [ ] Create a production. Upload a real schedule PDF.
- [ ] Run an AI read. Check the review screen. Publish it.
- [ ] Open the day board, open a day, edit the day calculator, check a number.
- [ ] Export to Excel and to PDF.
- [ ] **Close the browser entirely, reopen, sign in again — the work is still
      there.** This is the test that proves cloud sync is actually on.
- [ ] Open the same account on a second device. The productions appear.
- [ ] Find the privacy policy link and click it — `/privacy` loads.
- [ ] Open `https://your-domain.com/api/health`. It must say
      **`"status": "ok"`** with all three config booleans `true`. A `503` /
      `"misconfigured"` here means an environment variable never reached the
      build — go back to §3.2 before you invite anyone.
- [ ] Turn off AI schedule reading in Production Settings; confirm the weather
      panel says it is off rather than silently showing nothing.
- [ ] Delete the test production and confirm it goes.

Then check the Anthropic Console usage page and see what that whole session
cost you. Multiply by the number of people you are about to invite.

---

## 5. Deleting a user and all their data

The privacy policy promises deletion on request, so you need to be able to do
this. **It is two steps, and the second one is not automatic.**

### Step 1 — the files (do this FIRST)

Deleting the auth user does **not** cascade to Supabase Storage. Storage objects
are not linked to `auth.users` by a foreign key, so the files are simply
orphaned and stay there forever.

Get the user's uid first (Dashboard → Authentication → Users → click the user →
copy the UUID), then:

- Dashboard → Storage → `schedule-files` → open the folder named
  **`<uid>/`** → select everything → delete → delete the folder.

Do this **before** step 2. Once the auth row is gone you have to go digging for
the uid.

### Step 2 — the database rows

- Dashboard → Authentication → Users → find the user → **Delete user**.

This cascades. Every one of the 8 tables has
`owner uuid references auth.users(id) on delete cascade`, so deleting the auth
row removes their rows from `productions`, `manual_days`, `day_edits`, `prods`,
`schedule_glossary`, `production_events`, `rate_cards` and `user_blobs` in one
go.

### Step 3 — confirm

Run this in the SQL Editor with their uid. **Every count must be 0:**

```sql
-- replace with the deleted user's uid
with u as (select '00000000-0000-0000-0000-000000000000'::uuid as uid)
select 'productions'       as t, count(*) from productions,       u where owner = u.uid
union all select 'manual_days',        count(*) from manual_days,        u where owner = u.uid
union all select 'day_edits',          count(*) from day_edits,          u where owner = u.uid
union all select 'prods',              count(*) from prods,              u where owner = u.uid
union all select 'schedule_glossary',  count(*) from schedule_glossary,  u where owner = u.uid
union all select 'production_events',  count(*) from production_events,  u where owner = u.uid
union all select 'rate_cards',         count(*) from rate_cards,         u where owner = u.uid
union all select 'user_blobs',         count(*) from user_blobs,         u where owner = u.uid
union all select 'storage_objects',    count(*) from storage.objects,    u
          where bucket_id = 'schedule-files'
            and (storage.foldername(name))[1] = u.uid::text;
```

A non-zero `storage_objects` count means step 1 was missed.

Then reply to the requester confirming it is done. Note that encrypted database
backups may still contain their data for a short period before they rotate out
— the privacy policy says so, and that is normal and defensible.

---

## 6. Backups

### 6.1 The manual backup (do this once, now)

- [ ] Add `SUPABASE_DB_URL` to your local `.env.local` (Supabase Dashboard →
      Connect → Session pooler URI, with `[YOUR-PASSWORD]` replaced).
- [ ] `brew install libpq` if `pg_dump` is missing.
- [ ] Run `npm run backup` once and confirm you get a file in `backups/`.
- [ ] Copy backups somewhere that is not this Mac (iCloud, Drive, an external
      disk). A backup that only exists on the machine that made it is not a
      backup.
- [ ] Take one **before** you invite anyone, so you have a clean restore point.
- [ ] **Restore it into a scratch Supabase project once**, to prove it works. A
      backup you have never restored is a hypothesis, not a backup.

### 6.2 The automatic nightly backup

`.github/workflows/backup.yml` now runs the same script every night at 03:17 UTC
and keeps the dump as a downloadable GitHub artefact for 30 days. It does
nothing at all until you give it the credential:

- [ ] GitHub → your repo → **Settings → Secrets and variables → Actions → New
      repository secret**:

      Name:   SUPABASE_DB_URL
      Value:  the same Session pooler URI you put in .env.local

- [ ] Then GitHub → **Actions → Backup database → Run workflow** to test it
      immediately rather than waiting for 3am, and confirm the run is green and
      has an artefact attached.

Until that secret exists the workflow runs, logs "backup skipped", and **passes**
— so it will not sit there red, and a public fork of this repo will not fail.

> ⚠️ **Only add this secret if the repository is PRIVATE.** `SUPABASE_DB_URL` is
> a full-access database credential that bypasses row-level security completely.
> Anyone who can push a workflow to the repo can print it. On a solo private
> repo that is only you — but it stops being true the moment you add a
> collaborator or make the repo public. If the repo is public, skip this and
> keep running `npm run backup` by hand.
>
> Note this is the one exception to §3.1's "do not put `SUPABASE_DB_URL`
> anywhere but `.env.local`". It still must never go on **Vercel** — the app
> never reads it, so it would be pure risk with no benefit.

### 6.3 ⚠️ What the backup does NOT cover

`npm run backup` and the nightly Action both dump the `public` and `auth`
schemas — every app table and every user account. Neither backs up **Supabase
Storage.**

Every schedule PDF and photographed page your users upload lives in the
`schedule-files` bucket, and **none of it is in the dump.** A restore gives you a
complete set of database rows pointing at files that are gone.

This is survivable — the extracted schedule data is in the database, and the
source PDFs are usually documents the user already has — but know it before you
are relying on it. `docs/OPERATIONS.md` §6 has the command for pulling Storage
down separately if you want to close the gap.

---

## 6a. CI — the checks that now run themselves

There is a GitHub Actions workflow (`.github/workflows/ci.yml`) that runs on
every push and pull request: lint, TypeScript type-check, the 516 tests, a
quality ratchet, and a full production build. Two to four minutes.

Nothing to configure — it works as soon as the repo is on GitHub. Two things
worth doing:

- [ ] Push once and confirm the run goes green (GitHub → **Actions**).
- [ ] Consider **Settings → Branches → protect `main`** so a red build cannot be
      merged. Optional for a solo repo, but it makes the tick mean something.
- [ ] Before pushing anything, run `npm run verify` locally — the same checks,
      without waiting for CI.

`.github/dependabot.yml` also opens a small **weekly** batch of grouped
dependency-update PRs, each one gated by CI. Merge them when they are green;
anything under GitHub → **Security → Dependabot alerts** is a real advisory and
should jump the queue.

A green CI tick means "this did not obviously break". It does **not** mean the
deployment is configured, that the AI key works, or that the numbers are right —
none of which CI can see. That is what §4's smoke test and `/api/health` are for.

---

## 6b. After launch — how you find out something broke

Right now: **you don't.** Nothing emails you when a user hits a failure, and on
Vercel's Hobby plan **runtime logs are kept for one hour** — a user reporting a
lunchtime problem at 6pm is describing something you can no longer see.

Two things close most of that gap for free:

- [ ] **Point a free uptime monitor at `https://your-domain.com/api/health`**
      (UptimeRobot or Better Stack, five minutes to set up), alerting to your
      phone on any non-200. That endpoint returns **200 `"ok"`** when the deploy
      has all its environment variables and **503 `"misconfigured"`** when one is
      missing — which is exactly the silent §3.2 failure where the app looks fine
      and nothing is syncing. It reports booleans only, never any values, so it
      is safe to leave public.
- [ ] Open `/api/health` yourself right after your first deploy, as part of §4.
- [ ] Read **`docs/OPERATIONS.md`** — it covers the free Sentry option, the
      ten-minute weekly check, how to read your Anthropic spend, and the
      incident runbook for "I've lost my work", "the AI reader is down", "the
      site is down", and "please delete my data".

---

## 7. A note on `vercel.json`

There isn't one, deliberately.

Function duration is already declared in code — `app/api/parse-schedule/route.ts`
exports `maxDuration = 300`, and a compile-time check keeps it in step with
`MAX_DURATION_S` in `helpers.ts`. Route segment config is the supported Next.js
mechanism and it is type-checked; adding a second declaration in `vercel.json`
would create two places to drift, with no benefit.

More to the point, `vercel.json` **cannot lift the real constraint**. The 60s
Hobby ceiling in §3.3 is a plan/Fluid-Compute setting; a `maxDuration` in
`vercel.json` is clamped by it exactly as the code-side one is. And nobody has
measured this app's peak memory, so pinning a memory value would be a guess that
either wastes money or causes OOM kills under load.

If a future need appears — pinning a region for data residency, per-route memory
after actual measurement — add it then, with a reason.

---

## Quick reference

| Setting | Where | Value |
| --- | --- | --- |
| Monthly spend limit | Anthropic Console → Limits | e.g. £50–100 |
| Spend alert | Anthropic Console → Limits | ~50% of limit |
| Production API key | Anthropic Console → API keys | separate from dev |
| Database schema | Supabase → SQL Editor | run `supabase/setup-all.sql` |
| Bucket visibility | Supabase → Storage → schedule-files | **Private** |
| Bucket file size limit | Supabase → Storage → schedule-files | 25MB |
| Bucket MIME types | Supabase → Storage → schedule-files | pdf, jpeg, png, webp |
| Site URL | Supabase → Auth → URL Configuration | production URL, **not** localhost |
| Redirect URLs | Supabase → Auth → URL Configuration | prod + preview + localhost |
| Confirm email | Supabase → Auth → Providers → Email | ON |
| Min password length | Supabase → Auth → Policies | 10 — ⚠️ but the client checks 6, see §2.5 |
| Allow new users to sign up | Supabase → Auth → Providers → Email | **OFF** |
| Auth rate limits | Supabase → Auth → Rate Limits | lowered |
| Email sender name | Supabase → Auth → Emails | not "Supabase Auth" |
| Google OAuth | Supabase → Auth → Providers → Google | configured, or button hidden |
| Env vars | Vercel → Settings → Environment Variables | 3 vars, Production **and** Preview |
| Redeploy | Vercel → Deployments | after any `NEXT_PUBLIC_*` change |
| Fluid Compute | Vercel → Settings → Functions | ON (for 300s) |
| Production domain | Vercel → Settings → Domains | matches Supabase Site URL |
| Nightly backup secret | GitHub → Settings → Secrets and variables → Actions | `SUPABASE_DB_URL` — **private repos only** (§6.2) |
| CI | GitHub → Actions | green on every push; nothing to configure (§6a) |
| Health check | `https://your-domain.com/api/health` | `200` / `"status": "ok"` (§6b) |
| Uptime monitor | UptimeRobot / Better Stack (free) | polls `/api/health`, alerts on non-200 (§6b) |
| Day-to-day operations | `docs/OPERATIONS.md` | weekly checks + incident runbook |
