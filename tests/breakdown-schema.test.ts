// Crowd Breakdown import — schema + engine tolerance.
//
// Guards the two promises made when the breakdown-import model was added:
//   1. It is ADDITIVE — a schedule-parsed model with no breakdown metadata
//      costs exactly as it did before (the £596,689 baseline is asserted in
//      rate-engine.test.ts; here we prove row-level equivalence).
//   2. Reference-only constructs (stunts, children, action vehicles, dummies,
//      animals) are carried but NEVER priced, and a TBC tier costs at the
//      higher candidate rate so resolving it can only move the budget down.
//
// Source constructs are taken verbatim from the 5 analysed productions —
// Gangs of London, TMN Block A, London Rules, PDX and My Oxford Year.

import { describe, expect, it } from "vitest";
import {
  computeCrowdCosts,
  costableReq,
  effectiveTier,
  CROWD_DEFAULTS,
} from "../lib/engine/crowd";
import type { NamedCount, ScheduleModel, Scene, ShootDay } from "../lib/engine/types";

const scene = (over: Partial<Scene> = {}): Scene => ({
  num: "1",
  part: "",
  ie: "INT",
  tod: "DAY",
  scriptDay: "1",
  pages: "1",
  unit: "Main",
  desc: "",
  sa: 0,
  veh: 0,
  pod: false,
  cast: [],
  tags: [],
  ...over,
});

const day = (scenes: Scene[], over: Partial<ShootDay> = {}): ShootDay => ({
  num: 1,
  date: "Monday 6 July 2026",
  sr: "",
  ss: "",
  loc: "Barbican",
  hours: "0800-1700",
  type: "CWD",
  cams: "",
  pages: "",
  scenes,
  unit: "Main",
  id: "M1",
  ...over,
});

const model = (days: ShootDay[]): ScheduleModel => ({ days, castMap: {}, notes: [] });
const total = (m: ScheduleModel) => Math.round(computeCrowdCosts(m, {}, CROWD_DEFAULTS).grand);

describe("costableReq — what may reach a rate card", () => {
  it("a bare schedule-parsed row is costable (nothing changes for existing data)", () => {
    expect(costableReq({ name: "Passersby", count: 20 })).toBe(true);
  });

  it("excludes non-people: dummies, animals, action vehicles", () => {
    // GoL: "Wallace Guards Dummies with heads off x 2"
    expect(costableReq({ name: "Wallace Guards Dummies", count: 2, unitType: "prop" })).toBe(false);
    expect(costableReq({ name: "Dogs", count: 3, unitType: "animal" })).toBe(false);
    // LR: "2 x AV Cars (Action)"
    expect(costableReq({ name: "Cars", count: 2, unitType: "vehicle" })).toBe(false);
  });

  it("excludes rows explicitly outside the crowd budget", () => {
    // GoL footer: "STUNTS ARE NOT A PART OF THE CROWD BUDGET"
    expect(costableReq({ name: "Stunt Driver", count: 1, budgetScope: "reference" })).toBe(false);
  });

  it("excludes non-costing tiers even in a crowd column", () => {
    expect(costableReq({ name: "Child", count: 4, tier: "Child" })).toBe(false);
    expect(costableReq({ name: "Stunt", count: 1, tier: "Stunt" })).toBe(false);
    expect(costableReq({ name: "AV Cars", count: 2, tier: "AV" })).toBe(false);
  });

  it("a DEAD body is still a costable person — flags never change a rate", () => {
    // GoL: "1 Wallace Board Room Security - DEAD" (a performer, not a dummy)
    expect(costableReq({ name: "Wallace Board Room Security", count: 1, flags: ["dead"] })).toBe(
      true
    );
    // ...but a DEAD *dummy* is not, and the two are distinguished by unitType,
    // not by the flag — GoL contains both.
    expect(
      costableReq({ name: "Dummies", count: 2, flags: ["dead", "dummy"], unitType: "prop" })
    ).toBe(false);
  });
});

describe("effectiveTier — TBC costs at the higher candidate rate", () => {
  it("resolves 'SPACT?' upward from SA", () => {
    // TMN: "6 x St Mabyn's Lobby Mercs (SPACT?)"
    const r: NamedCount = { name: "St Mabyn's Lobby Mercs", count: 6, tierTbc: true };
    expect(effectiveTier(r, "SA")).toBe("SPACT");
  });

  it("leaves a resolved tier alone", () => {
    expect(effectiveTier({ name: "Passersby", count: 20 }, "SA")).toBe("SA");
    expect(effectiveTier({ name: "Mercs", count: 6, tier: "SPACT" }, "SA")).toBe("SPACT");
  });

  it("honours explicit candidates and never returns a non-costing tier", () => {
    const r: NamedCount = {
      name: "Bus Driver",
      count: 1,
      tierTbc: true,
      tierCandidates: ["SA", "Stunt"], // "(stunts - tbc)" — Stunt cannot be priced
    };
    expect(effectiveTier(r, "SA")).toBe("SA");
  });
});

describe("engine tolerance end to end", () => {
  it("reference-only rows add nothing to the crowd total", () => {
    const base = model([day([scene({ saChars: [{ name: "Prisoners", count: 20 }] })])]);
    const withRefs = model([
      day([
        scene({
          saChars: [
            { name: "Prisoners", count: 20 },
            { name: "Wallace Guards Dummies", count: 2, unitType: "prop", flags: ["dummy"] },
            { name: "Smart Embassy Dogs", count: 10, unitType: "animal" },
          ],
          featured: [{ name: "Stunt Driver", count: 1, budgetScope: "reference" }],
          spacts: [{ name: "Child Extras", count: 4, tier: "Child" }],
          children: [{ name: "School Kids", count: 12, tier: "Child" }],
          avs: [{ name: "Cars", count: 2, tier: "AV", unitType: "vehicle" }],
        }),
      ]),
    ]);
    expect(total(withRefs)).toBe(total(base));
    expect(total(base)).toBeGreaterThan(0); // the baseline is real, not zero
  });

  it("a TBC row costs MORE than the same row resolved to SA (budget can only fall)", () => {
    const asSa = model([day([scene({ saChars: [{ name: "Mercs", count: 6 }] })])]);
    const asTbc = model([
      day([scene({ saChars: [{ name: "Mercs", count: 6, tierTbc: true }] })])
    ]);
    const asSpact = model([
      day([scene({ saChars: [{ name: "Mercs", count: 6, tier: "SPACT" }] })])
    ]);
    expect(total(asTbc)).toBeGreaterThan(total(asSa));
    expect(total(asTbc)).toBe(total(asSpact));
  });

  it("weather-cover scenes do not add to the day's requirement", () => {
    // PDX explicitly double-schedules weather cover
    const normal = model([day([scene({ saChars: [{ name: "Crowd", count: 30 }] })])]);
    const plusCover = model([
      day([
        scene({ saChars: [{ name: "Crowd", count: 30 }] }),
        scene({ num: "2", status: "weatherCover", saChars: [{ name: "Crowd", count: 30 }] }),
      ]),
    ]);
    expect(total(plusCover)).toBe(total(normal));
  });

  // ---- POP corpus additions ----

  it("inline (FE) is just the Featured tier — no new mechanism needed", () => {
    // POP tags Featured inline as "(FE)"; GoL/MOY use colour, LR uses a column.
    // All three land on the same tier, so all three cost identically.
    const inlineTag = model([
      day([scene({ featured: [{ name: "Barman", count: 1, tier: "Featured", note: "(FE)" }] })]),
    ]);
    const fromColumn = model([day([scene({ featured: [{ name: "Barman", count: 1 }] })])]);
    expect(total(inlineTag)).toBe(total(fromColumn));
  });

  it("a bare (FROM ABOVE) scene carries the same bodies, not new ones", () => {
    // POP sc 54B/76/91PT: one cell, zero lines, inherits the whole list above.
    // Same day → the day's peak already counts those people once.
    const oneScene = model([day([scene({ saChars: [{ name: "Pub Crowd", count: 25 }] })])]);
    const withCarry = model([
      day([
        scene({ saChars: [{ name: "Pub Crowd", count: 25 }] }),
        scene({ num: "54B", contFromRef: "(FROM ABOVE)", contFrom: "1" }),
      ]),
    ]);
    expect(total(withCarry)).toBe(total(oneScene));
  });

  it("an inheriting scene is not a zero-crowd scene — cross-day carry must be materialised", () => {
    // The trap: the same pointer on a DIFFERENT day is 25 more booked bodies.
    // The engine cannot follow the pointer itself, so the importer must
    // materialise it; this test pins the consequence of not doing so, so the
    // behaviour is documented rather than discovered later.
    const unmaterialised = model([
      day([scene({ saChars: [{ name: "Pub Crowd", count: 25 }] })]),
      day([scene({ num: "76", contFrom: "1", contFromRef: "(FROM ABOVE)" })], {
        num: 2,
        id: "M2",
        date: "Tuesday 7 July 2026",
      }),
    ]);
    const materialised = model([
      day([scene({ saChars: [{ name: "Pub Crowd", count: 25 }] })]),
      day(
        [
          scene({
            num: "76",
            contFrom: "1",
            saChars: [{ name: "Pub Crowd", count: 25, cont: "1" }],
          }),
        ],
        { num: 2, id: "M2", date: "Tuesday 7 July 2026" }
      ),
    ]);
    expect(total(materialised)).toBeGreaterThan(total(unmaterialised));
  });

  it("reqStatus distinguishes a confirmed 'N/A' from an unfilled cell", () => {
    // Neither costs anything — the difference is whether it is an open item.
    const confirmedNone = model([day([scene({ reqStatus: "none" })])]);
    const notYetKnown = model([day([scene({ reqStatus: "pending" })])]);
    expect(total(confirmedNone)).toBe(0);
    expect(total(notYetKnown)).toBe(0);
    // ...and they must remain machine-distinguishable, which a count cannot do
    expect(confirmedNone.days[0].scenes[0].reqStatus).not.toBe(
      notYetKnown.days[0].scenes[0].reqStatus
    );
  });

  it("unitKind is carried without changing what a day costs", () => {
    const plain = model([day([scene({ saChars: [{ name: "Crowd", count: 10 }] })])]);
    const rehearsal = model([
      day([scene({ saChars: [{ name: "Crowd", count: 10 }] })], { unitKind: "rehearsal" }),
    ]);
    expect(total(rehearsal)).toBe(total(plain));
  });

  it("named SA groups still cost at the SA rate (a name is not a promotion)", () => {
    const named = model([day([scene({ saChars: [{ name: "Young Prisoners", count: 18 }] })])]);
    const anon = model([day([scene({ sa: 18 })])]);
    expect(total(named)).toBe(total(anon));
  });
});

// ---------------------------------------------------------------------------
// P0-1 regression: opening a day's crowd calculator must not change its cost.
//
// Two defects combined here. (a) seedCday() hardcoded 07:00-18:00, so a day
// scheduled 1100-2000 was priced from an 07:00 call. (b) Even with the right
// hours, having ANY config flips the day from the flat unedited branch (which
// charges no overtime at all) onto the per-head branch (which does) — so
// merely looking at a day raised its cost. Measured before the fix: D20 went
// £5,669 -> £9,410 and the grand total £596,689 -> £600,430.
// ---------------------------------------------------------------------------
describe("P0-1 — a seeded day config never changes cost", () => {
  const nightDay = day([scene({ saChars: [{ name: "Crowd", count: 40 }] })], {
    hours: "1100-2000",
    type: "CWD",
  });
  const unedited = model([nightDay]);

  it("a seeded config costs exactly the same as no config at all", () => {
    const seeded = {
      [`Main|1`]: {
        shift: "Day" as const, fw: "cwd" as const, ph: false,
        call: "07:00", wrap: "18:00", travel: "A" as const, chars: [], seeded: true,
      },
    };
    const before = Math.round(computeCrowdCosts(unedited, {}, CROWD_DEFAULTS).grand);
    const after = Math.round(computeCrowdCosts(unedited, seeded, CROWD_DEFAULTS).grand);
    expect(after).toBe(before);
  });

  it("clearing the flag (a real edit) does change the cost", () => {
    const touched = {
      [`Main|1`]: {
        shift: "Day" as const, fw: "cwd" as const, ph: false,
        call: "07:00", wrap: "18:00", travel: "A" as const, chars: [
          { name: "Crowd", count: 40, tier: "SA" as const },
        ],
      },
    };
    const before = Math.round(computeCrowdCosts(unedited, {}, CROWD_DEFAULTS).grand);
    const after = Math.round(computeCrowdCosts(unedited, touched, CROWD_DEFAULTS).grand);
    expect(after).not.toBe(before);
  });

  it("a config saved before the flag existed still costs as an edit (no silent regression)", () => {
    const legacy = {
      [`Main|1`]: {
        shift: "Day" as const, fw: "cwd" as const, ph: false,
        call: "07:00", wrap: "18:00", travel: "A" as const, chars: [
          { name: "Crowd", count: 40, tier: "SA" as const },
        ],
      },
    };
    const r = computeCrowdCosts(unedited, legacy, CROWD_DEFAULTS);
    expect(r.perDay["M1"].edited).toBe(true);
  });
});
