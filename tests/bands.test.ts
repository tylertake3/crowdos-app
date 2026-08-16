import { describe, expect, it } from "vitest";
import { CROWD_DEFAULTS, bandFor, computeCrowdCosts } from "../lib/engine/crowd";
import { prepModel } from "../lib/engine/model";
import type { Scene, ScheduleModel } from "../lib/engine/types";

const scene = (sa: number): Scene => ({
  num: "1", part: "", ie: "EXT", slug: "", tod: "DAY", scriptDay: "", pages: "",
  unit: "Main", desc: "", sa, veh: 0, pod: false, podVeh: 0,
  cast: [], extras: [], spacts: [], saChars: [], featured: [], vehNames: [], tags: [],
});
const model = (loc: string): ScheduleModel =>
  prepModel({
    days: [{ num: 1, date: "Monday, 3 August 2026", sr: "", ss: "", loc, hours: "", type: "", cams: "", scenes: [scene(10)], pages: "" }],
    castMap: {}, notes: [],
  }, "Main");

describe("travel-band overrides (Production Settings → Locations)", () => {
  it("bandFor: an override beats the gazetteer, case-insensitively, as a substring", () => {
    const s = { ...CROWD_DEFAULTS, bands: { "Halstead Manor": "B" as const } };
    expect(bandFor("EXT HALSTEAD MANOR - GARDENS", s)).toEqual({ band: "B", known: true });
    // CHANGED 2026-08-15: an unrecognised location now takes the HIGHER band.
    // It used to default to A, which under-budgeted every regional shoot and
    // every location nobody had added to the gazetteer yet — a budget that can
    // only be revised upwards. See lib/engine/location.ts.
    expect(bandFor("Somewhere else", s).band).toBe("B");
    expect(bandFor("Somewhere else", s).known).toBe(false);
    // …and a production that wants the old behaviour can still ask for it
    expect(bandFor("Somewhere else", { ...s, unknownBand: "A" }).band).toBe("A");
  });

  it("computeCrowdCosts pays the overridden band's travel rate", () => {
    const settings = { ...CROWD_DEFAULTS, unknownBand: "A" as const };
    const base = computeCrowdCosts(model("Halstead Manor, Kent"), {}, settings);
    const over = computeCrowdCosts(model("Halstead Manor, Kent"), {}, {
      ...settings, bands: { "halstead manor": "B" },
    });
    const dBase = base.perDay["M1"], dOver = over.perDay["M1"];
    expect(dBase.travel.band).toBe("A"); // pinned to the old default for this comparison
    expect(dOver.travel.band).toBe("B");
    expect(dOver.travel.known).toBe(true);
    // 10 heads × (23.89 − 17.09) more travel
    expect(dOver.cost - dBase.cost).toBeCloseTo(10 * (CROWD_DEFAULTS.pact.travelB - CROWD_DEFAULTS.pact.travelA), 2);
  });

  it("an unrecognised location is charged band B and flagged as unrecognised", () => {
    const c = computeCrowdCosts(model("Halstead Manor, Kent")).perDay["M1"];
    expect(c.travel.band).toBe("B");
    expect(c.travel.known).toBe(false); // the UI can say so
    expect(c.travel.amt).toBe(CROWD_DEFAULTS.pact.travelB);
  });
});
