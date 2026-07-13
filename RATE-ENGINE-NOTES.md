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
- Early call travel: called AT OR BEFORE 06:00 → +£19.73.
- Travel allowance per head from location: Cat A £17.09 (TfL Z1–3), Cat B £23.89 (major studios /
  beyond Z3). Auto-detected from location text; unknown → A + flagged.
- THERE IS NO FEATURED RATE. Featured SA = SA BDR + supplementary fees (per-character `sup` field).

## Locked rules — Take 3 SPACT 2026 (separate card, keep structurally separate)
- £255 basic + £15.50 FLAT payment in lieu of holiday (not a %). Night £372. PH £387.50/£432.50.
- Framework differs from SA: SWD 10h (incl. 1h lunch) / CWD 8h.
- Same OT money as PACT shown holiday-inclusive: £11.69 day, £17.54 after 22:00 & early call
  (PH £17.54/£26.29).
- Early-call travel £20.91 (vs SA £19.73). Same travel bands A/B.

## Supplementary fees (per head, apply to any tier; this is how Featured works)
Hair/shaving £23 · Own clothing £23 · Sports/wet weather £23 · Scans/minimal dialogue £30.51 ·
Uniforms/specialised driving/car £37.22 · Lookalike/stand-in/dialogue 10+ words £61.62.
Meal penalties: short or late lunch £23.38 day / £35.08 night.

## Validation numbers the port MUST reproduce (defaults, Cat A travel unless stated)
- SA, call 07:05 → wrap 18:00, Standard Day: £111.21 + £13.42 hol + 4×£11.69 OT + £17.09 = **£188.48**
- SPACT, 07:00 → 18:00, SWD(10h): £255 + £15.50 + 2×£11.69 + £17.09 = **£310.97**
- SA, call 06:00 → wrap 18:00, Standard Day: adds 2×£17.54 early (£35.08) + £19.73 early travel
  → **£243.29** (day counts 11h from 07:00 → 4 OT blocks, NOT 12h)
- Prototype grand totals with the demo schedule ("Full Schedule" source, default rates):
  crowd mode **£574,342**; stunt mode **£261,270** (Main Unit only: £206,685).

## Stunt engine (StuntOS)
Performer £600/day, coordinator £1,000/day; + £17.50 holiday flat; + 55.5% usage on the day rate;
insurance £17.50 charged on the first 2 working days per person per week (shared across units);
per-day stunt adjustments (⚡) added per event.

## Architecture notes worth keeping
- All totals derive from a single per-head function — never duplicate rate maths in views.
- Per-day overrides (shift, framework, call/wrap, travel, PH, characters with scene refs,
  supplementary fees) are stored per day and recompute everything.
- Characters belong conceptually to SCENES (scene field on each character row); a future
  scene-move feature must carry characters with the scene.
