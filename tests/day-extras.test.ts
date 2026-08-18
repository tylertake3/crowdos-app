import { describe, it, expect } from "vitest";
import {
  cdDayCost,
  daySaRequirement,
  CROWD_DEFAULTS,
  round2 as r2,
  type CrowdDayConfig,
  type ShootDay,
  computeCrowdCosts,
} from "../lib/engine";
import { prepModel } from "../lib/engine/model";

const day = (over: Partial<CrowdDayConfig> = {}): CrowdDayConfig => ({
  shift: "Day",
  fw: "std",
  ph: false,
  call: "08:00",
  wrap: "18:00",
  travel: "A",
  chars: [{ name: "Crowd", count: 40, tier: "SA" }],
  ...over,
});

// ---------------------------------------------------------------------------
// Day-level supplementary fees: "budget 20 heads on a Cat D fee". A day can
// carry several at once, and they never depend on which character they came
// from.
// ---------------------------------------------------------------------------
describe("additional payments budgeted at day level", () => {
  it("costs nothing when there are none — every existing day is unchanged", () => {
    const plain = cdDayCost(day());
    expect(plain.extraCost).toBe(0);
    expect(cdDayCost(day({ extras: [] })).cost).toBe(plain.cost);
  });

  it("charges amount × heads, and adds up across as many fees as the day has", () => {
    const d = cdDayCost(
      day({
        extras: [
          { label: "Cat D — wet work", amt: 40, count: 20 },
          { label: "Haircut", amt: 23.38, count: 5 },
        ],
      })
    );
    expect(d.extraCost).toBe(r2(40 * 20 + 23.38 * 5));
    expect(d.cost).toBe(r2(cdDayCost(day()).cost + d.extraCost));
  });

  it("two fees on the same number of heads both count — one per person is not the limit", () => {
    const one = cdDayCost(day({ extras: [{ label: "Wig", amt: 30, count: 40 }] }));
    const two = cdDayCost(
      day({
        extras: [
          { label: "Wig", amt: 30, count: 40 },
          { label: "Uniform", amt: 25, count: 40 },
        ],
      })
    );
    expect(two.extraCost).toBe(r2(one.extraCost + 25 * 40));
  });

  it("is artist money, so agency and contingency are charged on it", () => {
    const s = { ...CROWD_DEFAULTS, uplift: { agencyPct: 15, contingencyPct: 5 } };
    const d = cdDayCost(day({ extras: [{ label: "Cat D", amt: 40, count: 20 }] }), s);
    expect(d.artistCost).toBe(r2(d.saCost + d.extraCost));
    expect(d.uplift.agency).toBe(r2(d.artistCost * 0.15));
  });

  it("a blank or negative row cannot make the day cost less", () => {
    const d = cdDayCost(
      day({
        extras: [
          { label: "", amt: 0, count: 12 },
          { label: "Nonsense", amt: 20, count: -5 },
        ],
      })
    );
    expect(d.extraCost).toBe(0);
  });

  it("does not pretend the extra heads are bodies on the day", () => {
    const d = cdDayCost(day({ extras: [{ label: "Cat D", amt: 40, count: 20 }] }));
    expect(d.heads).toBe(40); // the 40 SA — the fee is money, not people
  });
});

// ---------------------------------------------------------------------------
// The reconcile line's schedule figure. This is the number an AD compares the
// calculator's own rows against, so it has to be counted by the same rules the
// costing engine counts a day's SA by.
// ---------------------------------------------------------------------------
const shootDay = (scenes: any[]): ShootDay =>
  ({ id: "d1", num: 1, date: "Mon 7 Sep", loc: "Hammersmith", hours: "0800-1830", scenes } as any);

const scene = (over: any = {}) => ({
  num: "1",
  sa: 0,
  saChars: [],
  featured: [],
  spacts: [],
  cast: [],
  ...over,
});

describe("what the schedule asks of a day in SA heads", () => {
  it("pools a named group across the day instead of counting it once per scene", () => {
    const d = shootDay([
      scene({ num: "10", saChars: [{ name: "Office workers", count: 10 }] }),
      scene({ num: "11", saChars: [{ name: "Office workers", count: 10 }] }),
      scene({ num: "12", saChars: [{ name: "Office workers", count: 10 }] }),
    ]);
    expect(daySaRequirement(d)).toBe(10);
  });

  it("adds a second, different group on top", () => {
    const d = shootDay([
      scene({ num: "10", saChars: [{ name: "Office workers", count: 10 }] }),
      scene({ num: "87", saChars: [{ name: "Journalists", count: 9 }] }),
    ]);
    expect(daySaRequirement(d)).toBe(19);
  });

  it("leaves weather-cover scenes out — they are the same people, scheduled twice", () => {
    const d = shootDay([
      scene({ num: "10", saChars: [{ name: "Office workers", count: 10 }] }),
      scene({ num: "10A", status: "weatherCover", saChars: [{ name: "Rain crowd", count: 40 }] }),
    ]);
    expect(daySaRequirement(d)).toBe(10);
  });

  it("does not count things that are not supporting artists", () => {
    const d = shootDay([
      scene({
        num: "10",
        saChars: [
          { name: "Office workers", count: 10 },
          { name: "Dummies", count: 6, unitType: "dummy" },
          { name: "Stunt team", count: 4, budgetScope: "reference" },
        ],
      }),
    ]);
    expect(daySaRequirement(d)).toBe(10);
  });

  it("a group engaged on a named role is that role, not an SA", () => {
    const roles = [{ id: "standin", label: "Stand-in", base: "SA", day: 200 } as any];
    const d = shootDay([
      scene({
        num: "10",
        saChars: [
          { name: "Office workers", count: 10 },
          { name: "Stand-ins", count: 4, roleId: "standin" },
        ],
      }),
    ]);
    expect(daySaRequirement(d, { ...CROWD_DEFAULTS, roles })).toBe(10);
    // with the role deleted the group falls back to its tier, and is an SA again
    expect(daySaRequirement(d)).toBe(14);
  });

  it("counts the anonymous peak alongside the named groups", () => {
    const d = shootDay([
      scene({ num: "10", sa: 30 }),
      scene({ num: "11", sa: 12, saChars: [{ name: "Nurses", count: 5 }] }),
    ]);
    expect(daySaRequirement(d)).toBe(35);
  });
});

// ---------------------------------------------------------------------------
// A day-level payment is money the schedule owes, so it has to reach the
// schedule's own totals — including on a day whose crowd has been emptied out.
// ---------------------------------------------------------------------------
describe("day-level payments in the whole-schedule totals", () => {
  const model = (): any =>
    prepModel(
      {
        days: [{
          num: 1, date: "Monday, 3 August 2026", sr: "", ss: "",
          loc: "Hammersmith", hours: "", type: "", cams: "", pages: "",
          scenes: [{
            num: "1", part: "", ie: "EXT", slug: "", tod: "DAY", scriptDay: "", pages: "",
            unit: "Main", desc: "", sa: 0, veh: 0, pod: false, podVeh: 0,
            cast: [], extras: [], spacts: [], saChars: [], featured: [], vehNames: [], tags: [],
          }],
        }],
        castMap: {}, notes: [],
      },
      "Main"
    );

  const cfg = (chars: any[], extras: any[]): CrowdDayConfig => ({
    shift: "Day", fw: "std", ph: false, call: "08:00", wrap: "18:00",
    travel: "A", chars, extras,
  });

  it("adds the payment to the day and to the grand total", () => {
    const none = computeCrowdCosts(model(), { "Main|1": cfg([{ name: "Crowd", count: 10, tier: "SA" }], []) });
    const some = computeCrowdCosts(model(), {
      "Main|1": cfg([{ name: "Crowd", count: 10, tier: "SA" }], [{ label: "Cat D", amt: 40, count: 10 }]),
    });
    expect(some.grand).toBeGreaterThan(none.grand);
    expect(some.perDay["M1"].extraCost).toBe(400);
  });

  it("still shows the day when the payment is all that is left on it", () => {
    const c = computeCrowdCosts(model(), { "Main|1": cfg([], [{ label: "Cat D", amt: 40, count: 10 }]) });
    expect(c.perDay["M1"]).toBeTruthy();
    expect(c.perDay["M1"].extraCost).toBe(400);
    expect(c.grand).toBeGreaterThan(0);
  });
});
