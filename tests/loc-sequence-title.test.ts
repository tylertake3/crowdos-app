import { describe, expect, it } from "vitest";
import { looksLikeSequenceTitle, prepModel } from "../lib/engine/model";
import type { Scene, ScheduleModel } from "../lib/engine/types";

const scene = (slug: string): Scene => ({
  num: "1", part: "", ie: "INT", slug, tod: "DAY", scriptDay: "", pages: "",
  unit: "Main", desc: "", sa: 0, veh: 0, pod: false, podVeh: 0,
  cast: [], extras: [], spacts: [], saChars: [], featured: [], vehNames: [], tags: [],
});
const model = (loc: string, slug = "NATHAN'S HOTEL - SUITE"): ScheduleModel =>
  prepModel({
    days: [{ num: 1, date: "Monday, 3 August 2026", sr: "", ss: "", loc, hours: "", type: "", cams: "", scenes: [scene(slug)], pages: "" }],
    castMap: {}, notes: [],
  }, "Main");

describe("location must be a real place, never a story/sequence title", () => {
  it("flags narrative sequence/section titles", () => {
    for (const t of ["Hotel opening", "The Wedding opening", "Opening sequence", "Flashback", "Flash-back", "Montage", "Prologue", "Epilogue", "End titles"]) {
      expect(looksLikeSequenceTitle(t)).toBe(true);
    }
  });

  it("does NOT flag genuine mappable places", () => {
    for (const p of ["Four Seasons", "Barbican, London", "OMAX Studios", "Wenlock Road, N1", "Halstead Manor, Kent", "Clerkenwell", "Chase Farm Hospital"]) {
      expect(looksLikeSequenceTitle(p)).toBe(false);
    }
  });

  it("a mis-parsed 'Hotel opening' day location falls back to the scene location, not the bad value", () => {
    const m = model("Hotel opening");
    const d = m.days[0];
    expect(d.loc).toBe("NATHAN'S HOTEL - SUITE"); // scene location, ready to read as "TBC" real place
    expect((d.locBlocks || []).some((b) => b.loc === "Hotel opening")).toBe(false);
  });

  it("keeps a genuine day location untouched", () => {
    expect(model("Four Seasons").days[0].loc).toBe("Four Seasons");
  });
});
