// Pure helpers for the AI schedule reader.
//
// These live OUTSIDE route.ts on purpose: a Next.js App Router route module
// may only export the HTTP verbs and a fixed set of config fields, so any
// extra named export ("rateLimited is not a valid Route export field") fails
// `next build`. Keeping the pure logic here makes it both legal and unit
// testable (tests/parse-schedule-route.test.ts).

import { chunkText } from "../../../lib/engine/schedule-chunk";

// The route's maxDuration, in seconds — keep in sync with route.ts.
export const MAX_DURATION_S = 300;

// ── Rate limiting ──────────────────────────────────────────────────────────
// The metered unit is WORK, not requests, and not chunks either.
//
// Charging per request let one caller send a 1MB file and pay the same as
// someone pasting a page. Charging per CHUNK was better but still gameable:
// chunking used to cut on LINE count only, so ~600KB of text on a SINGLE line
// was one chunk — one unit for ~150k input tokens. The meter is now
// proportional to the number of CHARACTERS sent (see planChunks / requestCost),
// which is the thing that actually costs money, so no input shape can be
// cheap-to-send and expensive-to-read.
//
// Budget sizing (RL_MAX_UNITS): one unit ≈ RL_CHARS_PER_UNIT characters ≈ the
// size of one ordinary chunk. A real feature schedule extracts to roughly
// 150–400KB, so a full read costs ~5–15 units, and the "upload the revised
// schedule, look at it, fix it, upload again" loop costs that each time. The
// old 120-unit budget was ~8–12 uploads an hour, which a producer getting a
// schedule right in one sitting hits legitimately. 600 units leaves room for
// roughly 40 full reads an hour — far past any honest sitting — while the
// abuse shapes (one enormous line, a padded file, repeated max-size uploads)
// now cost their real weight and run out quickly. The per-character cost, not
// this number, is what carries the defence.
//
// NOTE: this counter lives in this process's memory ONLY, and that weakness is
// bigger than "it resets sometimes". Three things follow from it, all true:
//   1. Each serverless instance keeps its OWN counter. With N instances warm,
//      one determined caller's effective hourly budget is N × RL_MAX_UNITS,
//      because the platform is free to route their next request anywhere.
//   2. A cold start or a recycle drops the counter entirely, so the budget can
//      also be reset simply by pausing until the instance is replaced.
//   3. Nothing is shared, so nothing here can enforce a global spend cap.
// It is therefore a speed bump against accidental hammering — NOT enforcement,
// and NOT a billing control. For real quota enforcement move it to a shared
// store (a Postgres table with a window index, or Upstash Redis with
// INCR/EXPIRE) keyed by user id. Auth is the real gate.
const RL_WINDOW_MS = 60 * 60 * 1000;
export const RL_MAX_UNITS = 600;
const RL_MAX_KEYS = 5000; // memory bound on a shared instance
type RlHit = { t: number; cost: number };
const rlHits = new Map<string, RlHit[]>();
let rlLastSweep = 0;

// Drop expired entries per key (and the key itself once it is empty). Only if
// we are STILL over the key cap do we evict whole keys, oldest first — never a
// blanket clear, which would hand every other user a free reset.
function sweepRl(now: number) {
  for (const [k, hits] of rlHits) {
    const live = hits.filter((h) => now - h.t < RL_WINDOW_MS);
    if (live.length) rlHits.set(k, live);
    else rlHits.delete(k);
  }
  if (rlHits.size <= RL_MAX_KEYS) return;
  const newest = (hits: RlHit[]) => hits.reduce((a, h) => Math.max(a, h.t), 0);
  const oldestFirst = [...rlHits.entries()].sort((a, b) => newest(a[1]) - newest(b[1]));
  for (let i = 0; i < oldestFirst.length - RL_MAX_KEYS; i++) rlHits.delete(oldestFirst[i][0]);
}

// Charge `cost` units against uid's hourly budget. Returns true when the
// request should be refused (nothing is charged in that case).
export function rateLimited(uid: string, cost = 1): boolean {
  const now = Date.now();
  if (now - rlLastSweep > 60_000 || rlHits.size > RL_MAX_KEYS) {
    rlLastSweep = now;
    sweepRl(now);
  }
  const hits = (rlHits.get(uid) || []).filter((h) => now - h.t < RL_WINDOW_MS);
  const spent = hits.reduce((a, h) => a + h.cost, 0);
  if (spent + cost > RL_MAX_UNITS) { rlHits.set(uid, hits); return true; }
  hits.push({ t: now, cost });
  rlHits.set(uid, hits);
  return false;
}

// Test seam: reset the in-memory counters.
export function __resetRateLimit() { rlHits.clear(); rlLastSweep = 0; }

// ── Time budget ────────────────────────────────────────────────────────────
export const AUTH_TIMEOUT_MS = 8_000;
// One model call may not run longer than this. A chunk is read into structured
// JSON, so the model's time is dominated by how much it has to EMIT — i.e. by
// how many scenes the chunk holds. Measured on real dense one-liners, a single
// ~350–500-line chunk (~140 scenes) takes 140–170s to read. The old 90s cap was
// therefore SHORTER than a full chunk's read time: every chunk was aborted
// mid-read, all of them "failed", and the whole cross-read returned a generic
// 5xx ("the reader had a problem at our end") on exactly the schedules big
// enough to need it. This must comfortably exceed the real read time. A chunk
// still can never overrun the route's maxDuration: chunkTimeoutFor() below also
// clamps every call to the wall-clock time actually left, and RESERVE_MS keeps
// a whole chunk-timeout's worth of budget in hand. Keep this <= MAX_DURATION_S*1000
// minus RESERVE_HEADROOM_MS so a chunk dispatched at t=0 gets the full window.
export const CHUNK_TIMEOUT_MS = 200_000;
// Stop DISPATCHING new chunks with this much of the route's maxDuration left, so whatever
// has already been read can still be returned instead of dying at the wall.
//
// The reserve MUST be at least a whole chunk timeout plus headroom. A shorter
// reserve cannot do its job: a chunk dispatched near the wall may still run the
// full CHUNK_TIMEOUT_MS, so the platform would kill the request at maxDuration
// and the user would lose every chunk that HAD been read — precisely the
// failure this guard exists to prevent. Headroom covers stitching, normalising
// and serialising the reply after the last chunk lands.
const RESERVE_HEADROOM_MS = 30_000;
// THE BUG THIS FIXES (schedules silently stopping part-way through):
//
// The reserve used to be a WHOLE chunk timeout (200s) plus headroom, so
// dispatch stopped 70s into a 300s route. But a real chunk takes 60–170s to
// read, so by the time the first two chunks came back the clock was already
// past 70s and chunk THREE ONWARDS WAS NEVER DISPATCHED AT ALL. Every schedule
// that split into more than two pieces lost everything after the second piece —
// a 16-page, 8-week schedule came back ending in mid-October because its third
// and final piece (17–30 October) was never sent to the reader. It was reported
// as "partial", but a producer reads a schedule that ends on a plausible date
// as a schedule that ends there.
//
// The reserve now only has to cover the SHORTEST read worth starting, because
// chunkTimeoutFor() below already clamps every call to the wall-clock time
// actually left — so a chunk dispatched late is cut short by its own timeout
// rather than being allowed to overrun maxDuration. That means we can keep
// dispatching for most of the route's life instead of the first 70s of it.
//
// This path is now the FALLBACK. The browser splits the document and posts one
// piece per request (see `part` in route.ts), so a modern client gives every
// piece its own full route budget and no schedule length can run out of time.
const MIN_USEFUL_CHUNK_MS = 45_000;
const RESERVE_MS = MIN_USEFUL_CHUNK_MS + RESERVE_HEADROOM_MS;
export const WALL_BUDGET_MS = MAX_DURATION_S * 1000 - RESERVE_MS;
// Belt and braces: a chunk may also never be given more time than is actually
// left before the wall, so even a mis-set reserve cannot overrun maxDuration.
export function chunkTimeoutFor(elapsedMs: number): number {
  const left = MAX_DURATION_S * 1000 - RESERVE_HEADROOM_MS - elapsedMs;
  return Math.max(5_000, Math.min(CHUNK_TIMEOUT_MS, left));
}

// One signal that fires when the caller disconnects, when `ms` elapses, or
// (when given) when the parent controller aborts.
export function linkSignals(client: AbortSignal | undefined, ms: number, extra?: AbortSignal): AbortSignal {
  const parts = [AbortSignal.timeout(ms)];
  if (client) parts.push(client);
  if (extra) parts.push(extra);
  const anyOf = (AbortSignal as any).any;
  if (typeof anyOf === "function") return anyOf.call(AbortSignal, parts);
  // Older runtimes: fall back to the timeout alone rather than crash.
  return parts[0];
}

// ── Input sizing ───────────────────────────────────────────────────────────
// Every chunk is one Opus call, so the chunk count IS the cost of a request.
// A 1.1M-character file of mostly newlines used to split into ~2,900 chunks.
export const MAX_CHUNKS = 40;
export const TOO_LARGE_MESSAGE =
  "That schedule is too large to read in one go — try splitting it into separate uploads.";

// ── The whole-input cap ────────────────────────────────────────────────────
// The hard ceiling on how much schedule text one request will read. It exists
// so a runaway input cannot be fed to the model in full.
//
// The important part is what happens when it BITES. The cap is applied before
// the text is split, so an over-long schedule never reaches the "too large"
// refusal (413) — it is quietly shortened and read as if it were the whole
// document. That is fine ONLY if the shortfall is reported: a 1.4M-character
// schedule loses its last fifth, i.e. its last few weeks of shoot days, and
// returning that as a complete read is how a producer budgets a shoot off a
// schedule that stops in the middle. So the cap returns a flag, and the route
// folds it into `partial`/`status` exactly like a chunk that never ran.
export const MAX_TEXT_CHARS = 1_100_000;

export function capInputText(text: string): {
  text: string;
  truncatedInput: boolean;
  percentRead: number;
} {
  if (text.length <= MAX_TEXT_CHARS) return { text, truncatedInput: false, percentRead: 100 };
  return {
    text: text.slice(0, MAX_TEXT_CHARS),
    truncatedInput: true,
    // Rounded DOWN and floored at 1, so the sentence shown to the user never
    // overstates how much of their schedule was actually read.
    percentRead: Math.max(1, Math.floor((MAX_TEXT_CHARS / text.length) * 100)),
  };
}

// The sentence a user is shown when a read came back short. Plain English, no
// jargon, and it always says what to do next. `percentRead` is only used when
// the input itself was cut.
export function partialReadMessage(o: {
  skipped: number;
  failed: number;
  truncatedInput: boolean;
  percentRead: number;
}): string {
  const ranShort = o.skipped > 0 || o.failed > 0;
  if (o.truncatedInput && ranShort) {
    return `This schedule is too long for us to read in one go, and part of what we did read did not come back. Roughly the first ${o.percentRead}% of the document was looked at, and not all of that was read successfully — so days are missing, including the ones at the end. Check the days below against your own schedule, then upload the rest of it as a separate file.`;
  }
  if (o.truncatedInput) {
    return `This schedule is too long for us to read in one go. Only roughly the first ${o.percentRead}% of the document was read, so the shoot days at the end of it are missing. Check the days below, then upload the rest of the schedule as a separate file.`;
  }
  return "Only part of this schedule could be read. Check the days below, then upload the rest separately.";
}

// True when the text is mostly empty lines / whitespace — i.e. it costs many
// chunks but carries almost nothing to read. Real extracted schedules are
// dense; a padded file is not.
export function isLowDensity(text: string): boolean {
  const lines = text.split("\n");
  const contentLines = lines.filter((l) => l.replace(/\s/g, "").length > 0);
  if (!contentLines.length) return true;
  if (lines.length > contentLines.length * 3) return true;
  const nonWs = text.replace(/\s/g, "").length;
  return nonWs / lines.length < 2;
}

// One billing unit ≈ this many characters of schedule text. Sized to an
// ordinary chunk, so a normal read costs about one unit per model call while a
// pathological single-line input costs what it actually burns.
export const RL_CHARS_PER_UNIT = 30_000;

// ...and this many BYTES. What the model actually bills is closer to bytes than
// to JavaScript characters: a string's `.length` counts UTF-16 code units, so a
// schedule written in Japanese, Greek, Arabic or padded with emoji is about
// three bytes per unit of `.length` and costs roughly three times what a
// character count says it does. Charging on whichever measure is larger closes
// that gap while leaving ordinary English schedules charged exactly as before
// (one ASCII character is one byte). Same number per unit deliberately.
export const RL_BYTES_PER_UNIT = 30_000;

// UTF-8 size of a string, without pulling in a dependency. Buffer is present in
// the Node runtime this route uses; TextEncoder is the portable fallback.
export function byteLength(s: string): number {
  if (typeof Buffer !== "undefined" && typeof Buffer.byteLength === "function") {
    return Buffer.byteLength(s, "utf8");
  }
  return new TextEncoder().encode(s).length;
}

// What this request should be charged against the hourly budget. Never fewer
// units than there are model calls, never fewer than the characters warrant,
// and never fewer than the BYTES warrant — the largest wins, so none of "many
// tiny chunks", "one enormous chunk" or "a megabyte of multi-byte text" is a
// cheap way in.
export function requestCost(text: string, chunkCount: number): number {
  return Math.max(
    1,
    chunkCount,
    Math.ceil(text.length / RL_CHARS_PER_UNIT),
    Math.ceil(byteLength(text) / RL_BYTES_PER_UNIT),
  );
}

// Split the text and decide whether it is worth reading at all. `reject` means
// "answer 413 with TOO_LARGE_MESSAGE". `cost` is what to charge the caller.
export function planChunks(text: string): { chunks: string[]; reject: boolean; cost: number } {
  const chunks = chunkText(text);
  // The density test only applies to inputs big enough to cost real money —
  // a short paste is allowed to be sparse.
  const reject = chunks.length > MAX_CHUNKS || (chunks.length > 1 && isLowDensity(text));
  return { chunks, reject, cost: requestCost(text, chunks.length) };
}

// The chunker and the day-stitcher now live in lib/engine/schedule-chunk so the
// BROWSER can use them too: the client splits the extracted PDF text and posts
// one piece per request (see `part` in route.ts), which is what lets a schedule
// of any length be read in full instead of being cut off by one request's time
// limit. Re-exported here so this module's public surface is unchanged.
export {
  MAX_CHUNK_CHARS,
  chunkText,
  rawSceneKey,
  mergeRawDays,
} from "../../../lib/engine/schedule-chunk";

// Neutralise the block markers inside untrusted text so uploaded content
// cannot close its own fence and pose as instructions.
//
// This MUST operate on whole bracket RUNS, not on fixed triples. String.replace
// never rescans what it just wrote, so replacing "[[[" with "[ [ [" left a
// fresh triple behind for any run of 5, 8, 11 ... brackets:
//   "[[[[[/SCHEDULE_TEXT]]]]]"  ->  "[ [ [[[/SCHEDULE_TEXT] ] ]]]"
// which contains a perfectly formed "[[[" — enough to forge a closing fence and
// put everything after it into what the system prompt treats as trusted
// instruction context. Matching `\[{2,}` greedily takes the ENTIRE run and
// spaces it out in one pass, so no triple can survive and no output of this
// function contains "[[" or "]]" at all.
export function fence(s: any): string {
  const space = (m: string) => [...m].join(" ");
  return String(s ?? "")
    .replace(/\[{2,}/g, space)
    .replace(/\]{2,}/g, space)
    .trim();
}

// Fixed, jargon-free failure text. Upstream error strings (request ids, model
// names, org rate-limit detail) are logged server-side and never returned.
export const AI_FAILED_MESSAGE =
  "The schedule reader could not finish that read. Please try again in a moment.";

// Shown when a production has AI reading switched off and something asked for
// an AI read anyway. It has to reassure as well as refuse: the person reading
// it is usually worried about an NDA, so it says plainly that nothing was sent.
export const AI_OFF_MESSAGE =
  "AI schedule reading is switched off for this production, so nothing was sent out of the app. " +
  "Turn it on in Production Settings if you want to use it.";

// Shown when the production's AI setting could not be looked up. We refuse
// rather than guess: guessing wrong means sending a confidential schedule out.
export const AI_CHECK_FAILED_MESSAGE =
  "We could not check whether this production allows AI reading, so nothing was sent. Please try again in a moment.";
