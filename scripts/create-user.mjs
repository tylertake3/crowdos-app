#!/usr/bin/env node
// Create a Laural account for someone directly, with the email already
// confirmed — the person can sign in straight away instead of waiting for a
// confirmation link. This exists for the times you set a colleague up on the
// phone, or their confirmation email never lands.
//
// This is deliberately a local script and NOT a route in the app: it needs the
// Supabase SERVICE ROLE key, which can read and write every user's data. That
// key must never reach the browser or Vercel's public env — keep it in
// .env.local (which is git-ignored) and nowhere else.
//
//   node scripts/create-user.mjs --email jo@example.com \
//        --first Jo --last Bloggs --role "Crowd AD"
//
// Leave --password off and one is generated for you and printed once.

import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

const PW_MIN = 10;                        // matches the sign-up form
// The same list the sign-up form offers. The role is not decoration: it picks
// the department the app opens on the first time (stunt vs crowd).
const ROLES = [
  "Crowd AD", "1st AD", "2nd AD", "Stunt coordinator",
  "Stunt department coordinator", "Producer", "Line producer", "Other",
];

// .env.local, parsed by hand so the script needs no extra dependency. Anything
// already in the real environment wins, so you can pass the key inline.
function envFromLocalFile() {
  let text = "";
  try { text = readFileSync(new URL("../.env.local", import.meta.url), "utf8"); }
  catch { return {}; }
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;                                     // blank or a comment
    out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

function arg(name) {
  const i = process.argv.indexOf("--" + name);
  return i > -1 ? process.argv[i + 1] : "";
}

function die(msg) {
  console.error("\n✖ " + msg + "\n");
  process.exit(1);
}

const email = (arg("email") || "").trim();
const first = (arg("first") || "").trim();
const last  = (arg("last")  || "").trim();
const role  = (arg("role")  || "").trim();
let   pw    = arg("password") || "";

if (!email || !first || !last || !role) {
  die(`Missing something. Usage:

  node scripts/create-user.mjs --email jo@example.com --first Jo --last Bloggs --role "Crowd AD"

Roles: ${ROLES.join(" | ")}`);
}
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) die(`"${email}" does not look like an email address.`);
if (!ROLES.includes(role)) die(`Role must be one of: ${ROLES.join(" | ")}`);

// A generated password is 24 hex characters — far past the 10 the form asks
// for, and not something either of us had to think up.
if (!pw) pw = randomBytes(12).toString("hex");
else if (pw.length < PW_MIN) die(`A password needs at least ${PW_MIN} characters.`);

const env = { ...envFromLocalFile(), ...process.env };
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url) die("NEXT_PUBLIC_SUPABASE_URL is missing from .env.local.");
if (!key) {
  die(`SUPABASE_SERVICE_ROLE_KEY is missing from .env.local.

Supabase dashboard → Project Settings → API → "service_role" key.
Add this line to .env.local (it is git-ignored, so it stays on your machine):

  SUPABASE_SERVICE_ROLE_KEY=<paste the key>`);
}

const admin = createClient(url, key, { auth: { persistSession: false } });

const { data, error } = await admin.auth.admin.createUser({
  email,
  password: pw,
  // The whole point of the script: Supabase marks the address as confirmed, so
  // no link is emailed and no link needs clicking.
  email_confirm: true,
  // Exactly the shape cloud.js signUp() writes, so the account behaves like any
  // other — right name in the corner, right department on first open.
  user_metadata: {
    first_name: first,
    last_name: last,
    full_name: [first, last].filter(Boolean).join(" "),
    role,
  },
});

if (error) {
  if (/already been registered|already exists/i.test(error.message || "")) {
    die(`There is already an account for ${email}. If they cannot get in, send them a password reset from the sign-in screen instead.`);
  }
  die(error.message || String(error));
}

console.log(`
✔ Account created for ${first} ${last} <${email}>
  Role:     ${role}
  User id:  ${data.user.id}
  Email:    already confirmed — they can sign in now

  Temporary password:  ${pw}

Give them that password by a route that is not email if you can (a call, a
text), and ask them to change it: sign in, then "Forgotten password?" on the
sign-in screen sends them a reset link. This password is printed once and is
not stored anywhere.
`);
