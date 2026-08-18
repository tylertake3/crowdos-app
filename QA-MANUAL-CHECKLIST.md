# Laural / CrowdOS — manual test checklist

Work down the list and note pass/fail. Ordered by **most likely to break first**.
`[ ]` = to do. Write the actual number you see where a figure is asked for.

Two things to know before you start:

- **P0-1 and P0-2 in the report are live right now.** Until P0-1 is fixed, *any*
  figure you read after opening a day calculator may be inflated. Do the money
  checks in section A **before** opening any day calculator, and reload the page
  between money checks.
- Where a test needs two accounts, use throwaway addresses — **not** your real
  production data.

---

## A. Money integrity — do these FIRST, on every browser

Reload the page before each one. Do not open a day calculator until A5.

| # | Do this | Correct result |
|---|---|---|
| A1 | Open the sample **Full Schedule**, Crowd mode. Read the headline total. | **£596,689** exactly |
| A2 | Switch to Stunt mode. Read the headline total. | **£261,270** exactly |
| A3 | Crowd mode → **Crowd cost breakdown**. Add up a card's itemised rows and compare to the total printed in that card's header. | They should match. Note any card where they don't (rounding). |
| A4 | Crowd mode → **Crowd** tab → count the day rows. | Should be **66** days. If a day you know has crowd is missing, note its D-number. |
| A5 | Now open **D20**'s crowd calculator (Thu 16 Jul, Canary Wharf, scheduled 1100–2000). Look at the Hours & shift row **before touching anything**. | **FAILS TODAY:** shows 07:00–18:00, not 11:00–20:00. |
| A6 | Close it with **Close**. Read D20's cost and the headline total. | **FAILS TODAY:** D20 goes £5,669 → £9,410; total £596,689 → £600,430. |
| A7 | Reload. Open **D93** (Sat 7 Nov, scheduled 1930–0430 — a night shoot). Check the Day/Night toggle. | **FAILS TODAY:** shows "Day", not "Night". |
| A8 | Open a day calculator, change the SA count, press Tab, then press **Close** (not "Reset to schedule"). Reload the page. | Your new count should still be there. |
| A9 | Same again but press **Reset to schedule**. | Count returns to the schedule's peak. This is correct behaviour. |
| A10 | On a day whose crowd is a **named** group (e.g. a scene with "Pedestrians 20" rather than "20 x C"), open the day calculator and check the Characters list. | **LIKELY FAILS:** named groups may be missing from the list, which drops them from the day's cost. |

---

## B. Auth — needs two throwaway accounts, one browser

This is the P0-2 leak. Do it in a normal window (not private), because the bug
depends on data persisting between sessions.

| # | Do this | Correct result |
|---|---|---|
| B1 | Sign up as **account A** with first name + surname + role. | Account created; your name appears on the account button / sidebar. |
| B2 | Check the inbox for a confirmation email. | Email arrives. Note how long it takes. |
| B3 | Try to sign in **before** confirming. | A clear message telling you to confirm your email first. |
| B4 | Sign in as A. Import any schedule. Add a casting brief with a name in it. | Saves. |
| B5 | **Sign out.** Look at the screen before signing in again. | **FAILS TODAY:** A's schedules are still visible on screen after sign-out. |
| B6 | Now sign up as brand-new **account B** on that same browser. Sign in. | **FAILS TODAY:** A's schedules + briefs get uploaded into B's account. Check B's dashboard — if A's production is listed, this is confirmed. |
| B7 | Sign in as A with the **wrong** password. | A clear "incorrect password"-style message. |
| B8 | Try to sign up again with A's email. | **FAILS TODAY:** says "check your inbox" — but no email is sent, because the address already exists. |
| B9 | Look for a **"Forgot password?"** link on the sign-in screen. | **FAILS TODAY:** does not exist. There is no way to recover an account. |
| B10 | Sign in as A, then in a second tab sign out. Return to tab 1 and edit something. | Should notice the session is gone and tell you. |

---

## C. Uploads & parsing

| # | Do this | Correct result |
|---|---|---|
| C1 | Upload a real schedule PDF. | Parses → review screen → publish. Day count matches the document. |
| C2 | On the review screen, check a few dates against the PDF. | Dates match exactly, including the year. |
| C3 | Upload a **non-schedule** PDF (any letter or invoice). | A clear "couldn't find any shoot days" message. Note the exact wording — it should not mention API keys or sign-in. |
| C4 | Upload a **photo** (JPG) of a schedule page. | Either reads it or fails clearly. |
| C5 | Upload a corrupt/renamed file (rename a .txt to .pdf). | Clear "couldn't read that PDF". **Verified working.** |
| C6 | Upload a very large PDF (100+ pages). | Should complete or fail clearly — **note if it hangs with no way to cancel.** |
| C7 | Upload the same schedule twice as two revisions of one unit. | Newest becomes current; older shown as superseded, contributing nothing to totals. |
| C8 | Upload two different productions whose PDF files have the **same filename**. | **LIKELY FAILS:** they may share day-calculator settings and scene edits. High priority to check. |
| C9 | Where the schedule has notation the reader didn't understand, check the field. | Left blank, not guessed. |
| C10 | Import a crowd breakdown that covers several scenes with one set-up ("Sc.23, 24, 25") or writes "as above". On the day board, look at the covering scenes. | Each shows the same crowd as the scene it points at, every chip labelled **(FROM ABOVE)**. The day's crowd figure must be **unchanged** — the same people, counted once. |
| C11 | Same import → Crowd breakdown document. | The covering scenes still read **AS SCENE 23 (FROM ABOVE)** rather than reprinting the list. Type one new group into scene 24 and the full list should come back. |
| C12 | Crowd mode, day board: ⌘/Ctrl-click three crowd chips, then Shift-click a fourth. | A bar appears at the bottom: "4 groups selected", with the head count and how many scenes. Chips are ringed. |
| C13 | With several selected, use **Copy to scene…** → pick a scene → answer "Same people". | All of them land on that scene. The day total does **not** rise. One Undo puts it back. |
| C14 | With several selected, press **⌘C**, hover another scene's crowd cell and press **⌘V** (try a scene on a different day too). | All the copied groups appear on that scene. Right-clicking the scene should also offer "Paste N crowd groups here". |
| C15 | With several selected, press **Delete**, then Undo. | All go at once; Undo restores all of them in one step. |

---

## D. Per-browser sweep

Run the short list below in **each** browser. Full detail in section E.

**Desktop: Chrome / Safari / Firefox**

| # | Check | Correct result |
|---|---|---|
| D1 | Every tab opens: Day board, Calendar, Cost breakdown, Crowd, Briefs, Doods, Calculator, Cast list. | All render, no blank panels. |
| D2 | Calendar: 7 equal columns, Sunday fully visible. | Equal columns. |
| D3 | **Doods** tab: scroll right — does the character-name column stay pinned? Scroll down — does the day header stay pinned? | Both stay pinned. **Most likely to fail in Safari** (sticky table cells). |
| D4 | Day calculator: drag both slider handles. | Both move; times and cost update. |
| D5 | Hover a cost figure. | Tooltip appears. |
| D6 | Top bar while scrolling. | Blurred/legible background. **Safari 17 and older: blur missing** (no `-webkit-` prefix) — note if text is hard to read. |
| D7 | Briefs → **Email to agency**. | Mail app opens with subject + body filled. |
| D8 | Risk assessment → export PDF. | Downloads and opens; check the Day/Night and INT/EXT column values against the schedule. |
| D9 | **Print** a risk assessment (Cmd-P). | Readable. **Check the dark header bars aren't white-on-white.** |
| D10 | Right-click a scene row. | Menu with Edit scene / Delete scene. |
| D11 | Open the browser console (F12) and click through every tab. | No red errors. **Verified clean in Chrome.** |

**Mobile: iPhone Safari / Android Chrome**

| # | Check | Correct result |
|---|---|---|
| M1 | Site loads at phone width, no sideways scrolling of the whole page. | Fits. |
| M2 | Tap ☰ → drawer opens. Tap the **✕ in the drawer** → closes. | Closes. |
| M3 | Drawer open → tap the **dimmed area** (and the floating ✕ top-right) → closes. | Closes. |
| M4 | Drawer open → is the page behind it locked (can't scroll)? | Locked. |
| M5 | **Tap** a cost figure (not a button). | Tooltip appears and stays ~4s. New in the latest release. |
| M6 | Tap a *button* that has a tooltip. | Does its action; no tooltip. |
| M7 | Calendar: 7 equal columns, Sunday visible, cells show date + D-chip + cost. | Equal. Location/hours appear when you tap the day. |
| M8 | Tap a calendar day → pop-up with full detail. | Opens. |
| M9 | Day calculator sliders — drag with a finger. | **Likely awkward.** The time fields above are the intended path — check you can tap and edit those. |
| M10 | Tap a production card's **edit pencil**. | **FAILS TODAY:** invisible on touch (hover-only). It's still tappable — check whether you can find it. |
| M11 | **Try to add or edit a scene.** | **FAILS TODAY:** right-click only, so impossible on touch. Confirm there's no other route. |
| M12 | Briefs → Email to agency. | iOS Mail opens with the text. |
| M13 | Rotate to landscape and back. | Layout recovers; drawer state sane. |
| M14 | Wide tables (cost breakdown) — swipe sideways. | Table scrolls, page doesn't. |
| M15 | On a notched iPhone, check the top bar and drawer aren't under the notch/home bar. | Clear. No safe-area handling exists, so worth a look. |
| M16 | iOS Safari **Private** browsing: load the app and edit something. | Should not crash (localStorage throws in private mode — there is a fallback, but it's worth confirming). |

**Tablet (iPad)**

| # | Check | Correct result |
|---|---|---|
| T1 | Which layout do you get at 768–820px — drawer or fixed sidebar? | Drawer at ≤820px. |
| T2 | Doods + cost breakdown horizontal scrolling. | Smooth, headers pinned. |
| T3 | Scene add/edit. | Same failure as M11 — right-click only. |
| T4 | Long-press a scene row. | Note whether it opens the context menu or just selects text. |

---

## E. Dates — the top cross-browser hazard

Safari and Firefox reject date strings Chrome guesses at. Check these **in Safari and Firefox specifically**:

| # | Check | Correct result |
|---|---|---|
| E1 | Day board: every day shows a real date. | No "Invalid Date" / blank / NaN. |
| E2 | Calendar: months and weekday columns line up; days land on the right weekday. | Correct. Compare 3 days against the PDF. |
| E3 | Week labels in the cost breakdown ("w/c 5 Jul"). | Sensible and consistent with Chrome. |
| E4 | "Today" highlight lands on the actual today. | Correct. |
| E5 | Briefs: a "sent" date badge. | Real date, not Invalid Date. |
| E6 | Dashboard "last edited" times. | Sensible. |
| E7 | A schedule spanning a **BST→GMT change** (late Oct): check days either side of the clock change. | No day shifted by one. |

---

## F. Empty states

| # | Do this | Correct result |
|---|---|---|
| F1 | Brand-new account, no productions: look at the dashboard. | **FAILS TODAY:** blank band where a "create your first production" prompt should be. |
| F2 | Create a production, add **no** schedule. Look at the headline cost tiles. | **FAILS TODAY:** may still show the *previous* production's total. Check carefully — this is misleading. |
| F3 | With that empty production open, click **Calculator**. | **FAILS TODAY:** likely completely blank. |
| F4 | A schedule with days but no crowd, in Crowd mode: check each tab. | Should say "no crowd requirement", not show £0 tables. |
| F5 | Same in Stunt mode with no stunt work. | Same. |
| F6 | A one-liner schedule (scenes, no crowd breakdown): Cast list tab. | Should not be just two tables of zeros. |

---

## G. Productions & data separation

| # | Do this | Correct result |
|---|---|---|
| G1 | Create two productions, put different data in each, switch between them. | Data swaps cleanly, nothing from A visible in B. |
| G2 | Check the **headline cost** of production B right after switching from A. | **LIKELY FAILS:** B may be priced with A's rate card. Compare B's total before/after visiting A. |
| G3 | Write a **risk assessment** in production A, then open one in B. | **FAILS TODAY:** A's hazard text and production title appear in B. Safety-document issue — check it. |
| G4 | Rename a production. Check its change history and any glossary answers. | Should survive the rename. |
| G5 | Delete a production, then re-import a PDF **with the same filename**. | **FAILS TODAY:** the deleted production's scene edits, briefs and notes come back. |
| G6 | Delete one schedule from a production with several. | Only that one goes. |
| G7 | Tick some briefs for a batch email, switch production, open Briefs. | Selection should be cleared, not carried over. |

---

## H. Offline / degraded

| # | Do this | Correct result |
|---|---|---|
| H1 | Go offline (airplane mode / devtools), edit a day, come back online. | Edit survives and syncs. **Worth watching closely — cloud writes fail silently.** |
| H2 | Edit a brief while offline. | Should tell you it hasn't saved. |
| H3 | Leave the app open for an hour, come back and edit. | Either works or clearly tells you to sign in again. |
| H4 | Sign in on two devices, edit the same production on both. | Note what happens — last-write-wins is expected, but check nothing vanishes silently. |

---

## What I could not test for you

- Real email delivery (confirmation, and there is no reset email to test).
- Any real browser other than the Chromium engine in my preview pane.
- Real iOS/Android devices — every M/T row above is untested by me.
- Cross-account isolation with two real signed-in users (I proved anonymous
  users are blocked at the database, but not user-A-vs-user-B).
- Printing and PDF export rendering.
- Anything requiring your production Supabase credentials.
