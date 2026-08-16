import { describe, it, expect } from "vitest";
import { cdPerHead, CROWD_DEFAULTS } from "../lib/engine/crowd";
import { PACT_DEFAULTS } from "../lib/engine/pact";
import { SPACT_DEFAULTS } from "../lib/engine/spact";
import { mealPenaltyPerHead, MEAL_PENALTY_DEFAULTS } from "../lib/engine/oncosts";

const day = (o: any = {}) => ({ shift: "Day", fw: "std", call: "07:00", wrap: "18:00", travel: "", ...o }) as any;

describe("a card's own rules are the ones that get paid", () => {
  it("framework hours off the card change when overtime starts", () => {
    const base = cdPerHead(day({ wrap: "18:00" }), "SA", CROWD_DEFAULTS);
    expect(base.otBlocks).toBe(4); // 11h from 07:00 against a 9h day
    const longDay = { ...CROWD_DEFAULTS, pact: { ...PACT_DEFAULTS, fwStd: 11 } };
    expect(cdPerHead(day({ wrap: "18:00" }), "SA", longDay).otBlocks).toBe(0);
  });

  it("a night rate typed on the card is what a night shoot pays", () => {
    const s = { ...CROWD_DEFAULTS, pact: { ...PACT_DEFAULTS, night: 225 } };
    const p = cdPerHead(day({ shift: "Night", call: "18:00", wrap: "03:00" }), "SA", s);
    expect(p.base).toBe(225);
  });

  it("SPACT keeps its own travel money", () => {
    const s = {
      ...CROWD_DEFAULTS,
      pact: { ...PACT_DEFAULTS, travelA: 17.09 },
      spact: { ...SPACT_DEFAULTS, travelA: 25 },
    };
    expect(cdPerHead(day({ travel: "A" }), "SPACT", s).travel).toBe(25);
  });

  it("SPACT falls back to the PACT band when its own card is silent", () => {
    const spact: any = { ...SPACT_DEFAULTS };
    delete spact.travelA;
    const s = { ...CROWD_DEFAULTS, pact: { ...PACT_DEFAULTS, travelA: 19 }, spact };
    expect(cdPerHead(day({ travel: "A" }), "SPACT", s).travel).toBe(19);
  });

  it("public-holiday meal penalties are charged on a public holiday", () => {
    const on = { short: true } as any;
    expect(mealPenaltyPerHead(on, "Night", MEAL_PENALTY_DEFAULTS, true).per).toBe(52.58);
    expect(mealPenaltyPerHead(on, "Night", MEAL_PENALTY_DEFAULTS, false).per).toBe(35.08);
  });

  it("the short supper penalty is chargeable", () => {
    expect(mealPenaltyPerHead({ supper: true } as any, "Day", MEAL_PENALTY_DEFAULTS).per).toBe(23.38);
  });

  it("a card with no public-holiday meal rate keeps charging its day rate", () => {
    const s: any = { short: { label: "Short lunch", day: 10, night: 20 } };
    expect(mealPenaltyPerHead({ short: true } as any, "Day", s, true).per).toBe(10);
  });
});
