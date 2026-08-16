# Running CrowdOS

**Who this is for:** you, on your own, possibly at 11pm, possibly after a user
has messaged you saying something is broken.

`docs/LAUNCH.md` is the one-off list you work through before you invite anyone.
**This** is the one you come back to. It answers three questions:

1. [How do I find out something broke?](#1-how-you-find-out-something-broke) —
   honest answer: today, mostly, you don't.
2. [What should I check, and how often?](#3-the-weekly-check-ten-minutes)
3. [Something is broken right now, what do I do?](#5-incident-runbook) — the
   runbook. Jump straight there if that is why you are reading this.

---

## 1. How you find out something broke

Start here, because the honest answer is uncomfortable and worth knowing before
you need it.

### Right now, the answer is: a user tells you

There is no error monitoring in this app. Nothing emails you. Nothing pages
you. If a producer's schedule read fails at 4pm on a Tuesday, the failure
happens, the app shows them a polite message, and **you do not find out unless
they message you.** Assume most of them will not — they will conclude the tool
is flaky and go back to their spreadsheet.

That is the gap. Section 2 closes it for about twenty minutes of work and £0.

### What Vercel gives you, and its expiry date

Vercel → your project → **Logs** (the Runtime Logs tab) shows every request the
server handled: the URL, the status code, the duration, and anything the code
printed. It is genuinely useful and it is the first place to look.

**It is also on a very short timer.** How long logs are kept depends entirely
on your plan:

| Your Vercel plan | Runtime logs kept for | Built-in error alerts? |
| --- | --- | --- |
| **Hobby** (free) | **1 hour** | No |
| Pro | 1 day | No — needs Observability Plus |
| Pro + Observability Plus | 30 days | **Yes** — anomaly alerts on 5xx |
| Enterprise | 3 days | With Observability Plus |

**One hour.** Read that again if you are on Hobby. A user who hits an error over
lunch and messages you at 6pm is describing something you can no longer see.
The evidence is gone. This is the single most important operational fact about
your current setup.

There are also per-request caps regardless of plan: 256 log lines per request,
1MB of log output per request. A very chatty request gets truncated.

**Log Drains** (streaming logs somewhere permanent) are **Pro and above only** —
there is no free path to them from Hobby. Vercel's **Anomaly Alerts**, which
email you when a route's 5xx rate spikes, require **Observability Plus**, which
requires paid Pro. Both are good; neither is available to you for free.

### Supabase

Supabase → **Logs** covers the database and auth side: failed sign-ins, rejected
queries, row-level-security denials, rate-limit hits. Free-plan log retention is
also short (about a day). Supabase → **Reports** gives you slower-moving
information — database size, request counts — that survives longer.

This is where you look for "the user cannot sign in", as opposed to "the app
threw an error", which is Vercel.

---

## 2. Minimum viable monitoring (do this — it is free)

Two things, in priority order. The first is five minutes and costs nothing.

### 2a. Uptime + health check monitoring — do this first

The app now has a health endpoint at **`/api/health`**. Open it in a browser:

```
https://your-domain.com/api/health
```

You get JSON:

```json
{
  "status": "ok",
  "config": { "supabaseUrl": true, "supabaseAnonKey": true, "anthropicApiKey": true },
  "time": "2026-08-16T22:14:03.918Z"
}
```

- **`"status": "ok"` and HTTP 200** — the server has every environment variable
  it needs.
- **`"status": "misconfigured"` and HTTP 503** — one is missing, and the
  `config` block tells you which. It only ever says true/false; it never shows
  you any value, so it is safe to leave open to the world.

**What it does NOT tell you.** It is a *configuration* check, not a *dependency*
check. It deliberately makes no network calls. So a green `/api/health` means
"this deploy has its keys", not "Supabase is up" and not "Anthropic is
responding". Both of those can be broken while this returns 200.

Its highest value is catching the failure described in `LAUNCH.md` §3.2 — the
one where you change an environment variable, forget to redeploy, and the app
silently runs with no backend while looking completely fine. A user does an
afternoon of work and loses it. `/api/health` turns that invisible failure into
a 503 you can watch for.

**Set up a free monitor to poll it:**

- **UptimeRobot** (free: 50 monitors, 5-minute checks) or **Better Stack**
  (free tier, 3-minute checks) — both are a two-minute signup.
- Point it at `https://your-domain.com/api/health`
- Alert on **any non-200 response**, to your email *and* your phone.
- Add a second monitor on `https://your-domain.com/` so you also learn when the
  whole site is down, not just misconfigured.

Now you find out the site is down from your phone rather than from a user.

### 2b. A free Sentry project — the one that catches real errors

This is the thing that tells you a *user* hit a failure. It requires adding an
SDK, so it is a code change, but the free tier is genuinely sufficient here.

**Sentry Developer plan (free), as of 2026:** 5,000 errors/month, 30-day
retention, 1 user, unlimited projects, email alerts. For a hand-invited launch
with a handful of producers you will not come close to 5,000 errors — and if you
do, that is itself the most useful signal you could receive.

Note the contrast that makes this worth doing: **30 days of retention, free,
versus Vercel Hobby's 1 hour.** A user reporting yesterday's problem becomes
answerable.

To set it up: create a free account, create a **Next.js** project, and run
Sentry's wizard in the repo (`npx @sentry/wizard@latest -i nextjs`). It adds the
config files and a `SENTRY_DSN`. Then set the sample rate low (errors only, no
performance tracing) so you stay inside the free tier, and **turn on email
alerts for new issue types**.

Two things to check before you ship it:

- **Do not let it capture user content.** Schedules are confidential
  pre-production documents. Turn OFF `sendDefaultPii`, and do not attach request
  bodies. You want the stack trace, not the schedule.
- **The Content Security Policy in `next.config.mjs` will need Sentry's ingest
  domain added** to `connect-src`, or the browser blocks the reports and you
  will see nothing while believing you are covered. Test it by deliberately
  throwing an error in a preview deploy and confirming it arrives.

### 2c. The cheap alternative, if you do not want an SDK

Not as good, but better than nothing and takes no code: **set a calendar
reminder to open Vercel → Logs and filter to status 500 twice a week.** On
Hobby's one-hour retention this only catches things that are broken *right now*,
which is a real limitation — but it will catch a sustained outage.

---

## 3. The weekly check (ten minutes)

Put this in your calendar for the same time every week. Most weeks it is boring,
which is the point.

**Money — do this one first, it is the one that can hurt.**

- [ ] **Anthropic Console → Usage.** Look at the last 7 days. Is the shape what
      you expect? A flat line when nobody is using the app, spikes when someone
      is. See §4 for how to read this properly.
- [ ] **Anthropic Console → Limits.** Confirm your monthly spend limit is still
      set and you are not near it. If you got a 50% alert email this week,
      something changed — find out what before it hits 100%.
- [ ] **Vercel → Usage.** Function invocations and bandwidth against the plan
      limits. A Hobby project that exceeds them gets throttled, not billed.

**Did anything break?**

- [ ] **Vercel → Logs**, filter to status **500**. On Hobby you are only seeing
      the last hour — treat an empty result as "nothing is broken right this
      second", not "nothing broke this week".
- [ ] **Sentry** (if you set it up) — any new issues? This is the one that
      actually covers the week.
- [ ] Your uptime monitor's history — any blips?
- [ ] **`/api/health`** — still 200? Takes five seconds.

**Data**

- [ ] **GitHub → Actions → "Backup database"** — did last night's run go green?
      A backup that has been silently failing for three weeks is worse than no
      backup, because you think you are covered. (§6.)
- [ ] **Supabase → Reports** — database size and auth sign-ups. An unexpected
      jump in users means sign-ups are open when you thought they were closed
      (`LAUNCH.md` §2.7).
- [ ] **Supabase → Storage** — bucket size. Uploaded schedules accumulate and
      nothing deletes them.

**Code**

- [ ] **GitHub → Pull requests** — merge the week's Dependabot batch if CI is
      green. It is one or two grouped PRs, not twenty.
- [ ] **GitHub → Security → Dependabot alerts** — anything here is a genuine
      advisory and jumps the queue.

---

## 4. Reading your Anthropic spend

The app calls Claude on **your** API key. There is no per-user billing. This is
the failure mode most likely to actually cost you money, so it is worth being
able to read the numbers rather than just glancing at them.

**Where:** Anthropic Console → **Usage** (tokens, by day, by model, by API key)
and **Billing** (the money).

**What normal looks like.** One full schedule read is roughly 40,000–100,000
input tokens — cents to tens of pence. A producer working through a schedule
might do five or ten reads in a sitting. So a normal active day with three users
is *pounds*, not tens of pounds.

**What to worry about:**

| What you see | What it probably means |
| --- | --- |
| A spike on a day nobody was using it | Someone found the endpoint, or a retry loop |
| Steady spend overnight | Automated, not human. Investigate today. |
| One user's usage dwarfing everyone else's | Either a power user or a stuck client retrying |
| Output tokens unusually high vs input | The model is rambling — possibly a bad prompt path |

**If it looks wrong, the brake is immediate:** Console → API keys → **revoke the
production key**. The app degrades to its built-in parser, which is a real
downgrade but not an outage — users can still work. Then create a new key, put
it in Vercel, redeploy, and work out what happened with the pressure off.

**The structural fix** if this keeps happening is in `LAUNCH.md` §2.7: turn off
open sign-ups. Every expensive scenario requires an account.

---

## 5. Incident runbook

Four situations, in the order you are likely to meet them. Each one starts with
what to say to the person, because the reply is usually more urgent than the
fix.

---

### 5.1 "I've lost my work"

**This is the worst one. Read the whole section before you do anything.**

**First, say this — within minutes, before you know anything:**

> Really sorry. Don't do anything else in the app for now — don't refresh, don't
> re-upload, and please leave that browser tab open if you still have it. I'm
> looking into it right now and I'll come back to you within the hour.

That message matters because **the most likely place their work still exists is
the browser tab they are about to close.** The board keeps state in
`localStorage`. If cloud sync was not working, the tab is the only copy.

**Then work out which of three things happened:**

**(a) It was never syncing.** Check `/api/health`. If it returns 503 with
`supabaseUrl: false` or `supabaseAnonKey: false`, you have found it: this deploy
has no backend, the sign-in gate never appeared, and everything the user did
lived only in their browser. This is `LAUNCH.md` §3.2 — a `NEXT_PUBLIC_*`
variable changed without a redeploy.
→ **Their data is not lost, it is in their browser.** Tell them to keep the tab
open, fix the env vars, redeploy, then have them sign in and re-save. Get them
to export to Excel *first* as insurance.

**(b) They are signed into a different account.** Very common, very
undramatic. Two Google accounts, or they signed up with a second email. Ask them
to check which email is shown in the app, then check Supabase → Authentication →
Users for duplicate addresses for the same person.

**(c) The data really is gone from the database.** Rare. Confirm before you say
so: Supabase → Table Editor → `productions`, filter by their `owner` uid (find
the uid under Authentication → Users). If rows exist, this is (b). If they truly
do not exist, go to the backups: GitHub → Actions → Backup database → the most
recent green run → download the artefact.

**Restoring — the rule that matters:** restore the dump into a **scratch
Supabase project first**, find their rows there, and copy just those rows
across. Never restore a whole dump over a live database to recover one user's
data; you would overwrite everyone else's work since the backup was taken.

```bash
gunzip -c crowdos-2026-08-16_0317.sql.gz | psql "$SCRATCH_DB_URL"
```

Then tell them what actually happened and what you changed so it does not
recur. People forgive an outage; they do not forgive vagueness.

---

### 5.2 The AI schedule reader is down

**Symptom:** uploads work, but reads fail, return partial schedules, or fall
back to the built-in parser.

**In order, quickest first:**

1. **`/api/health`** → is `anthropicApiKey` true? If false, the key is missing
   from this deploy. Add it in Vercel and redeploy.
2. **Anthropic Console → Limits.** Have you hit the monthly spend cap? This is
   the most common cause and it looks exactly like an outage. Raise it or wait.
3. **Anthropic Console → API keys.** Is the key still active and not revoked?
4. **[status.anthropic.com](https://status.anthropic.com)** — is it them? If so,
   nothing to fix; tell users and wait.
5. **Vercel → Logs**, filter `/api/parse-schedule`. Look at the status codes.
   `401` = bad key. `429` = rate limited. `500` = a bug, get the stack trace.

**The one that is not an outage:** reads that *truncate* — the user gets a
schedule with days missing and no error. That is the 60-second function timeout
described in `LAUNCH.md` §3.3, not an API failure. Check Vercel → Settings →
Functions → Fluid Compute is ON.

**What to say:** "AI reading is down, the app still works — you can enter days
manually and re-run the read later." That is true, and it is a much better
message than silence. This failure is a degradation, not an outage.

---

### 5.3 The site is down

1. **[vercel-status.com](https://www.vercel-status.com)** — if it is Vercel,
   there is nothing to do but tell people.
2. **Vercel → Deployments.** Did the most recent one fail, or did it succeed and
   break something? If a deploy broke it, **use "Instant Rollback"** on the
   previous good deployment. Do that *first*; debug afterwards. Rollback is
   seconds and reversible.
3. **`/api/health`** — 503 means it is your config, not the platform.
4. **Supabase → Project status.** A paused or over-quota Supabase project takes
   sign-in down while the site itself loads fine. Free-tier projects **pause
   after a week of inactivity** — an easy one to hit during a quiet period, and
   it resumes from the dashboard.
5. **Domain/DNS.** If it only fails for some people, or you see a certificate
   warning, check Vercel → Settings → Domains.

**Say something publicly-ish** — an email to your handful of users saying "we're
down, I know, I'll update you in 30 minutes" costs nothing and buys a lot.

---

### 5.4 "Please delete my data"

You have a legal obligation and the privacy policy promises it. **The full
procedure is `LAUNCH.md` §5 — follow it exactly**, because it has a step people
skip.

The short version:

1. **Storage FIRST** — Supabase → Storage → `schedule-files` → the folder named
   with their uid → delete it. Deleting the user does **not** cascade to
   Storage. Do this before step 2, or you lose the uid you need.
2. **Then the user** — Authentication → Users → Delete user. This cascades to
   all 8 tables.
3. **Verify** — run the SQL query in `LAUNCH.md` §5, step 3. Every count must be
   zero.
4. **Reply confirming it is done**, and mention that encrypted backups may
   retain a copy for a short period before rotating out. That is normal,
   defensible, and the privacy policy already says it.

**Do it within 30 days.** Put a reminder in your calendar the moment the request
arrives, not after you have looked into it.

---

## 6. Backups — what is covered and what is not

`npm run backup` runs `scripts/backup-db.sh` locally. There is now also a
**nightly GitHub Action** (`.github/workflows/backup.yml`) that does the same
thing automatically and keeps the file as a downloadable artefact for 30 days.

**To turn the automatic backup on**, add one repository secret:

```
GitHub → repo → Settings → Secrets and variables → Actions → New repository secret

  Name:   SUPABASE_DB_URL
  Value:  Supabase → Connect → Session pooler URI, with [YOUR-PASSWORD] replaced
```

Until that secret exists the workflow runs, logs "backup skipped", and passes.
It will not nag you and it will not go red.

> **⚠️ Only add that secret if this repository is PRIVATE.** `SUPABASE_DB_URL`
> is a full-access credential that bypasses row-level security entirely. Anyone
> who can push a workflow to the repo can read it. On a solo private repo that
> is only you; the day you add a collaborator, it is also them.

### ⚠️ The gap: Storage is NOT in the backup

**A `pg_dump` backs up the database. It does not back up files.**

Every schedule PDF and photographed page your users have uploaded lives in the
Supabase **Storage** bucket `schedule-files`. None of it is in the dump — not in
the nightly Action, not in `npm run backup`. What you get back from a restore is
a complete set of database rows *pointing at files that no longer exist*.

For CrowdOS this is a survivable gap rather than a catastrophic one, because the
extracted schedule data is in the database and the PDFs are mostly source
material the user already has a copy of. But be clear-eyed: **restoring from
backup means every user's uploaded documents are gone.**

If you want to close it, Supabase → Storage has a download option, or the CLI:

```bash
supabase storage cp -r ss:///schedule-files ./storage-backup --experimental
```

Run it monthly and keep it with the database dumps. Not automated here on
purpose — it needs a service-role key, and putting *that* in CI as well doubles
the blast radius of a repo compromise. Your call, made deliberately.

### Also true of any backup

- **Test a restore before you need one.** A backup you have never restored is a
  hypothesis. Restore one into a scratch Supabase project and check the data is
  really there. Do it once, now, while nothing is on fire.
- **Keep a copy somewhere other than GitHub.** Artefacts expire after 30 days
  and vanish with the repo. Download one occasionally to a drive or cloud folder.
- **Take a manual backup before anything risky** — a migration, a bulk edit, a
  dependency major. GitHub → Actions → Backup database → **Run workflow**.

---

## 7. What CI catches, and what it does not

Every push and pull request runs `.github/workflows/ci.yml`: install, lint,
quality ratchet, TypeScript type-check, the 516 tests, and a production build.
Roughly 2–4 minutes. If the tick next to a commit on GitHub is green, all of
that passed.

**Run the same thing locally before you push** — it is faster than waiting:

```bash
npm run verify     # ratchet + typecheck + 516 tests + production build (~2 min)
npm run lint       # the full lint report on its own, including known findings
```

`verify` deliberately runs the **ratchet** rather than raw `lint`, for the same
reason CI does: there are a handful of pre-existing findings, so bare `npm run
lint` exits non-zero today by design. The ratchet is the thing that answers the
question you actually care about — *did I make it worse?*

**What CI catches:** broken imports, type errors, failing tests, a build that
does not compile, a route config mistake, a new lint or board-type error above
the committed baseline.

**What CI does not catch, and never will:**

- Anything requiring real credentials. The build runs with no secrets, so it
  cannot tell you the Anthropic key works or Supabase is reachable.
- Anything about the *deployment* — env vars, redeploys, dashboard settings.
  That is `/api/health` and `LAUNCH.md`.
- Whether the numbers are *correct*. The tests check the rate engine against
  known cases; they cannot know a rate card changed in the real world.
- Anything visual.

**A green CI run means "this did not obviously break". It does not mean "this is
safe to put in front of a producer".** For that, the smoke test in `LAUNCH.md`
§4 is still the thing.

---

## Quick reference

| I want to know… | Look at |
| --- | --- |
| Is the site up? | Your uptime monitor, then `https://your-domain.com` |
| Is this deploy configured correctly? | `https://your-domain.com/api/health` |
| Did something error in the last hour? | Vercel → Logs, filter 500 |
| Did something error this week? | Sentry (only if you set it up) |
| Can users sign in? | Supabase → Logs → Auth |
| How much am I spending on AI? | Anthropic Console → Usage / Billing |
| Am I near my spend limit? | Anthropic Console → Limits |
| Did last night's backup work? | GitHub → Actions → Backup database |
| Did my last push break anything? | GitHub → Actions → CI |
| Is a dependency vulnerable? | GitHub → Security → Dependabot alerts |
| Is Vercel/Anthropic having an outage? | vercel-status.com / status.anthropic.com |
| How do I undo a bad deploy? | Vercel → Deployments → Instant Rollback |
| How do I stop a runaway AI bill? | Anthropic Console → API keys → revoke |
