// Builds the demo schedule sources (Main Unit, 2nd Unit, Full Schedule)
// exactly the way the prototype's boot sequence did. Phase 3 step 2 replaces
// this with per-production schedules persisted in Supabase.

import { mergeModels, parseAny, prepModel } from "./engine";
import type { ScheduleModel } from "./engine";
import { DEMO_FULLFAT } from "./engine/demo/demo-fullfat";
import { DEMO_2NDUNIT } from "./engine/demo/demo-2ndunit";

export interface Source {
  title: string;
  short: string;
  model: ScheduleModel;
}

export function buildDemoSources(): Source[] {
  const mMain = prepModel(parseAny(DEMO_FULLFAT), "Main");
  const m2U = prepModel(parseAny(DEMO_2NDUNIT), "2nd");
  m2U.castMap = Object.assign({}, mMain.castMap, m2U.castMap);
  const mAll = mergeModels(mMain, m2U);
  return [
    { title: "Piccadilly S8 — Blue Main Unit Expanded Schedule (03 Jul 26)", short: "Main Unit", model: mMain },
    { title: "Piccadilly S8 — Blue 2nd Unit Expanded Schedule (03 Jul 26)", short: "2nd Unit", model: m2U },
    { title: "Piccadilly S8 — Full production: Main + 2nd Unit (03 Jul 26)", short: "Full Schedule", model: mAll },
  ];
}

export function personName(castMap: Record<string, string>, code: string): string {
  const n =
    castMap[code] ??
    castMap[String(code).toUpperCase()] ??
    castMap[String(code).toLowerCase()] ??
    code;
  return String(n).replace(/STUNT ARRANGER/gi, "STUNT COORDINATOR");
}
