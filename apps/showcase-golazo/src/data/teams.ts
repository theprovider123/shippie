// ── Teams ───────────────────────────────────────────────────────────────────
// The 48-nation field for the 2026 FIFA World Cup (USA · Canada · Mexico).
//
// This is the single source of truth for the whole app. When the final draw is
// confirmed, only this file and `tournament.ts` need touching — every screen,
// the bracket, scoring and share cards read from here.
//
// `seed` is a 1..48 strength rank used to (a) auto-fill a sensible default
// bracket and (b) seed the knockout tree. Lower = stronger. It is *only* a
// default; the user overrides everything by tapping.

export type Confederation =
  | "UEFA"
  | "CONMEBOL"
  | "CONCACAF"
  | "CAF"
  | "AFC"
  | "OFC";

export interface Team {
  /** Stable 3-letter id. Used in share links — never renumber casually. */
  id: string;
  name: string;
  /** Short name for tight UI (bracket cells, chips). */
  short: string;
  flag: string;
  /** [primary, secondary] brand colours for badges, cards and the share image. */
  colors: [string, string];
  confederation: Confederation;
  /** 1 = strongest. Drives default picks + knockout seeding. */
  seed: number;
}

// Order here is roughly by seed; `seed` is assigned from the index below so the
// list stays easy to reorder by hand.
const ROSTER: Omit<Team, "seed">[] = [
  // — Pot 1 / hosts & favourites —
  { id: "ARG", name: "Argentina", short: "ARG", flag: "🇦🇷", colors: ["#75aadb", "#f6b40e"], confederation: "CONMEBOL" },
  { id: "FRA", name: "France", short: "FRA", flag: "🇫🇷", colors: ["#0055a4", "#ef4135"], confederation: "UEFA" },
  { id: "BRA", name: "Brazil", short: "BRA", flag: "🇧🇷", colors: ["#009c3b", "#ffdf00"], confederation: "CONMEBOL" },
  { id: "ENG", name: "England", short: "ENG", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", colors: ["#cf081f", "#1d3a8a"], confederation: "UEFA" },
  { id: "ESP", name: "Spain", short: "ESP", flag: "🇪🇸", colors: ["#aa151b", "#f1bf00"], confederation: "UEFA" },
  { id: "POR", name: "Portugal", short: "POR", flag: "🇵🇹", colors: ["#006600", "#ff0000"], confederation: "UEFA" },
  { id: "NED", name: "Netherlands", short: "NED", flag: "🇳🇱", colors: ["#ae1c28", "#21468b"], confederation: "UEFA" },
  { id: "BEL", name: "Belgium", short: "BEL", flag: "🇧🇪", colors: ["#ed2939", "#fae042"], confederation: "UEFA" },
  { id: "GER", name: "Germany", short: "GER", flag: "🇩🇪", colors: ["#111111", "#dd0000"], confederation: "UEFA" },
  { id: "MEX", name: "Mexico", short: "MEX", flag: "🇲🇽", colors: ["#006847", "#ce1126"], confederation: "CONCACAF" },
  { id: "CAN", name: "Canada", short: "CAN", flag: "🇨🇦", colors: ["#d80621", "#2b2b2b"], confederation: "CONCACAF" },
  { id: "USA", name: "United States", short: "USA", flag: "🇺🇸", colors: ["#0a3161", "#b31942"], confederation: "CONCACAF" },
  // — Pot 2 —
  { id: "CRO", name: "Croatia", short: "CRO", flag: "🇭🇷", colors: ["#d10a11", "#1d4ed8"], confederation: "UEFA" },
  { id: "ITA", name: "Italy", short: "ITA", flag: "🇮🇹", colors: ["#008c45", "#cd212a"], confederation: "UEFA" },
  { id: "URU", name: "Uruguay", short: "URU", flag: "🇺🇾", colors: ["#0038a8", "#fcd116"], confederation: "CONMEBOL" },
  { id: "COL", name: "Colombia", short: "COL", flag: "🇨🇴", colors: ["#fcd116", "#003893"], confederation: "CONMEBOL" },
  { id: "MAR", name: "Morocco", short: "MAR", flag: "🇲🇦", colors: ["#c1272d", "#006233"], confederation: "CAF" },
  { id: "SUI", name: "Switzerland", short: "SUI", flag: "🇨🇭", colors: ["#d52b1e", "#ededed"], confederation: "UEFA" },
  { id: "JPN", name: "Japan", short: "JPN", flag: "🇯🇵", colors: ["#bc002d", "#1f3a93"], confederation: "AFC" },
  { id: "SEN", name: "Senegal", short: "SEN", flag: "🇸🇳", colors: ["#00853f", "#fdef42"], confederation: "CAF" },
  { id: "DEN", name: "Denmark", short: "DEN", flag: "🇩🇰", colors: ["#c8102e", "#ededed"], confederation: "UEFA" },
  { id: "IRN", name: "Iran", short: "IRN", flag: "🇮🇷", colors: ["#239f40", "#da0000"], confederation: "AFC" },
  { id: "KOR", name: "South Korea", short: "KOR", flag: "🇰🇷", colors: ["#003478", "#c60c30"], confederation: "AFC" },
  { id: "AUS", name: "Australia", short: "AUS", flag: "🇦🇺", colors: ["#00843d", "#ffcd00"], confederation: "AFC" },
  // — Pot 3 —
  { id: "ECU", name: "Ecuador", short: "ECU", flag: "🇪🇨", colors: ["#ffdd00", "#034ea2"], confederation: "CONMEBOL" },
  { id: "AUT", name: "Austria", short: "AUT", flag: "🇦🇹", colors: ["#ed2939", "#ededed"], confederation: "UEFA" },
  { id: "UKR", name: "Ukraine", short: "UKR", flag: "🇺🇦", colors: ["#005bbb", "#ffd500"], confederation: "UEFA" },
  { id: "TUR", name: "Türkiye", short: "TUR", flag: "🇹🇷", colors: ["#e30a17", "#ededed"], confederation: "UEFA" },
  { id: "SRB", name: "Serbia", short: "SRB", flag: "🇷🇸", colors: ["#c6363c", "#0c4076"], confederation: "UEFA" },
  { id: "POL", name: "Poland", short: "POL", flag: "🇵🇱", colors: ["#dc143c", "#ededed"], confederation: "UEFA" },
  { id: "NOR", name: "Norway", short: "NOR", flag: "🇳🇴", colors: ["#ba0c2f", "#00205b"], confederation: "UEFA" },
  { id: "NGA", name: "Nigeria", short: "NGA", flag: "🇳🇬", colors: ["#008751", "#ededed"], confederation: "CAF" },
  { id: "EGY", name: "Egypt", short: "EGY", flag: "🇪🇬", colors: ["#ce1126", "#111111"], confederation: "CAF" },
  { id: "ALG", name: "Algeria", short: "ALG", flag: "🇩🇿", colors: ["#006233", "#d21034"], confederation: "CAF" },
  { id: "CIV", name: "Ivory Coast", short: "CIV", flag: "🇨🇮", colors: ["#f77f00", "#009e60"], confederation: "CAF" },
  { id: "CMR", name: "Cameroon", short: "CMR", flag: "🇨🇲", colors: ["#007a5e", "#ce1126"], confederation: "CAF" },
  // — Pot 4 —
  { id: "GHA", name: "Ghana", short: "GHA", flag: "🇬🇭", colors: ["#006b3f", "#fcd116"], confederation: "CAF" },
  { id: "RSA", name: "South Africa", short: "RSA", flag: "🇿🇦", colors: ["#007a4d", "#ffb612"], confederation: "CAF" },
  { id: "KSA", name: "Saudi Arabia", short: "KSA", flag: "🇸🇦", colors: ["#006c35", "#ededed"], confederation: "AFC" },
  { id: "QAT", name: "Qatar", short: "QAT", flag: "🇶🇦", colors: ["#8a1538", "#ededed"], confederation: "AFC" },
  { id: "IRQ", name: "Iraq", short: "IRQ", flag: "🇮🇶", colors: ["#007a3d", "#ce1126"], confederation: "AFC" },
  { id: "UZB", name: "Uzbekistan", short: "UZB", flag: "🇺🇿", colors: ["#1eb53a", "#0099b5"], confederation: "AFC" },
  { id: "JOR", name: "Jordan", short: "JOR", flag: "🇯🇴", colors: ["#007a3d", "#ce1126"], confederation: "AFC" },
  { id: "PAN", name: "Panama", short: "PAN", flag: "🇵🇦", colors: ["#005293", "#d21034"], confederation: "CONCACAF" },
  { id: "CRC", name: "Costa Rica", short: "CRC", flag: "🇨🇷", colors: ["#002b7f", "#ce1126"], confederation: "CONCACAF" },
  { id: "JAM", name: "Jamaica", short: "JAM", flag: "🇯🇲", colors: ["#009b3a", "#fed100"], confederation: "CONCACAF" },
  { id: "PAR", name: "Paraguay", short: "PAR", flag: "🇵🇾", colors: ["#0038a8", "#d52b1e"], confederation: "CONMEBOL" },
  { id: "NZL", name: "New Zealand", short: "NZL", flag: "🇳🇿", colors: ["#00247d", "#cc142b"], confederation: "OFC" },
];

export const TEAMS: Team[] = ROSTER.map((t, i) => ({ ...t, seed: i + 1 }));

const BY_ID: Record<string, Team> = Object.fromEntries(
  TEAMS.map((t) => [t.id, t]),
);

export function team(id: string): Team {
  const t = BY_ID[id];
  if (!t) throw new Error(`Unknown team id: ${id}`);
  return t;
}

export function maybeTeam(id: string | null | undefined): Team | null {
  if (!id) return null;
  return BY_ID[id] ?? null;
}
