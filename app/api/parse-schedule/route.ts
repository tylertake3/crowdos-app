// AI-assisted schedule reader (prototype).
//
// The client already extracts a PDF's text (pdf.js, column-aware) and runs the
// deterministic regex parser first. This route is the FALLBACK / second opinion:
// it hands the raw extracted text to Claude Haiku 4.5 and asks for the same
// structured "days & scenes" shape the regex parser produces.
//
// TRUST BOUNDARY: the model only *reads* — it never computes money. Its output
// is the same ScheduleModel the engine already costs, and the user reviews it in
// the import dialog before anything is saved. See RATE-ENGINE-NOTES.md.

import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 300; // big schedules are read in several chunks (see below)

// Background head → one tier bucket, each with an optional group name. Everything
// routes through saChars/spacts/featured; the plain `scene.sa` field stays 0 so a
// head is never counted twice (the engine adds anonymous SA to named SA).
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    days: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          num: { type: "integer" },
          date: { type: "string" },
          loc: { type: "string" },
          type: { type: "string" }, // "Day" | "Night" | ""
          hours: { type: "string" },
          scenes: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                num: { type: "string" },
                ie: { type: "string" }, // INT / EXT / INT/EXT / ""
                tod: { type: "string" }, // DAY / NIGHT / DAWN / ...
                scriptDay: { type: "string" },
                pages: { type: "string" },
                desc: { type: "string" },
                cast: { type: "array", items: { type: "string" } }, // cast code numbers
                vehicles: { type: "integer" },
                background: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      tier: { type: "string", enum: ["SA", "SPACT", "Featured"] },
                      name: { type: "string" }, // "" if unnamed/anonymous
                      count: { type: "integer" },
                    },
                    required: ["tier", "name", "count"],
                  },
                },
                stunts: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      name: { type: "string" },
                      count: { type: "integer" },
                    },
                    required: ["name", "count"],
                  },
                },
              },
              required: [
                "num", "ie", "tod", "scriptDay", "pages", "desc",
                "cast", "vehicles", "background", "stunts",
              ],
            },
          },
        },
        required: ["num", "date", "loc", "type", "hours", "scenes"],
      },
    },
    castMap: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          code: { type: "string" },
          name: { type: "string" },
        },
        required: ["code", "name"],
      },
    },
    // Notation the model met but could NOT confidently interpret — surfaced as
    // clarifying questions for the review screen instead of silent blanks.
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          term: { type: "string" }, //     the notation, short, as printed ("E", "x-8")
          source: { type: "string" }, //   the line it appeared on, verbatim
          question: { type: "string" }, // plain-language ask
          days: { type: "array", items: { type: "integer" } }, // shoot days affected
        },
        required: ["term", "source", "question", "days"],
      },
    },
  },
  required: ["days", "castMap", "questions"],
} as const;

const SYSTEM = `You read UK film & TV shooting schedules and extract their structure. You are given the raw text of one schedule (already extracted from a PDF, so columns and spacing may be messy). Return every shoot day and every scene in it.

Rules that matter for costing:
- BACKGROUND ARTISTES fall into exactly three tiers:
  - "SA" = Supporting Artistes / background / crowd / extras (e.g. "50 SA", "160 x C", "20 passersby", "8 airmen", "HUB WORKERS [10]"). A group having a NAME does NOT make it Featured — named crowd are still SA.
  - "SPACT" = Special Ability / Skilled Persons / stand-ins. Any group under a heading labelled "SPACT", "Spacts", "SP", or "Special Ability" is the SPACT tier — regardless of the role described (e.g. "Spacts: 3 police officers" is 3 SPACT, NOT stunts, even though police is an action-sounding role).
  - "Featured" = ONLY groups the schedule explicitly files under "Featured Background Actors" or "Featured Extras". Nothing else is Featured.
- CATEGORY ABBREVIATIONS mean the same thing in any layout: "E:" / "Extras" / "Background" are the SA tier (a scene row carrying "E: 26" has 26 SA; a Full Fat block "Extras: Prisoners (20), Prison Guards (6)" is two named SA groups). "FE:" / "Featured Extras" are the Featured tier ("FE: 1" = 1 Featured; NAMED entries under a "Featured Extras" heading are Featured, count 1 each unless a number is printed). "ST:" is a stunt count ("ST: 1" = 1 stunt performer in that scene's "stunts").
- Put each background group in the "background" array with its tier, its group name ("" if it is just anonymous crowd like "50 SA"), and its head count. Do NOT invent counts — only use numbers printed in the schedule.
- STUNTS go in the "stunts" array, NOT "background". Only count people the schedule explicitly labels as stunt performers, stunt doubles, or stunt coordinators (or lists under a "Stunts"/"Stunt Performers" heading). A crowd/SA/SPACT role that merely sounds physical (police, soldiers, protesters) is NOT a stunt unless the schedule says so.
- IGNORE ENTIRELY: Props, Weapons, Additional Labor/Labour, Special Effects, SFX, VFX, "SQ:" sequence tags, "Q's:", camera/grip notes, wardrobe, make-up/hair, Home Economist. Nothing from those blocks may ever appear in cast, stunts, background, or any text field — a zip gun is a prop, an armourer is labour, neither is a person in the schedule's cast or crowd.
- GRID/BOX one-liners often split the scene number across cells — an episode number then a scene number ("8 | 18"). Join them as printed ("8 18"). Script-day numbers ("DAY 33") and page counts ("1/8pgs") are NOT scene numbers, locations, or descriptions. Never let leftover grid tokens (e.g. "33 1/8pgs FE :") leak into "desc" or the location — "desc" is the action sentence, the location is the location line.
- STAND-INS AND DOUBLES are crowd, not stunts, and must never be dropped — productions budget for them. In Full Fat / Expanded blocks they are printed as a side column next to Cast Members / Background Actors, so in the extracted text they appear as short interleaved lines within a scene's block, e.g.:
    Stand in
    Maia Stand in
    Child Double
    Noah Double
  A bare "Stand in" line is a column heading — do not count it. Every NAMED line under it ("Maia Stand in", "Child Double", "Noah Double", "Photo Double") is ONE real booking for that scene: add each to "background" with tier "SA", the printed name, count 1 (or the printed number). ONLY a double whose label contains "Stunt" (e.g. "Maia Running/Stunt Double") goes in "stunts" instead.
- CAST: list the cast code numbers called for the scene (e.g. "1", "4", "12") in "cast". Keep code suffixes exactly as printed — "1x", "4v", "2v" are distinct codes (doubles / off-screen variants), never collapse them to the bare number. If the schedule has a cast list mapping codes to character names, fill "castMap".
- VEHICLES: the count of action/picture vehicles for the scene, else 0.
- Day "type" is "Night" only if the schedule marks the day/scene as a night shoot, else "Day" (or "" if unknown).
- Day "loc" is the day's REAL-WORLD shooting location — the physical place/address the unit travels to (e.g. "Barbican, London", "OMAX Studios", "Wenlock Road, N1"). It is usually printed on the day banner or a "LOCATION:" line. It is NEVER a scene's INT/EXT slugline — "INT APARTMENT" or "EXT HOSPITAL" is a set inside a scene heading, not where the unit parks. If the document only gives sluglines and no physical location for a day, leave "loc" as "" rather than copying a slugline.
- Scene "num" is the scene number/slug exactly as printed (keep letters, e.g. "12A"). "ie" is INT/EXT. "tod" is the scene's time of day.
- Keep days in schedule order and number them from the schedule ("Day 1", "Shoot Day 3", etc.); if unnumbered, number sequentially from 1.
- Copy each day's date EXACTLY as printed in the document (e.g. "Wednesday 23rd April 2025") — never reformat it into ISO or any other style.
- Create a day ONLY for an actual numbered shooting day (e.g. a "DAY #1 - Wednesday..." banner with an "End Day 1" marker). Do NOT create days for non-shooting entries such as "DAYS OFF", "BANK HOLIDAY", weekends off, unit moves, or trailing notes like "ELEMENT TO BE SHOT ON..." / "END OF SHOOTING SCHEDULE". Skip those entirely.
- Schedules contain typos. If a day's banner date and its "End Day N" marker date disagree (e.g. a wrong year or weekday on one of them), use the date consistent with the surrounding days — shoot days run in calendar order.

Return only groups and numbers actually present in the text. If a field is unknown, use "" or 0 or an empty array — never guess.

GLOSSARY & QUESTIONS:
- The user message may begin with a GLOSSARY of schedule terms the user has already defined. Apply those meanings silently — never ask about a term the glossary covers.
- The "questions" array is a SIDE CHANNEL ONLY. It must never change how you extract days and scenes — apply every rule above identically whether or not something is unclear. Never create, split or drop a day because of an unclear banner.
- Ask a question ONLY for short unexplained notation whose meaning you need to fill a field: an abbreviation on a day header, a symbol next to a count ("x-8"), an unexplained banner between days. Put the notation in "term", the exact source line in "source", a plain-language question in "question", and the affected shoot-day numbers in "days". Leave the affected field blank/0 — do not guess.
- NEVER ask about: scene or stunt descriptions (anything after "STUNT -" is a stunt description — extract it as stunts), page counts ("pgs."), call/wrap times, cast codes, or anything readable as printed. At most 5 questions total; skip repeats.`;

// AI reads are for signed-in users only: the schedule text is confidential
// and the Anthropic spend belongs to an account. Verified against Supabase
// auth with the caller's own JWT — no service key involved.
async function verifyUser(req: Request): Promise<string | null> {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supaKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supaUrl || !supaKey) return null; // auth not configured → nobody passes
  const auth = req.headers.get("authorization") || "";
  const jwt = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!jwt) return null;
  try {
    const r = await fetch(`${supaUrl}/auth/v1/user`, {
      headers: { apikey: supaKey, Authorization: `Bearer ${jwt}` },
    });
    if (!r.ok) return null;
    const u = await r.json();
    return typeof u?.id === "string" && u.id ? u.id : null;
  } catch {
    return null;
  }
}

// Basic per-user rate limit: 30 AI reads per hour (a pair upload uses 2).
// In-memory, so it resets when the serverless instance recycles — a speed
// bump against abuse, not a hard quota. Auth above is the real gate.
const RL_WINDOW_MS = 60 * 60 * 1000;
const RL_MAX = 30;
const rlHits = new Map<string, number[]>();
function rateLimited(uid: string): boolean {
  const now = Date.now();
  const hits = (rlHits.get(uid) || []).filter((t) => now - t < RL_WINDOW_MS);
  if (hits.length >= RL_MAX) { rlHits.set(uid, hits); return true; }
  hits.push(now);
  rlHits.set(uid, hits);
  if (rlHits.size > 5000) rlHits.clear(); // bound memory on a shared instance
  return false;
}

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY is not set on the server." },
      { status: 500 },
    );
  }

  const uid = await verifyUser(req);
  if (!uid) {
    return Response.json(
      { error: "Sign in to use AI schedule reading." },
      { status: 401 },
    );
  }
  if (rateLimited(uid)) {
    return Response.json(
      { error: "Too many AI reads in the last hour — try again shortly." },
      { status: 429 },
    );
  }

  let text = "", glossary: any[] = [], images: { media_type: string; data: string }[] = [];
  try {
    const body = await req.json();
    text = typeof body.text === "string" ? body.text : "";
    glossary = Array.isArray(body.glossary) ? body.glossary : [];
    // Photographed schedule pages — base64 JPEG/PNG/WebP, client-downscaled.
    if (Array.isArray(body.images)) {
      const okType = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
      images = body.images
        .filter((im: any) => im && okType.has(im.media_type) && typeof im.data === "string" && im.data.length > 100)
        .slice(0, 12); // a phone-shot schedule is a handful of pages, not a novel
      const totalB64 = images.reduce((a, im) => a + im.data.length, 0);
      if (totalB64 > 4_200_000) {
        return Response.json(
          { error: "Those photos are too large even after compression — upload fewer pages at a time." },
          { status: 413 },
        );
      }
    }
  } catch {
    return Response.json({ error: "Bad request body." }, { status: 400 });
  }
  const hasText = !!(text && typeof text === "string" && text.trim());
  if (!hasText && !images.length) {
    return Response.json({ error: "No schedule text or images supplied." }, { status: 400 });
  }
  // ~1.1M chars ≈ well under Haiku's 200K-token context; guard against runaway inputs.
  if (text.length > 1_100_000) text = text.slice(0, 1_100_000);

  // Known terms ride ahead of every chunk so the model applies them silently
  // and never asks about them again.
  const glossLines = glossary
    .filter((g) => g && typeof g.term === "string" && typeof g.answer === "string" && g.term.trim())
    .slice(0, 200)
    .map((g) => `  ${g.term.trim()} = ${g.answer.trim()}`);
  const prefix = glossLines.length
    ? "GLOSSARY (user-defined schedule terms — apply silently, never ask about these):\n" + glossLines.join("\n") + "\n\nSCHEDULE TEXT:\n"
    : "";

  const client = new Anthropic({ apiKey });
  // Images (photographed pages) go as ONE vision read — pages belong
  // together, and the client already capped count and size. Text goes
  // through the chunked path as before.
  const chunks = hasText ? chunkText(text) : ["(photographed schedule pages attached)"];

  // At most 2 chunks in flight — keeps a fresh, low-tier account under its
  // rate limits. Each chunk fails independently (see readChunk), so one bad
  // chunk never kills the whole read.
  const results = images.length
    ? [await readChunk(client, prefix + (hasText ? text.slice(0, 20_000) : "Read the attached photographed schedule pages, in order."), images)]
    : await mapLimit(chunks, 2, (c) => readChunk(client, prefix + c));

  const rawDays: any[] = [];
  const castMap: any[] = [];
  const qByTerm = new Map<string, any>();
  let inTok = 0, outTok = 0, truncated = false, ok = 0, lastErr = "";
  for (const r of results) {
    if (r.error) { lastErr = r.error; continue; }
    ok++;
    if (r.truncated) truncated = true;
    rawDays.push(...r.days);
    castMap.push(...r.castMap);
    inTok += r.inTok;
    outTok += r.outTok;
    // dedupe questions across chunks by term; merge affected-day lists
    for (const q of r.questions) {
      const term = String(q?.term || "").trim();
      if (!term) continue;
      const key = term.toLowerCase();
      const days = (Array.isArray(q?.days) ? q.days : []).map((n: any) => Math.round(Number(n) || 0)).filter((n: number) => n > 0);
      const prev = qByTerm.get(key);
      if (prev) prev.days = [...new Set([...prev.days, ...days])].sort((a: number, b: number) => a - b);
      else qByTerm.set(key, {
        term,
        source: String(q?.source || "").trim().slice(0, 240),
        question: String(q?.question || "").trim().slice(0, 300),
        days,
      });
    }
  }
  const questions = [...qByTerm.values()].slice(0, 12);

  if (!ok) {
    return Response.json(
      { error: lastErr || "AI request failed." },
      { status: 502 },
    );
  }

  const model = normalize({ days: mergeRawDays(rawDays), castMap });
  if (!model.days.length) {
    return Response.json(
      {
        error: truncated
          ? "This schedule was too large to read fully."
          : "The AI could not find any shoot days in that schedule.",
      },
      { status: 422 },
    );
  }
  return Response.json({
    model,
    questions,
    chunks: chunks.length,
    chunksRead: ok,
    truncated,
    usage: { input: inTok, output: outTok },
  });
}

// Run fn over items with at most `limit` concurrent, preserving order.
async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// Read one chunk of schedule text → its raw days/castMap (pre-normalize).
// Never throws: on any failure it returns an `error` marker so the other
// chunks still count.
async function readChunk(client: Anthropic, text: string, images?: { media_type: string; data: string }[]): Promise<{
  days: any[]; castMap: any[]; questions: any[]; truncated: boolean; inTok: number; outTok: number; error?: string;
}> {
  try {
    // Photographed pages ride as image blocks ahead of the instruction text —
    // same schema, same system prompt; the model reads pixels instead of a
    // pdf.js text layer.
    const content: Anthropic.ContentBlockParam[] = [
      ...(images || []).map((im): Anthropic.ImageBlockParam => ({
        type: "image",
        source: { type: "base64", media_type: im.media_type as any, data: im.data },
      })),
      { type: "text", text },
    ];
    const stream = client.messages.stream({
      model: "claude-haiku-4-5",
      max_tokens: 32000,
      system: SYSTEM,
      output_config: { format: { type: "json_schema", schema: SCHEMA } } as any,
      messages: [{ role: "user", content }],
    });
    const msg = await stream.finalMessage();
    const truncated = msg.stop_reason === "max_tokens";
    const inTok = msg.usage.input_tokens;
    const outTok = msg.usage.output_tokens;
    const jsonText = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    let raw: any;
    try {
      raw = JSON.parse(jsonText);
    } catch {
      // A truncated chunk yields cut-off JSON — drop it rather than fail.
      if (truncated) return { days: [], castMap: [], questions: [], truncated: true, inTok, outTok };
      return { days: [], castMap: [], questions: [], truncated, inTok, outTok, error: "The AI reply was not valid JSON." };
    }
    return {
      days: Array.isArray(raw?.days) ? raw.days : [],
      castMap: Array.isArray(raw?.castMap) ? raw.castMap : [],
      questions: Array.isArray(raw?.questions) ? raw.questions : [],
      truncated,
      inTok,
      outTok,
    };
  } catch (err: any) {
    return { days: [], castMap: [], questions: [], truncated: false, inTok: 0, outTok: 0, error: err?.message || "chunk read failed" };
  }
}

// Split into chunks small enough that each fits comfortably in one response,
// cutting ONLY at block boundaries (scene headers / day banners) — a scene
// block sliced mid-way reads as two partial scenes, and its background counts
// can be lost. Soft target ~350 lines; hard cap 500 when no boundary exists.
// A day split across chunks is stitched back together by date in mergeRawDays.
function chunkText(text: string, target = 350, cap = 500): string[] {
  const lines = text.split("\n");
  if (lines.length <= cap) return [text];
  const isBoundary = (ln: string) =>
    /^\s*(INT|EXT|I\s*\/\s*E|INT\/EXT)\b/i.test(ln) || // scene block header
    /^\s*-*\s*DAY\s*#?\s*\d+/i.test(ln); //               shoot-day banner
  const chunks: string[] = [];
  let start = 0;
  while (start < lines.length) {
    if (lines.length - start <= cap) {
      chunks.push(lines.slice(start).join("\n"));
      break;
    }
    let cut = -1;
    for (let i = start + target; i < start + cap; i++) {
      if (isBoundary(lines[i])) { cut = i; break; }
    }
    if (cut < 0) cut = start + cap; // no boundary found — hard cut
    chunks.push(lines.slice(start, cut).join("\n"));
    start = cut;
  }
  return chunks;
}

// Stitch chunk results: days with the same printed date merge into one (their
// scenes concatenated, deduped by scene number) — this re-joins a day that was
// cut across a chunk boundary. Days without a date stay separate.
function mergeRawDays(days: any[]): any[] {
  const byDate = new Map<string, any>();
  const out: any[] = [];
  for (const d of days) {
    const date = String(d?.date || "").trim();
    const existing = date ? byDate.get(date) : undefined;
    if (existing) {
      const seen = new Set((existing.scenes || []).map((s: any) => String(s?.num || "")));
      for (const s of d?.scenes || []) {
        const n = String(s?.num || "");
        if (!n || !seen.has(n)) {
          existing.scenes.push(s);
          seen.add(n);
        }
      }
    } else {
      const day = { ...d, scenes: [...(d?.scenes || [])] };
      if (date) byDate.set(date, day);
      out.push(day);
    }
  }
  return out;
}

// Turn the AI's compact answer into a full ScheduleModel the engine can cost.
// Every background head goes through saChars/spacts/featured; scene.sa stays 0.
function normalize(raw: any) {
  const days = (Array.isArray(raw?.days) ? raw.days : []).map((d: any) => {
    const scenes = (Array.isArray(d?.scenes) ? d.scenes : []).map((sc: any) => {
      const bg = Array.isArray(sc?.background) ? sc.background : [];
      const saChars: { name: string; count: number }[] = [];
      const spacts: { name: string; count: number }[] = [];
      const featured: { name: string; count: number }[] = [];
      for (const g of bg) {
        const count = Math.max(0, Math.round(Number(g?.count) || 0));
        if (!count) continue;
        // Anonymous SA collapses into one peaked bucket ("SA"), matching the
        // regex parser's treatment of unnamed background; named groups keep
        // their names and sum.
        const tier = g?.tier === "SPACT" ? "SPACT" : g?.tier === "Featured" ? "Featured" : "SA";
        const name = String(g?.name || "").trim();
        const entry = { name: tier === "SA" ? (name || "SA") : name, count };
        if (tier === "SPACT") spacts.push(entry);
        else if (tier === "Featured") featured.push(entry);
        else saChars.push(entry);
      }
      const stunts = (Array.isArray(sc?.stunts) ? sc.stunts : [])
        .map((s: any) => ({ name: String(s?.name || "").trim(), count: Math.max(0, Math.round(Number(s?.count) || 0)) }))
        .filter((s: any) => s.count);
      // Deterministic guards, independent of the model's judgement.
      // 1) Category labels and prop/effects headings are never people — strip
      //    them wherever the model filed them ("Weapons", "DAY", "Featured
      //    Extras" showing up as stunt chips was a real leak).
      const LABEL_JUNK = /^(day|night|dawn|dusk|weapons?|props?|extras?|featured extras?|background(?: actors?)?|stunts?|stand.?ins?|vfx|sfx|special effects|additional labou?r|notes?|q'?s?|cast|vehicles?|wardrobe|make-?up(?:\/hair)?)\s*:?$/i;
      for (const arr of [saChars, spacts, featured, stunts]) {
        for (let i = arr.length - 1; i >= 0; i--) {
          if (LABEL_JUNK.test(arr[i].name.trim())) arr.splice(i, 1);
        }
      }
      // 2) Anything NAMED like a stunt ("Maia Running/Stunt Double") costs as
      //    stunts, never as crowd — and a crowd-named entry the model filed
      //    under stunts (a picture/child double, a stand-in) comes back to SA.
      for (const arr of [saChars, spacts, featured]) {
        for (let i = arr.length - 1; i >= 0; i--) {
          if (/stunt/i.test(arr[i].name)) { stunts.push(arr[i]); arr.splice(i, 1); }
        }
      }
      for (let i = stunts.length - 1; i >= 0; i--) {
        const n = stunts[i].name;
        if (n && !/stunt/i.test(n) && /stand.?in|double/i.test(n)) { saChars.push(stunts[i]); stunts.splice(i, 1); }
      }
      const cast = (Array.isArray(sc?.cast) ? sc.cast : [])
        .map((c: any) => ({ code: String(c || "").trim(), type: "cast" as const }))
        .filter((c: any) => c.code);
      return {
        num: String(sc?.num || "").trim(),
        part: "",
        ie: String(sc?.ie || "").trim(),
        slug: String(sc?.desc || "").trim(),
        tod: String(sc?.tod || "").trim(),
        scriptDay: String(sc?.scriptDay || "").trim(),
        pages: String(sc?.pages || "").trim(),
        unit: "Main",
        desc: String(sc?.desc || "").trim(),
        sa: 0,
        veh: Math.max(0, Math.round(Number(sc?.vehicles) || 0)),
        pod: false,
        podVeh: 0,
        cast,
        extras: stunts,
        spacts,
        saChars,
        featured,
        vehNames: [],
        tags: [],
      };
    });
    return {
      num: Math.max(0, Math.round(Number(d?.num) || 0)),
      date: String(d?.date || "").trim(),
      sr: "",
      ss: "",
      loc: String(d?.loc || "").trim(),
      hours: String(d?.hours || "").trim(),
      type: /night/i.test(String(d?.type || "")) ? "Night" : String(d?.type || "").trim(),
      cams: "",
      scenes,
      pages: "",
    };
  }).filter((d: any) => d.scenes.length || d.num)
    .map((d: any, i: number) => ({ ...d, num: i + 1 })); // sequential across merged chunks

  const castMap: Record<string, string> = {};
  for (const m of Array.isArray(raw?.castMap) ? raw.castMap : []) {
    const code = String(m?.code || "").trim();
    const name = String(m?.name || "").trim();
    if (code && name) castMap[code] = name;
  }

  return { days, castMap, notes: [] as any[] };
}
