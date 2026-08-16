/** @type {import('next').NextConfig} */

// ── Content Security Policy ────────────────────────────────────────────────
// What this app actually does, and therefore what the policy has to allow:
//   • pdf.js (pdfjs-dist) runs a same-origin worker (/pdf.worker.min.mjs) and
//     fetches cmaps + standard fonts from /pdfjs/* — worker-src/script-src
//     'self' plus blob: (bundlers and pdf.js both fall back to blob workers),
//     and 'wasm-unsafe-eval' because pdf.js ships WASM decoders.
//   • jsPDF and the exports build files client-side and hand them to the
//     browser as blob: URLs — blob: must be allowed for img-src and for
//     navigation/objects the download flow creates.
//   • Google Fonts: the stylesheet comes from fonts.googleapis.com and the
//     font files from fonts.gstatic.com (app/layout.tsx).
//   • Styles are largely inline (app/globals.css plus inline style attributes
//     throughout lib/board/app.js) → style-src needs 'unsafe-inline'.
//   • Next.js injects inline bootstrap/hydration scripts and, in dev, uses
//     eval for HMR → script-src needs 'unsafe-inline' and 'unsafe-eval'.
//   • Supabase is reached over https/wss from the browser; the schedule reader
//     is a same-origin API route.
//
// The full policy below ships as Content-Security-Policy-Report-Only.
//
// BE HONEST ABOUT WHAT IT IS WORTH. Its script-src carries 'unsafe-inline' and
// 'unsafe-eval', which is what makes it compatible with Next's inline bootstrap
// — and also what makes it useless against cross-site scripting: an injected
// <script> or an inline event handler is permitted by this policy, so promoting
// it to enforced would stop no XSS that exists today. What promotion WOULD buy
// is the connect-src / img-src / form-action / default-src half: it constrains
// where a compromised page can send data or load resources from, i.e. it
// narrows exfiltration, not injection. That is worth having, but do not record
// it as "CSP done".
//
// The real work, in order:
//   1. Emit a per-request nonce from middleware, thread it through Next's
//      script tags, and replace 'unsafe-inline' in script-src with
//      'nonce-<value>' plus 'strict-dynamic'.
//   2. Drop 'unsafe-eval' — only dev-mode HMR needs it, so it can be made
//      conditional on NODE_ENV.
//   3. Only then is promoting the policy an XSS control rather than a
//      formality.
// style-src 'unsafe-inline' has to stay until the inline style attributes
// throughout lib/board/app.js are moved into stylesheets.
//
// Report-only violations go nowhere unless a collector is configured: set
// CSP_REPORT_URI to a real endpoint and reports are POSTed there. Without it
// the policy is observable only in each developer's own browser console, which
// is not monitoring.
//
// The small ENFORCED policy alongside it carries only directives that cannot
// break a working page — clickjacking, plugin embeds and <base> hijacking —
// and those ARE real, working protections today.
const cspReportUri = process.env.CSP_REPORT_URI || "";

const reportOnlyCsp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob:",
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' blob: data: https: wss:",
  "media-src 'self' blob: data:",
  "manifest-src 'self'",
  // Only emitted when a collector is actually configured — a report-uri
  // pointing nowhere is worse than none, because it reads as monitoring.
  ...(cspReportUri ? [`report-uri ${cspReportUri}`] : []),
].join("; ");

// Enforced from day one: none of these can break a page that works today.
const enforcedCsp = [
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: enforcedCsp },
  { key: "Content-Security-Policy-Report-Only", value: reportOnlyCsp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" }, // belt and braces for old browsers
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Only honoured over https, so it is inert on http://localhost.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
];

const nextConfig = {
  // `npm run build:check` writes to .next-check so a local verification
  // build can never corrupt the running dev server's .next cache
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
