// Location → TfL travel band (A = Zones 1–3 £17.09, B = studios / beyond
// Zone 3 £23.89). Auto-detected from location text; unknown → A + flagged.

import type { TravelBand } from "./types";

const LOC_A = [
  "canary wharf", "chelsea", "hammersmith", "white city", "barbican",
  "regents park", "regent’s park", "silvertown", "westminster", "soho",
  "piccadilly", "kings cross", "king’s cross", "waterloo", "clerkenwell",
  "southwark", "isle of dogs", "aldersgate", "islington", "camden",
  "greenwich", "stratford", "ealing", "brixton", "shoreditch", "holborn",
  "mayfair", "embankment", "victoria", "paddington", "notting hill",
  "tower bridge", "london bridge", "bank", "moorgate", "covent garden",
  "leicester square", "trafalgar", "whitehall", "strand", "fleet street",
  "temple", "blackfriars", "battersea", "fulham", "putney", "wandsworth",
  "bermondsey", "rotherhithe", "canada water", "lewisham", "deptford",
  "new cross", "bow", "mile end", "bethnal green", "hackney", "dalston",
  "highbury", "finsbury", "hampstead", "kilburn", "maida vale",
  "st johns wood", "swiss cottage", "kensington", "knightsbridge",
  "belgravia", "pimlico", "vauxhall", "elephant", "old street", "angel",
  "euston", "marylebone", "tottenham court", "russell square",
  "malet street", "john adam", "great suffolk", "union street",
  "waterloo bridge", "oxford street", "woolwich tunnel",
];
const LOC_B = [
  "studio", "pinewood", "elstree", "leavesden", "longcross", "shepperton",
  "twickenham", "high wycombe", "oxford", "stokenchurch", "woolwich",
  "thamesmead", "croydon", "heathrow", "watford", "slough", "hertford",
  "hatfield", "hartford", "wembley", "richmond", "kingston", "barnet",
  "enfield", "romford", "dartford", "uxbridge", "denham", "bray",
  "black park", "bovingdon", "cardington",
];

export interface LocationBand {
  band: TravelBand;
  known: boolean;
  match?: string;
}

export function locationBand(loc: string | undefined | null): LocationBand {
  const l = (loc || "").toLowerCase();
  if (!l) return { band: "A", known: false };
  // A checked first where phrases overlap (e.g. 'woolwich tunnel' A vs 'woolwich' B)
  for (const a of LOC_A) if (l.includes(a)) return { band: "A", known: true, match: a };
  for (const b of LOC_B) if (l.includes(b)) return { band: "B", known: true, match: b };
  return { band: "A", known: false };
}
