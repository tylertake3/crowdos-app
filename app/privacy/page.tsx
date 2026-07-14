// Public privacy policy — required by Google's OAuth brand verification.
export const metadata = { title: "CrowdOS — Privacy Policy" };

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
      <h1 style={{ fontFamily: "var(--cond)", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 4 }}>
        CrowdOS — Privacy Policy
      </h1>
      <p style={{ color: "var(--sub)", marginBottom: 24 }}>Last updated: 14 July 2026</p>

      <h2 style={{ fontSize: 16, margin: "22px 0 6px" }}>What CrowdOS is</h2>
      <p>
        CrowdOS is a crowd and stunt budgeting and scheduling tool for film and
        television production, operated by Take 3 Agency.
      </p>

      <h2 style={{ fontSize: 16, margin: "22px 0 6px" }}>What we store</h2>
      <p>
        When you sign in we store your email address (and, if you use Google
        sign-in, your basic Google account profile: email and name) solely to
        identify your account. The productions, shoot days, schedules and
        budgeting data you create are stored privately against your account and
        are visible only to you. We do not sell or share your data with third
        parties, and we do not use it for advertising.
      </p>

      <h2 style={{ fontSize: 16, margin: "22px 0 6px" }}>Where it lives</h2>
      <p>
        Data is stored with Supabase (our database and authentication provider)
        and the application is hosted on Vercel. Access to your data is
        protected by row-level security tied to your account.
      </p>

      <h2 style={{ fontSize: 16, margin: "22px 0 6px" }}>Deleting your data</h2>
      <p>
        You can delete any production (and all its data) from within the app at
        any time. To delete your account entirely, contact us and we will
        remove it along with all associated data.
      </p>

      <h2 style={{ fontSize: 16, margin: "22px 0 6px" }}>Contact</h2>
      <p>
        Questions or deletion requests:{" "}
        <a href="mailto:tyler@take3agency.com" style={{ color: "var(--hv)" }}>
          tyler@take3agency.com
        </a>
      </p>
    </main>
  );
}
