// Shared shapes for the CrowdOS / StuntOS rate engine.
// Ported from prototype_1.html — see RATE-ENGINE-NOTES.md for the locked rules.

export type CastType =
  | "cast"
  | "double"
  | "offCam"
  | "stuntCoord"
  | "stuntPerf"
  | "stuntDbl"
  | "stuntExtra";

export interface CastToken {
  code: string;
  type: CastType;
}

export interface NamedCount {
  name: string;
  count: number;
}

export interface Scene {
  num: string;
  part: string;
  ie: string;
  slug?: string;
  tod: string;
  scriptDay: string;
  pages: string;
  unit: string;
  desc: string;
  sa: number;
  veh: number;
  pod: boolean;
  podVeh?: number;
  cast: CastToken[];
  extras?: NamedCount[]; // "Stunt Performers" block (named stunt extras)
  spacts?: NamedCount[];
  featured?: NamedCount[];
  vehNames?: string[];
  tags: string[];
}

export interface ShootDay {
  num: number;
  date: string;
  sr: string;
  ss: string;
  loc: string;
  hours: string;
  type: string;
  cams: string;
  scenes: Scene[];
  pages: string;
  unit?: string; // 'Main' | '2nd', set by prepModel
  id?: string; //  M12 / U3, set by prepModel
  _date?: Date | null; // parsed calendar date, set by prepModel
}

export interface ScheduleNote {
  type: string;
  text: string;
  afterDay: number | null;
}

export interface ScheduleModel {
  days: ShootDay[];
  castMap: Record<string, string>;
  notes: ScheduleNote[];
  multiUnit?: boolean;
}

export type CrowdTier = "SA" | "Featured" | "SPACT";
export type TravelBand = "A" | "B";

export interface CharacterRow {
  name: string;
  count: number;
  tier: CrowdTier;
  scene?: string; // scene refs this character belongs to
  sup?: number; //  supplementary fees per head (this is how Featured works)
}

// Per-day crowd configuration (call/wrap etc.) — the prototype's CDAY entries.
export interface CrowdDayConfig {
  shift: "Day" | "Night";
  fw: "std" | "cwd";
  ph: boolean; // public holiday
  call: string; // "07:00"
  wrap: string; // "18:00"
  travel: TravelBand;
  chars: CharacterRow[];
}
