// Public privacy policy + terms. Required by Google's OAuth brand verification,
// and linked from inside the app.
//
// KEEP THIS PAGE TRUE. It is the only place a user is told what leaves the
// app. If you change what the app sends anywhere — a new third-party API, a
// new upload path, a new retention rule — change this page in the same commit.
import type { CSSProperties } from "react";

export const metadata = { title: "CrowdOS — Privacy Policy & Terms" };

const H2: CSSProperties = { fontSize: 16, margin: "26px 0 6px" };
const H3: CSSProperties = { fontSize: 14, margin: "18px 0 4px", fontWeight: 600 };
const LINK: CSSProperties = { color: "var(--hv)" };

export default function Privacy() {
  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "48px 24px",
        lineHeight: 1.7,
        fontSize: 14,
      }}
    >
      <h1
        style={{
          fontFamily: "var(--cond)",
          textTransform: "uppercase",
          letterSpacing: ".04em",
          marginBottom: 4,
        }}
      >
        CrowdOS — Privacy Policy &amp; Terms
      </h1>
      <p style={{ color: "var(--sub)", marginBottom: 24 }}>Last updated: 16 August 2026</p>

      <p>
        CrowdOS is a crowd and stunt budgeting and scheduling tool for film and
        television production, operated by Take 3 Agency. This page explains, in
        plain English, exactly what the app stores, what it sends outside the
        app, and how to get your data back or deleted.
      </p>

      <p style={{ marginTop: 12 }}>
        <b>This is early-access software.</b> It is being used by a small number
        of people while it is still being built. Features change, and things can
        break. Please read the Terms at the bottom of this page before you put a
        real production into it.
      </p>

      <h2 style={H2}>The short version</h2>
      <ul style={{ paddingLeft: 20, margin: "6px 0" }}>
        <li>Your productions and schedules are private to your account.</li>
        <li>
          When you use AI schedule reading, the text and page images of the
          schedule you upload are sent to Anthropic (in the United States) to be
          read. That is a real third party seeing your schedule.
        </li>
        <li>
          You can switch that off per production. With it off, that
          production&rsquo;s schedule is not sent to Anthropic and its weather
          lookup is switched off too &mdash; the app blocks it, and our server
          refuses it as well.
        </li>
        <li>We do not sell your data, and we do not use it for advertising.</li>
      </ul>

      <h2 style={H2}>What we store</h2>
      <p>
        <b>Your account.</b> Your email address, and the first name, surname and
        job role you give when you sign up. If you sign in with Google, we
        receive your basic Google profile (email and name). This is used only to
        identify your account.
      </p>
      <p>
        <b>Your work.</b> The productions, schedule revisions, shoot days, scene
        and day edits, cast lists, locations, casting briefs, risk assessments,
        rate cards and calculator entries you create.
      </p>
      <p>
        <b>The documents you upload.</b> When you import a schedule from a PDF
        or from photographed pages, the original file is stored so you can
        re-open the source alongside the board on any device. The extracted text
        of the schedule is stored with it. These files are kept until you delete
        the production or ask us to delete your account.
      </p>

      <h2 style={H2}>What leaves the app, and when</h2>

      <h3 style={H3}>1. AI schedule reading (Anthropic, United States)</h3>
      <p>
        Schedules come in dozens of layouts, and the built-in parser cannot read
        all of them. When you ask CrowdOS to read a schedule with AI, the
        schedule&rsquo;s <b>text</b> and, if you uploaded photographed pages, the{" "}
        <b>page images</b> are sent to Anthropic&rsquo;s API to be interpreted.
        Anthropic processes them in the United States.
      </p>
      <p>
        This matters if your production is under an NDA. A shooting schedule can
        name cast, locations, dates and story content. Please satisfy yourself
        that sending it to an AI provider is acceptable on your production
        before you use this feature.
      </p>
      <p>
        <b>It is per upload, and it is optional.</b> Nothing is sent unless you
        run an AI read. Each production has a switch —{" "}
        <i>Production Settings → AI schedule reading</i> — and when it is off,
        that production is read only by the built-in parser: the app does not
        offer or run an AI read for it, and our server refuses one for that
        production even if it is asked. The same switch turns off the weather
        lookup described below. So with the switch off, the two things that
        would otherwise send anything about that production out of the app are
        both stopped.
      </p>
      <p>
        We do not send your account details, your rates, your budgets or your
        other productions to Anthropic — only the schedule content being read.
      </p>

      <h3 style={H3}>2. Weather (Open-Meteo)</h3>
      <p>
        The day board shows a forecast for the day&rsquo;s location. To do that,
        the <b>place name</b> for that day is sent to open-meteo.com to look up
        its coordinates, and those coordinates are then sent back to get the
        forecast. What is sent is the first part of the location as you have it
        on the board, tidied up — &ldquo;Barbican, London&rdquo; is sent as
        &ldquo;Barbican&rdquo;. If the place is not recognised, the board falls
        back to a London forecast. No account details, no dates, no scene or
        cast information and no other production data are sent.
      </p>
      <p>
        This lookup is made by your browser directly, not by our server, so
        open-meteo.com also sees your device&rsquo;s IP address, in the same way
        any website you visit does. It is not told who you are or what
        production the location belongs to.
      </p>
      <p>
        This is covered by the same switch: with <i>AI schedule reading</i>{" "}
        turned off for a production, the weather lookup is disabled too, and the
        board says so rather than quietly showing nothing.
      </p>

      <h3 style={H3}>3. Nothing else</h3>
      <p>
        We do not sell or rent your data, we do not share it with advertisers or
        data brokers, and we do not use your work to train any AI model. Apart
        from Anthropic, for the AI reads you ask for, we do not send your
        schedules to any AI provider. Location links on the board are ordinary
        links to Google Maps — nothing is sent unless you click one, and then it
        is that link, opened by your browser.
      </p>

      <h2 style={H2}>Where your data lives</h2>
      <p>
        Your database records and uploaded files are stored with{" "}
        <b>Supabase</b>, which also handles sign-in. The application itself is
        hosted on <b>Vercel</b>. Uploaded documents sit in a private storage
        area that is not readable from the public internet.
      </p>
      <p>
        Separation between accounts is enforced by the database itself
        (PostgreSQL row-level security), not just by the app: every row and every
        stored file carries the id of the account that owns it, and the database
        refuses to return rows belonging to anyone else.
      </p>

      <h2 style={H2}>How long we keep it</h2>
      <p>
        We keep your data for as long as your account exists, because the whole
        point of the app is that your productions are still there next time you
        open it. There is no automatic expiry.
      </p>
      <p>
        Delete a production in the app and its schedules, days, edits and
        uploaded documents go with it. Ask us to delete your account and
        everything associated with it is removed, including the uploaded
        documents in storage. Encrypted backups of the database are held for
        operational recovery and are rotated; a deleted account may persist in a
        backup for a short period before it ages out.
      </p>

      <h2 style={H2}>Getting your data, or deleting it</h2>
      <p>
        You can delete any production, and everything under it, from inside the
        app at any time.
      </p>
      <p>
        To get a copy of everything held against your account, or to delete your
        account entirely, email the address below. We will action deletion
        requests within 30 days and confirm when it is done. You do not have to
        give a reason.
      </p>

      <h2 style={H2}>Contact</h2>
      <p>
        Support, privacy questions, data requests and deletion requests:{" "}
        <a href="mailto:tyler@take3agency.com" style={LINK}>
          tyler@take3agency.com
        </a>
      </p>

      <hr style={{ margin: "32px 0", border: 0, borderTop: "1px solid var(--line)" }} />

      <h1
        id="terms"
        style={{
          fontFamily: "var(--cond)",
          textTransform: "uppercase",
          letterSpacing: ".04em",
          fontSize: 20,
          marginBottom: 4,
        }}
      >
        Terms &amp; expectations
      </h1>

      <h2 style={H2}>Early access</h2>
      <p>
        CrowdOS is early-access software provided as-is, with no warranty and no
        guarantee of availability, uptime, or that your data will not be lost.
        Features may change or be removed. Keep your own copy of anything you
        cannot afford to lose — the app can export to Excel, CSV and PDF, and you
        should use that.
      </p>

      <h2 style={H2}>The numbers are estimates</h2>
      <p>
        Every figure CrowdOS produces — day rates, overtime, night premiums,
        holiday pay, travel bands, agency fees, totals — is an{" "}
        <b>estimate produced by software</b>. It is not a quote, not an
        agreement, and not a final budget.
      </p>
      <p>
        <b>You are responsible for checking the numbers against your own rate
        card and the current agreements</b> before you rely on them, send them
        to a producer, or pay anyone. Rate cards change, productions negotiate
        their own terms, and the app may be wrong. Take 3 Agency accepts no
        liability for financial loss arising from figures produced by this tool.
      </p>

      <h2 style={H2}>AI-read schedules need checking</h2>
      <p>
        Schedules read by AI are reviewed by you on the review screen before they
        become live numbers, and that review is not a formality — AI reading can
        misread a date, a scene number, a unit or a location. Check the days
        against your own schedule.
      </p>
      <p>
        A very long schedule may also come back only <b>partly</b> read. When
        that happens the app says so and tells you roughly how much was read;
        upload the rest separately rather than treating what came back as the
        whole shoot.
      </p>

      <h2 style={H2}>Your account</h2>
      <p>
        Keep your password to yourself, use one you do not use anywhere else, and
        do not upload material you are not permitted to share. We may suspend an
        account that is being used abusively or in a way that threatens the
        service.
      </p>

      <h2 style={H2}>Changes</h2>
      <p>
        If this policy changes in a way that affects what leaves the app, the
        date at the top of the page changes and we will tell you.
      </p>
    </main>
  );
}
