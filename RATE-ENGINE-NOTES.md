# CrowdOS / StuntOS — Rate Engine Handoff Notes
Ground truth for the Phase 2 port. The prototype file is `prototype.html`.
The crowd engine lives mainly in: `cdPerHead()`, `cdDayCost()`, `tierFwHours()`, `cdTimes()`,
constants `PACT`, `OTINC`, `SP3`, and the settings getters (`gOTd`, `gOTn`, `gETsa`, `gTA`, `gTB`,
`gSpHol`, `gSpNight`, `gSpET`) which read editable rate-card inputs with card defaults.

## Locked rules — PACT/FAA 2026 (SA + Featured)
- SA Basic Daily Rate £111.21 (day). Night BDR £166.82 applies ONLY on scheduled night shoots —
  a day shoot wrapping late keeps the day base.
- Holiday = 12.07% shown as a line on the DAY RATE only.
- OT and early-call payments are charged AND displayed holiday-inclusive:
  £11.69/30min day OT · £17.54/30min night OT (any OT block from 22:00 onward, INCLUDING past
  midnight) · £17.54/30min early call (per 30min before 07:00, rounded up).
  Public holiday: £17.54 day / £26.29 night+early.
- OT rounds UP per 30-min block.
- THE 07:00 FRAMEWORK RULE: the working day counts from max(call, 07:00). Pre-07:00 time is
  covered by early-call payments and never double-counts into basic hours or OT.
  Called 08:00 → day starts 08:00. Framework: Standard Day 9h, CWD 7h.
- Early call travel: called AT OR BEFORE 06:00 → +£20.91 (FAA 2026, from 1 Mar 2026;
  was £19.73 on the previous card). SA and SPACT are the same figure.
- Travel allowance per head from location: Cat A £17.09 (TfL Z1–3), Cat B £23.89 (major studios /
  beyond Z3). Auto-detected from location text; unknown → B + flagged, so an
  unrecognised location can only make the budget fall, never rise. Override with
  `CrowdSettings.unknownBand`; `travel.known === false` marks it in the UI.
- THERE IS NO FEATURED RATE. Featured SA = SA BDR + supplementary fees (per-character `sup` field).

## Locked rules — Take 3 SPACT 2026 (separate card, keep structurally separate)
- £255 basic + £15.50 FLAT payment in lieu of holiday (not a %). Night £372. PH £387.50/£432.50.
- Framework differs from SA: SWD 10h (incl. 1h lunch) / CWD 8h.
- Same OT money as PACT shown holiday-inclusive: £11.69 day, £17.54 after 22:00 & early call
  (PH £17.54/£26.29).
- Early-call travel £20.91 (same as SA under FAA 2026). Same travel bands A/B.

## Supplementary fees (per head, apply to any tier; this is how Featured works)
Hair/shaving £23 · Own clothing £23 · Sports/wet weather £23 · Scans/minimal dialogue £30.51 ·
Uniforms/specialised driving/car £37.22 · Lookalike/stand-in/dialogue 10+ words £61.62.
Meal penalties: short or late lunch £23.38 day / £35.08 night.

## Validation numbers the port MUST reproduce (defaults, Cat A travel unless stated)
- SA, call 07:05 → wrap 18:00, Standard Day: £111.21 + £13.42 hol + 4×£11.69 OT + £17.09 = **£188.48**
- SPACT, 07:00 → 18:00, SWD(10h): £255 + £15.50 + 2×£11.69 + £17.09 = **£310.97**
- SA, call 06:00 → wrap 18:00, Standard Day: adds 2×£17.54 early (£35.08) + £20.91 early travel
  → **£244.47** (day counts 11h from 07:00 → 4 OT blocks, NOT 12h)
- Prototype grand totals with the demo schedule ("Full Schedule" source, default rates):
  crowd mode **£574,155**; stunt mode **£261,270** (Main Unit only: £206,685).
  (Correction 2026-07-13: this originally said £574,342, but that figure was captured with a
  stray day-calculator edit saved in the browser's localStorage — testing residue, not an
  intended baseline. The clean prototype in a fresh browser shows £574,155; confirmed by Tyler.)
  (Correction 2026-07-14: current baseline **£596,689** — the prototype's parser missed Day 77's
  crowd, written "160 x c" with a lowercase c, costing the day at one head instead of 160.
  The ported parser reads it case-insensitively; +£22,534 vs the prototype figure.)

## Custom roles — a named role with its own rate card (`lib/engine/roles.ts`)
The engine shipped with exactly three costing tiers (`CrowdTier = "SA" | "Featured" | "SPACT"`),
so a stand-in or a picture double could only be modelled as an SA plus a supplementary fee. That
is not how a production pays one: a stand-in is engaged on its own negotiated day rate with its
own overtime and travel. A `CustomRole` is that rate card, defined per production by the user.

**Default: NONE.** `CrowdSettings.roles` is absent, and a row only prices through a role when it
names one. With no roles the demo schedule totals **£604,836.66**, byte-identical to before —
asserted in `tests/roles.test.ts`.

### The shape
`{ id, label, base: "sa" | "spact", day, night?, phDay?, phNight?, hol?, otDay?, otNight?,
otPhDay?, otPhNight?, earlyTravel?, travelA?, travelB?, note? }`. Only `id`, `label`, `base` and
`day` are required; every other money field inherits from the live card for `base`.

### Why `base` is STRUCTURAL, not monetary
`base` decides ONLY the framework hours of the working day (SA 9h std / 7h CWD; SPACT 10h std /
8h CWD) and the OT mechanics that go with them — the 07:00 framework rule, the 30-minute
round-up, the 22:00 night-OT switch. Those are properties of the **agreement's day**, not of the
money. A stand-in paid £180 still works a PACT-shaped day if that is the day they are on.
Everything monetary lives on the role. Roles price through the SAME `pactPerHead` / `spactPerHead`
functions the tiers use — there is no second implementation of the time rules.

**Holiday inherits the base's convention; a role never invents a third one.** Base `sa` → `hol`
is a FRACTION (0.1207) because that is how the PACT/FAA card is written; base `spact` → `hol` is
a FLAT payment in lieu (£15.50/day) because that is how the Take 3 card is written.

**An unstated night or public-holiday base is SCALED off the role's own day rate** by the base
card's night:day ratio (£180 SA-based → night £270.01), never inherited flat. Inheriting the
card's £166.82 would price a £180 role's nights BELOW its days — the one direction that is
indefensible. OT/early/travel figures are per-30-min or per-head agreement amounts, not
proportional to a day rate, so those inherit as-is.

### How a row names a role
`NamedCount.roleId?` (schedule/breakdown groups) and `CharacterRow.roleId?` (day-calculator
rows). Absent = today's behaviour exactly. A role is CROWD-ONLY — the stunt engine has its own
agreement, weekly/usage/insurance mechanics and no framework hours, so a crowd role is
meaningless there and `StuntSettings` is untouched.

### Costing and the existing machinery
- `costableReq` — a role makes the row a costing person: it overrides the `unitType` default and
  the never-cost tiers (Stunt/Child/AV), which roles do not collide with because `roleId` is its
  own field and the imported taxonomy is unchanged. The ONE thing it does not override is
  `budgetScope: "reference"` — that is an explicit "not in the crowd budget", and costing it
  anyway would double-count it against the department that really pays.
- `effectiveTier` / `tierTbc` — a live role never reaches it (its rate is stated). It is still
  what prices the row if the role is deleted, so the "cost at the higher candidate" rule applies
  to the fall-back exactly as it would have without the role.
- **Peak / headcount** — `dayPeakSA` is the anonymous "N x C" background peak and is untouched. A
  role group is a NAMED group, so it adds on top of that peak exactly as a named SA group does.
  Assigning a role MOVES a group out of its tier bucket into its role bucket; it never duplicates
  it. `DayCost.roleHeads` is exclusive of `sa`/`featPD`/`spactPD`, and `DayCost.heads` is the
  day's true body count (`sa + featPD + spactPD + roleHeads`) — that is what travel and meal
  penalties are charged on.
- Travel bands, early-call travel and public holidays all work as they do for the tiers, off the
  role's own figures.
- A role's money is ARTIST money: it is inside `artistCost` / `artistGrand`, and so inside the
  base agency commission and contingency are charged on.

### Totals
`DayCost.roles: Record<roleId, RoleDayTotal>` (`{ roleId, label, base, heads, perHead, travelPer,
cost, sup, groups }`) and `CrowdCosts.roleGrand: Record<roleId, RoleTotal>` (`{ …, days, heads, maxPerDay,
cost, sup }`), so a budget prints "Stand-in ×4 @ £180" beside the SA/Featured/SPACT lines.
`CrowdWeek.roleDays` carries the weekly head-days. `roleGrand` is a BREAKDOWN of `artistGrand`,
never an addition to it. Invariant on every branch: `cost === money(perHead, heads) + sup`.

`travelPer` is the day's travel allowance that is NOT inside `perHead` — zero on the priced
branches (where the agreement's travel is part of the per-head day) and the Cat A/B amount on an
un-priced day, where travel is charged once at day level on the whole body count. It is reporting
only, so the invariant above still holds. The TIER figures in `perHeadBy` always carry travel, so
anything printing a role line beside a tier line adds it — otherwise a stand-in reads cheaper than
an SA by exactly the travel allowance.

### On the crowd breakdown DOCUMENT (`lib/engine/breakdown-doc.ts`)
`CbLine.roleId` is carried from the source row, and the projection's `perHead(dayId, tier, roleId)`
hook is asked for the ROLE's figure whenever a line names a role that still exists — so the printed
line is priced through the role at the source. It is deliberately NOT matched back to a schedule
group by name afterwards: two same-named groups on different scenes, or a renamed one, mis-price or
miss silently, and this is the artefact a producer signs off. A live role is also its own POOLING
identity (`role:<id>|name`, the bucket crowd.ts uses), so "Guards" as stand-ins and "Guards" as SAs
on one day are two groups, exactly as the cost engine counts them. `CbOpts.roleLabel` names the
role; returning nothing means it has been deleted, and the line then falls back to its tier and its
id is listed on `CbDoc.missingRoles` for the UI to report.

### A deleted role
Falls back to the row's tier — never dropped, never costed at zero — and is reported on
`DayCost.missingRoles` (role ids) and `CrowdCosts.missingRoles` (role id → day ids), so the UI can
offer to re-point or re-create it.

## On-costs — the money a UK crowd budget owes ON TOP of the artist fees
`lib/engine/oncosts.ts` + `lib/engine/holidays.ts`. A line-producer review found the headline
number 15–20% light because the rate cards price what the ARTIST is paid, which is not what the
production pays. **Every setting below defaults to zero / off: no existing production's numbers
move by a penny until the user opts in.** All percentages are PERCENT numbers (17.5 = 17.5%),
unlike `PactSettings.hol`, which is a fraction because that is how the card is written.

### Uplift stack — `CrowdSettings.uplift` (default: all zero)
`{ agencyPct?, contingencyPct?, additional?: { label, pct }[] }`. UK crowd is booked through a
casting agency charging a handling fee, commonly 15–20%; crowd
budgets also carry 5–10% contingency. The `additional` lines are FREE-FORM and user-labelled
(employer NI, payroll admin, …) — the engine deliberately does not encode UK employment law.

**Order of application (it changes the number, so it is fixed and documented):**
1. artist cost = rate card + supplementary fees + meal penalties
2. agency commission = `agencyPct` × artist cost
3. each additional line = its own pct × artist cost (never compounded on the commission or on
   each other — which also makes the lines commutative)
4. subtotal = 1 + 2 + 3
5. contingency = `contingencyPct` × subtotal

Reasoning: an agency invoices its fee on the fees it pays out, not on the production's own
on-costs; employment on-costs are likewise assessed on what the artist is paid; contingency is a
buffer on COMMITTED spend and the production is committed to the agency fee too, so it is the
only line charged on the subtotal. Anyone wanting commission compounded on an on-cost can state
one combined percentage — there is no way back from an over-stated number.

Applied PER DAY inside the cost computation and settled to the penny per component (`money.ts`),
so the day column still foots exactly to the grand total. Broken out on every day
(`DayCost.uplift`) and in the totals (`CrowdCosts.artistGrand / mealGrand / upliftGrand`) so the
UI can print "artist cost / agency / contingency / total" rather than one opaque figure.
`upliftProvenanceLines()` / `crowdProvenanceLines()` return plain-English lines for the
provenance bar and export footers.

### Meal penalties on a shoot day — `CrowdDayConfig.meals` (default: none)
`{ short?: boolean; late?: boolean }`, costed PER HEAD at £23.38 day / £35.08 night
(`MEAL_PENALTY_DEFAULTS`, editable via `CrowdSettings.meals`). The rates already existed but
could only be used in the standalone calculator, so they never reached a budget — a late lunch on
a 200-head day is £4,676 in one hit. They are artist money, so they sit inside the base the
uplift percentages are charged on, and appear separately as `DayCost.mealCost` / `.meals`.

### UK bank holidays — `CrowdSettings.autoPublicHolidays` (default: FALSE)
`holidays.ts` carries the gazetted England & Wales dates (including substitute days) for
2026–2028. **Scotland differs** (2 Jan; Summer holiday on the FIRST Monday in August; no Easter
Monday) and Northern Ireland adds two more — a production shooting there must set PH by hand,
which is why this is opt-in. When on, a matching date prices as a public holiday (~50% more) on
both the edited and unedited branches. A user's own choice ALWAYS wins: `CrowdDayConfig.phSet`
marks a day the user stated, and a legacy config with `ph: true` counts as theirs. Each day
reports `CrowdDayEntry.ph = { applied, auto, user, name }` and the engine's own flags are listed
in `CrowdCosts.autoPhDays`, so the UI never presents an engine guess as a human decision.

### Cancellation of a cut day — `CrowdSettings.cancellation` (default: OFF)
`{ noticeDays?, pct? }`. When a revision drops a shoot day the diff reported a clean negative —
"you saved £38,000" — when inside the agency's notice window the production still owes most of
it. `cutDayCancellations(cutDays, oldCosts, settings, asOf)` prices the cut days off the OLD
revision's costs and returns `{ days, fullCost, charge, saved }`; report `saved` as the movement
with `charge` beside it. A day cut with notice ≤ `noticeDays` (a past day always qualifies) is
charged `pct` of its full all-in cost. An undated day is never charged — `daysNotice: null` marks
it for the UI to ask. Terms vary by agency, hence the zero default: with it, `saved` is the full
cost, exactly as the diff read before.

## Stunt engine (StuntOS)
Performer £600/day, coordinator £1,000/day; + £17.50 holiday flat; + 55.5% usage on the day rate;
insurance £17.50 charged on the first 2 working days per person per week (shared across units);
per-day stunt adjustments (⚡) added per event.

## The rate card is the source of truth (2026-08)
The numbers above are the DEFAULTS of a card, not constants the engine reaches past the card to
use. Every rule a crowd rate card prints is one entry in `CROWD_SCHEMA` (`lib/board/app.js`) —
day/night/public-holiday rates, half days, fittings, rehearsals, shift and non-performance calls,
holiday, framework hours, all four overtime figures, broken turnaround, the four travel bands,
supplementary categories A–E, the three meal-break penalties across day/night/PH-day/PH-night,
meal allowances, cancellation fees and intimacy/nudity fees.

- SA and SPACT share the SAME schema, so a card duplicates cleanly from one talent type to the
  other and a new agreement is a new set of numbers rather than new code. Field ids are derived
  per talent type (`crowdFieldId`); the eleven ids that predate the schema keep their names, so
  every saved card, production override and hidden calculator input still resolves.
- Anything the engine does not yet charge automatically is marked `ref:true` and shown in the
  editor with a "reference" tag. Do not quietly promote one to a charged field without saying so.
- `PactSettings` / `SpactSettings` now carry `fwStd`/`fwCwd` and the full night + public-holiday
  set. All are optional and default to the frozen constants, so an older settings object behaves
  exactly as it did — but `crowdSettingsFromDOM()` fills them from the resolved card, so a user
  who types next year's card is actually paid on it. Before this, night shoots and bank holidays
  silently charged 2026 money on exactly the days that cost the most.
- The SPACT card carries its own overtime and travel. `cdPerHead` only falls back to the PACT
  card's travel band when the SPACT card is silent on it.
- Meal penalties gained a third key (`supper`) and public-holiday rates. A card with no PH rate
  keeps charging its ordinary day/night figure.
- The supplementary-fee picker and the calculator's meal ticks are built from the active card
  (`supsNow`, `mealsNow`), refreshed by `applyRateVals`. A fee already typed on a line survives a
  card switch.
- Cards carry paperwork too: effective dates, an agreement reference, notes, and the source PDF.
  Standards ship their real documents in `public/rate-cards/`; a user's own upload goes to the
  private `schedule-files` bucket under `<uid>/rate-cards/…`. The preview draws pages with pdf.js
  rather than an iframe — the app sends `frame-ancestors 'none'` on everything it serves, so even
  its own PDFs cannot be framed.
- Duplicate is how you get an editable copy of a standard, and how next year's card starts from
  this year's. Standards themselves stay read-only.

## Architecture notes worth keeping
- All totals derive from a single per-head function — never duplicate rate maths in views.
- Per-day overrides (shift, framework, call/wrap, travel, PH, characters with scene refs,
  supplementary fees) are stored per day and recompute everything.
- Characters belong conceptually to SCENES (scene field on each character row); a future
  scene-move feature must carry characters with the scene.
