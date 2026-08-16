// Deployment health check.
//
// WHY THIS EXISTS: a CrowdOS deploy can come up looking perfectly fine and be
// missing an environment variable, and you only find out when a producer tries
// to sign in or read a schedule and gets a polite failure. This endpoint says
// at a glance whether the server has what it needs.
//
// WHAT IT MUST NEVER DO: leak anything about the configuration itself. It
// answers only "is this set, yes or no". No values, no prefixes, no suffixes,
// no lengths, no hostnames, no key ids, no error text from a failed lookup —
// any of those are a gift to someone probing a deployment, and this endpoint
// is deliberately unauthenticated so anyone can call it. Booleans only. If you
// add a check here, add a boolean, not a detail.
//
// It also makes no network calls: it does not touch Supabase or Anthropic. It
// is a configuration check, not a dependency check, so it stays cheap enough to
// poll and can never be used to make this server generate traffic elsewhere.

export const runtime = "nodejs";
// Never cached or statically rendered — a cached "ok" from build time would be
// worse than no health check at all.
export const dynamic = "force-dynamic";

const isSet = (v: string | undefined) => typeof v === "string" && v.trim().length > 0;

export async function GET() {
  const config = {
    // Sign-in and every database read the server does.
    supabaseUrl: isSet(process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabaseAnonKey: isSet(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    // AI schedule reading.
    anthropicApiKey: isSet(process.env.ANTHROPIC_API_KEY),
  };
  const ok = Object.values(config).every(Boolean);

  // A health check that answers 200 while the deploy is broken is useless to a
  // monitor, so a missing variable is a 503. The body is the same shape either
  // way, so a human can read which one is missing.
  return Response.json(
    {
      status: ok ? "ok" : "misconfigured",
      config,
      time: new Date().toISOString(),
    },
    {
      status: ok ? 200 : 503,
      headers: { "Cache-Control": "no-store, max-age=0" },
    },
  );
}
