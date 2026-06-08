// The 16 host venues of the 2026 World Cup, with city + a short broadcaster-region hint.
// A fixture is pinned to a venue deterministically (stable hash of its id) so the same match
// always shows the same ground — a little real-world texture without a backend or live feed.

export type Host = "USA" | "CAN" | "MEX";

export interface Venue {
  stadium: string;
  city: string;
  country: Host;
  /** IANA timezone of the ground (handy for "kicks off at the stadium" context). */
  tz: string;
}

export const VENUES: Venue[] = [
  { stadium: "MetLife Stadium", city: "New York / New Jersey", country: "USA", tz: "America/New_York" },
  { stadium: "AT&T Stadium", city: "Dallas", country: "USA", tz: "America/Chicago" },
  { stadium: "Mercedes-Benz Stadium", city: "Atlanta", country: "USA", tz: "America/New_York" },
  { stadium: "NRG Stadium", city: "Houston", country: "USA", tz: "America/Chicago" },
  { stadium: "Arrowhead Stadium", city: "Kansas City", country: "USA", tz: "America/Chicago" },
  { stadium: "SoFi Stadium", city: "Los Angeles", country: "USA", tz: "America/Los_Angeles" },
  { stadium: "Levi's Stadium", city: "San Francisco Bay Area", country: "USA", tz: "America/Los_Angeles" },
  { stadium: "Lumen Field", city: "Seattle", country: "USA", tz: "America/Los_Angeles" },
  { stadium: "Hard Rock Stadium", city: "Miami", country: "USA", tz: "America/New_York" },
  { stadium: "Lincoln Financial Field", city: "Philadelphia", country: "USA", tz: "America/New_York" },
  { stadium: "Gillette Stadium", city: "Boston", country: "USA", tz: "America/New_York" },
  { stadium: "BMO Field", city: "Toronto", country: "CAN", tz: "America/Toronto" },
  { stadium: "BC Place", city: "Vancouver", country: "CAN", tz: "America/Vancouver" },
  { stadium: "Estadio Azteca", city: "Mexico City", country: "MEX", tz: "America/Mexico_City" },
  { stadium: "Estadio Akron", city: "Guadalajara", country: "MEX", tz: "America/Mexico_City" },
  { stadium: "Estadio BBVA", city: "Monterrey", country: "MEX", tz: "America/Monterrey" },
];

/** Stable 0..n-1 hash so a fixture id always maps to the same venue. */
function hashIndex(id: string, mod: number): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % mod;
}

export function venueFor(fixtureId: string): Venue {
  return VENUES[hashIndex(fixtureId, VENUES.length)];
}

/** The showpiece grounds, for knockout flavour (final at MetLife, as scheduled). */
export const FINAL_VENUE = VENUES[0];
