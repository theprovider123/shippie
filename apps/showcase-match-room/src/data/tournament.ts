export interface Team {
  code: string;
  name: string;
  group: string;
  swatch: [string, string];
}

export interface TeamProfile {
  code: string;
  region: string;
  shortFact: string;
  roomPrompt: string;
}

export interface Fixture {
  id: string;
  matchNo: number;
  stage: string;
  group: string;
  kickoff: string;
  venue: string;
  cityCode: string;
  city: string;
  home: string;
  away: string;
}

export interface HostCity {
  code: string;
  name: string;
  country: string;
  palette: [string, string, string];
  motif: 'papel' | 'lake' | 'sunset' | 'ticker' | 'mountain' | 'star' | 'tile';
}

export interface HostCityProfile {
  code: string;
  timeZone: string;
  venueName: string;
  cityNote: string;
  venueNote: string;
  localBite: string;
  paperNote: string;
}

export const HOST_CITIES: HostCity[] = [
  { code: 'MEX-CITY', name: 'Mexico City', country: 'Mexico', palette: ['#D94F8A', '#0E5C3A', '#F7C948'], motif: 'papel' },
  { code: 'GDL', name: 'Guadalajara', country: 'Mexico', palette: ['#E85D3F', '#006847', '#F6D06F'], motif: 'tile' },
  { code: 'MTY', name: 'Monterrey', country: 'Mexico', palette: ['#1B6CA8', '#D94A38', '#E9D8A6'], motif: 'mountain' },
  { code: 'TOR', name: 'Toronto', country: 'Canada', palette: ['#D52B1E', '#111111', '#F4EFE4'], motif: 'lake' },
  { code: 'VAN', name: 'Vancouver', country: 'Canada', palette: ['#007A5E', '#1D4E89', '#F4EFE4'], motif: 'mountain' },
  { code: 'LA', name: 'Los Angeles', country: 'United States', palette: ['#F2A65A', '#3B1F5C', '#0E5C3A'], motif: 'sunset' },
  { code: 'NYNJ', name: 'New York/New Jersey', country: 'United States', palette: ['#111111', '#C9A24B', '#F4EFE4'], motif: 'ticker' },
  { code: 'MIA', name: 'Miami', country: 'United States', palette: ['#00A6A6', '#F25C54', '#FFE066'], motif: 'sunset' },
  { code: 'ATL', name: 'Atlanta', country: 'United States', palette: ['#8A1538', '#111111', '#C9A24B'], motif: 'star' },
  { code: 'BOS', name: 'Boston', country: 'United States', palette: ['#123C69', '#B33A3A', '#F4EFE4'], motif: 'ticker' },
  { code: 'DAL', name: 'Dallas', country: 'United States', palette: ['#003594', '#B4975A', '#F4EFE4'], motif: 'star' },
  { code: 'HOU', name: 'Houston', country: 'United States', palette: ['#E35205', '#00205B', '#F4EFE4'], motif: 'star' },
  { code: 'KC', name: 'Kansas City', country: 'United States', palette: ['#C8102E', '#FFB612', '#F4EFE4'], motif: 'star' },
  { code: 'PHI', name: 'Philadelphia', country: 'United States', palette: ['#004C54', '#A5ACAF', '#F4EFE4'], motif: 'ticker' },
  { code: 'SFBAY', name: 'San Francisco Bay Area', country: 'United States', palette: ['#B3995D', '#AA0000', '#F4EFE4'], motif: 'mountain' },
  { code: 'SEA', name: 'Seattle', country: 'United States', palette: ['#005C5C', '#69BE28', '#F4EFE4'], motif: 'mountain' },
];

export const TEAMS: Team[] = [
  { code: 'MEX', name: 'Mexico', group: 'A', swatch: ['#006847', '#CE1126'] },
  { code: 'RSA', name: 'South Africa', group: 'A', swatch: ['#007A4D', '#FFB612'] },
  { code: 'KOR', name: 'Korea Republic', group: 'A', swatch: ['#CD2E3A', '#0047A0'] },
  { code: 'CZE', name: 'Czechia', group: 'A', swatch: ['#11457E', '#D7141A'] },
  { code: 'CAN', name: 'Canada', group: 'B', swatch: ['#D52B1E', '#FFFFFF'] },
  { code: 'BIH', name: 'Bosnia and Herzegovina', group: 'B', swatch: ['#002395', '#FECB00'] },
  { code: 'QAT', name: 'Qatar', group: 'B', swatch: ['#8A1538', '#FFFFFF'] },
  { code: 'SUI', name: 'Switzerland', group: 'B', swatch: ['#DA291C', '#FFFFFF'] },
  { code: 'BRA', name: 'Brazil', group: 'C', swatch: ['#FEDD00', '#009739'] },
  { code: 'MAR', name: 'Morocco', group: 'C', swatch: ['#C1272D', '#006233'] },
  { code: 'HAI', name: 'Haiti', group: 'C', swatch: ['#00209F', '#D21034'] },
  { code: 'SCO', name: 'Scotland', group: 'C', swatch: ['#005EB8', '#FFFFFF'] },
  { code: 'USA', name: 'United States', group: 'D', swatch: ['#3C3B6E', '#B22234'] },
  { code: 'PAR', name: 'Paraguay', group: 'D', swatch: ['#D52B1E', '#0038A8'] },
  { code: 'AUS', name: 'Australia', group: 'D', swatch: ['#00843D', '#FFCD00'] },
  { code: 'TUR', name: 'Türkiye', group: 'D', swatch: ['#E30A17', '#FFFFFF'] },
  { code: 'GER', name: 'Germany', group: 'E', swatch: ['#000000', '#DD0000'] },
  { code: 'CUW', name: 'Curaçao', group: 'E', swatch: ['#002B7F', '#F9E814'] },
  { code: 'CIV', name: "Côte d'Ivoire", group: 'E', swatch: ['#F77F00', '#009E60'] },
  { code: 'ECU', name: 'Ecuador', group: 'E', swatch: ['#FFDD00', '#034EA2'] },
  { code: 'NED', name: 'Netherlands', group: 'F', swatch: ['#FF4F00', '#21468B'] },
  { code: 'JPN', name: 'Japan', group: 'F', swatch: ['#BC002D', '#FFFFFF'] },
  { code: 'SWE', name: 'Sweden', group: 'F', swatch: ['#006AA7', '#FECC00'] },
  { code: 'TUN', name: 'Tunisia', group: 'F', swatch: ['#E70013', '#FFFFFF'] },
  { code: 'BEL', name: 'Belgium', group: 'G', swatch: ['#000000', '#FDDA24'] },
  { code: 'EGY', name: 'Egypt', group: 'G', swatch: ['#CE1126', '#000000'] },
  { code: 'IRN', name: 'Iran', group: 'G', swatch: ['#239F40', '#DA0000'] },
  { code: 'NZL', name: 'New Zealand', group: 'G', swatch: ['#000000', '#FFFFFF'] },
  { code: 'ESP', name: 'Spain', group: 'H', swatch: ['#AA151B', '#F1BF00'] },
  { code: 'CPV', name: 'Cape Verde', group: 'H', swatch: ['#003893', '#CF2027'] },
  { code: 'KSA', name: 'Saudi Arabia', group: 'H', swatch: ['#006C35', '#FFFFFF'] },
  { code: 'URU', name: 'Uruguay', group: 'H', swatch: ['#0038A8', '#FCD116'] },
  { code: 'FRA', name: 'France', group: 'I', swatch: ['#002395', '#ED2939'] },
  { code: 'SEN', name: 'Senegal', group: 'I', swatch: ['#00853F', '#FDEF42'] },
  { code: 'IRQ', name: 'Iraq', group: 'I', swatch: ['#CE1126', '#000000'] },
  { code: 'NOR', name: 'Norway', group: 'I', swatch: ['#BA0C2F', '#00205B'] },
  { code: 'ARG', name: 'Argentina', group: 'J', swatch: ['#75AADB', '#F6B40E'] },
  { code: 'ALG', name: 'Algeria', group: 'J', swatch: ['#006633', '#D21034'] },
  { code: 'AUT', name: 'Austria', group: 'J', swatch: ['#ED2939', '#FFFFFF'] },
  { code: 'JOR', name: 'Jordan', group: 'J', swatch: ['#007A3D', '#CE1126'] },
  { code: 'POR', name: 'Portugal', group: 'K', swatch: ['#006600', '#FF0000'] },
  { code: 'COD', name: 'DR Congo', group: 'K', swatch: ['#007FFF', '#F7D618'] },
  { code: 'UZB', name: 'Uzbekistan', group: 'K', swatch: ['#1EB53A', '#0099B5'] },
  { code: 'COL', name: 'Colombia', group: 'K', swatch: ['#FCD116', '#003893'] },
  { code: 'ENG', name: 'England', group: 'L', swatch: ['#CE1124', '#FFFFFF'] },
  { code: 'CRO', name: 'Croatia', group: 'L', swatch: ['#FF0000', '#171796'] },
  { code: 'GHA', name: 'Ghana', group: 'L', swatch: ['#FCD116', '#006B3F'] },
  { code: 'PAN', name: 'Panama', group: 'L', swatch: ['#005293', '#D21034'] },
];

export const TEAM_PROFILES: Record<string, TeamProfile> = {
  MEX: { code: 'MEX', region: 'North America', shortFact: 'Hosts the opening night, so every room starts with a proper home-crowd test.', roomPrompt: 'Who handles the opening-night pressure best?' },
  RSA: { code: 'RSA', region: 'Southern Africa', shortFact: 'A room-friendly pick for upset cards: bright swatches, loud support, big opener energy.', roomPrompt: 'Does South Africa spoil the party?' },
  KOR: { code: 'KOR', region: 'East Asia', shortFact: 'Korea Republic brings pace, pressing, and a fan culture that travels well.', roomPrompt: 'Who is chasing every loose ball?' },
  CZE: { code: 'CZE', region: 'Central Europe', shortFact: 'Czechia is a tidy tournament-room pick: disciplined, technical, and awkward to call.', roomPrompt: 'Is this the quietly dangerous team?' },
  CAN: { code: 'CAN', region: 'North America', shortFact: 'Canada gives the app its first northern-host storyline and a natural office sweepstake favourite.', roomPrompt: 'How far does the host-city bounce go?' },
  BIH: { code: 'BIH', region: 'Balkans', shortFact: 'Bosnia and Herzegovina adds a passionate diaspora-room storyline to Group B.', roomPrompt: 'Who is carrying the midfield mood?' },
  QAT: { code: 'QAT', region: 'West Asia', shortFact: 'Qatar is a useful trivia hook for recent tournament hosting and warm-weather football.', roomPrompt: 'Do they keep the ball or chase the game?' },
  SUI: { code: 'SUI', region: 'Central Europe', shortFact: 'Switzerland is made for prediction leagues: steady, stubborn, and rarely simple.', roomPrompt: 'Is this the safest pick in the group?' },
  BRA: { code: 'BRA', region: 'South America', shortFact: 'Brazil is the sweepstake card everyone photographs first.', roomPrompt: 'Is anything less than a deep run a disaster?' },
  MAR: { code: 'MAR', region: 'North Africa', shortFact: 'Morocco gives trivia packs geography, colour, and giant-killing expectation.', roomPrompt: 'Who has the calmer knockout nerve?' },
  HAI: { code: 'HAI', region: 'Caribbean', shortFact: 'Haiti brings a Caribbean storyline and a perfect underdog share-card setup.', roomPrompt: 'Who in the room is calling the upset?' },
  SCO: { code: 'SCO', region: 'Northern Europe', shortFact: 'Scotland is built for family and pub banter: hope, noise, and receipts.', roomPrompt: 'Who is emotionally overcommitted already?' },
  USA: { code: 'USA', region: 'North America', shortFact: 'The United States anchors the biggest host-country footprint across the tournament.', roomPrompt: 'Home advantage or group-stage stress?' },
  PAR: { code: 'PAR', region: 'South America', shortFact: 'Paraguay is a classic awkward opponent for exact-score prediction rooms.', roomPrompt: 'Does this become a one-goal grind?' },
  AUS: { code: 'AUS', region: 'Oceania/Asia', shortFact: 'Australia adds early-morning watch-party energy for viewers on the other side of the planet.', roomPrompt: 'Who is staying up for this one?' },
  TUR: { code: 'TUR', region: 'Europe/West Asia', shortFact: 'Türkiye is a high-volume room team: colour, noise, swings, and strong opinions.', roomPrompt: 'Are they chaos or control today?' },
  GER: { code: 'GER', region: 'Central Europe', shortFact: 'Germany is a bracket-builder magnet: every route conversation has to account for them.', roomPrompt: 'Who is refusing to bet against them?' },
  CUW: { code: 'CUW', region: 'Caribbean', shortFact: 'Curaçao is a brilliant trivia and geography pick for casual rooms.', roomPrompt: 'Who picked them because the story felt good?' },
  CIV: { code: 'CIV', region: 'West Africa', shortFact: "Côte d'Ivoire brings one of the strongest colour identities in the draw.", roomPrompt: 'Is this the most fun swatch on the wall chart?' },
  ECU: { code: 'ECU', region: 'South America', shortFact: 'Ecuador gives rooms a proper altitude-and-athleticism debate.', roomPrompt: 'Who underrates them at their peril?' },
  NED: { code: 'NED', region: 'Western Europe', shortFact: 'The Netherlands turns every wall chart orange without using a crest.', roomPrompt: 'Are they stylish or ruthless this year?' },
  JPN: { code: 'JPN', region: 'East Asia', shortFact: 'Japan is a favourite for tidy, technical, high-tempo prediction chaos.', roomPrompt: 'Who has them as the smart upset pick?' },
  SWE: { code: 'SWE', region: 'Northern Europe', shortFact: 'Sweden adds a clean flag-and-geography trivia lane.', roomPrompt: 'Do they keep it cool under pressure?' },
  TUN: { code: 'TUN', region: 'North Africa', shortFact: 'Tunisia is a compact, hard-to-call team for exact-score leagues.', roomPrompt: 'Is this a low-scoring trap?' },
  BEL: { code: 'BEL', region: 'Western Europe', shortFact: 'Belgium gives office rooms a familiar heavy-hitter pick without needing official marks.', roomPrompt: 'Who still believes in the big run?' },
  EGY: { code: 'EGY', region: 'North Africa', shortFact: 'Egypt adds historical depth, flag trivia, and big-stage expectation.', roomPrompt: 'Who carries the pressure tonight?' },
  IRN: { code: 'IRN', region: 'West Asia', shortFact: 'Iran is a fixture-list team people underestimate until the table tightens.', roomPrompt: 'Is this the group spoiler?' },
  NZL: { code: 'NZL', region: 'Oceania', shortFact: 'New Zealand makes global timezone mode feel real: some rooms wake up, others stay up.', roomPrompt: 'Who is watching this over breakfast?' },
  ESP: { code: 'ESP', region: 'Southern Europe', shortFact: 'Spain is a possession-football trivia staple and a bracket route problem.', roomPrompt: 'Do they pass teams tired?' },
  CPV: { code: 'CPV', region: 'West Africa/Atlantic', shortFact: 'Cape Verde is ideal for geography trivia and underdog sweepstake cards.', roomPrompt: 'Who drew the best story team?' },
  KSA: { code: 'KSA', region: 'West Asia', shortFact: 'Saudi Arabia adds a high-upside upset-alert lane for share cards.', roomPrompt: 'Who is brave enough to call it?' },
  URU: { code: 'URU', region: 'South America', shortFact: 'Uruguay is small-country, huge-football-culture energy in one tile.', roomPrompt: 'Is this the room’s hard-nosed pick?' },
  FRA: { code: 'FRA', region: 'Western Europe', shortFact: 'France is the team everyone wants or fears in a sweepstake draw.', roomPrompt: 'Who gets blamed if they fall short?' },
  SEN: { code: 'SEN', region: 'West Africa', shortFact: 'Senegal brings colour, rhythm, and a strong casual-fan storyline.', roomPrompt: 'Who has them winning the group?' },
  IRQ: { code: 'IRQ', region: 'West Asia', shortFact: 'Iraq is a strong trivia hook for West Asian football culture.', roomPrompt: 'Who is doing the deep-draw research?' },
  NOR: { code: 'NOR', region: 'Northern Europe', shortFact: 'Norway gives prediction rooms a proper star-power debate without needing player likenesses.', roomPrompt: 'Who is the room most worried about?' },
  ARG: { code: 'ARG', region: 'South America', shortFact: 'Argentina turns any group chat into receipts, legacy talk, and exact-score bravado.', roomPrompt: 'Who is calling another run?' },
  ALG: { code: 'ALG', region: 'North Africa', shortFact: 'Algeria adds derby-level noise to any room with North African football fans.', roomPrompt: 'Who is backing the atmosphere pick?' },
  AUT: { code: 'AUT', region: 'Central Europe', shortFact: 'Austria is a smart dark-horse tile for hardcore rooms.', roomPrompt: 'Is this the analytics pick?' },
  JOR: { code: 'JOR', region: 'West Asia', shortFact: 'Jordan adds fresh geography and flags content for family trivia.', roomPrompt: 'Who drew the wildcard?' },
  POR: { code: 'POR', region: 'Southern Europe', shortFact: 'Portugal is made for knockout-route arguments and confident prediction receipts.', roomPrompt: 'Who is putting them in the final?' },
  COD: { code: 'COD', region: 'Central Africa', shortFact: 'DR Congo brings a vibrant swatch and a strong sweepstake storyline.', roomPrompt: 'Who drew the loudest card?' },
  UZB: { code: 'UZB', region: 'Central Asia', shortFact: 'Uzbekistan gives Match Room a proper Central Asian trivia lane.', roomPrompt: 'Who knows the least but believes the most?' },
  COL: { code: 'COL', region: 'South America', shortFact: 'Colombia adds music, colour, and a room-friendly upset ceiling.', roomPrompt: 'Who is dancing if this lands?' },
  ENG: { code: 'ENG', region: 'Northern Europe', shortFact: 'England is the receipts machine: families, offices, pubs, all arguing at once.', roomPrompt: 'Who says they are not getting carried away?' },
  CRO: { code: 'CRO', region: 'Balkans', shortFact: 'Croatia is the knockout nerve team people never want in their route.', roomPrompt: 'Do they drag this deep again?' },
  GHA: { code: 'GHA', region: 'West Africa', shortFact: 'Ghana brings flag trivia, big support, and excellent sweepstake energy.', roomPrompt: 'Who is backing the group surprise?' },
  PAN: { code: 'PAN', region: 'Central America', shortFact: 'Panama adds a clean geography lane and a strong underdog prompt.', roomPrompt: 'Who is the optimistic one?' },
};

export const HOST_CITY_PROFILES: Record<string, HostCityProfile> = {
  'MEX-CITY': { code: 'MEX-CITY', timeZone: 'America/Mexico_City', venueName: 'Mexico City Stadium', cityNote: 'Opening-night altitude, colour, and noise. Match Room treats it with papel-picado rhythm and vivid pink/gold accents.', venueNote: 'Historic football setting, framed generically here to avoid official venue marks.', localBite: 'Room snack idea: tacos al pastor, lime, and something cold.', paperNote: 'Barragan pink, volcanic green, papel-picado cuts, and warm museum paper.' },
  GDL: { code: 'GDL', timeZone: 'America/Mexico_City', venueName: 'Estadio Guadalajara', cityNote: 'A western Mexico stop with tiled pattern energy and warm tournament colour.', venueNote: 'A large modern football ground; Match Room uses generic venue naming.', localBite: 'Room snack idea: birria-style tacos or tortas ahogadas.', paperNote: 'Talavera tile rhythm, mariachi poster warmth, terracotta, and deep green.' },
  MTY: { code: 'MTY', timeZone: 'America/Monterrey', venueName: 'Estadio Monterrey', cityNote: 'Mountain-backed northern Mexico energy with a bolder blue-and-red palette.', venueNote: 'A dramatic setting for wide-screen display rooms.', localBite: 'Room snack idea: cabrito-inspired grill plates.', paperNote: 'Sierra ridgelines, industrial blue, rust red, and dry northern paper grain.' },
  TOR: { code: 'TOR', timeZone: 'America/Toronto', venueName: 'Toronto Stadium', cityNote: 'Lake-shore host city, useful for family rooms and North American timezone handoffs.', venueNote: 'Compact city venue energy, rendered with red, black, and lake-light neutrals.', localBite: 'Room snack idea: peameal sandwiches or loaded fries.', paperNote: 'Streetcar red, lake grey, skyline grid lines, and crisp newspaper margins.' },
  VAN: { code: 'VAN', timeZone: 'America/Vancouver', venueName: 'BC Place Vancouver', cityNote: 'Pacific, mountain, and glass-city flavour for late-night European rooms.', venueNote: 'Indoor-big-match feel with a cool green and blue treatment.', localBite: 'Room snack idea: sushi platters or salmon bites.', paperNote: 'Evergreen ink, glass-blue water, mountain silhouettes, and rain-soft paper.' },
  LA: { code: 'LA', timeZone: 'America/Los_Angeles', venueName: 'Los Angeles Stadium', cityNote: 'Sunset, palms, and knockout glamour without using club or league marks.', venueNote: 'A marquee stadium moment for share cards and watch-party display mode.', localBite: 'Room snack idea: street tacos or Korean BBQ sliders.', paperNote: 'Sunset bands, palm-shadow diagonals, cinema-ticket stock, and warm violet.' },
  NYNJ: { code: 'NYNJ', timeZone: 'America/New_York', venueName: 'New York New Jersey Stadium', cityNote: 'Final-day ticker-tape energy, high contrast, gold, and night-city typography.', venueNote: 'The final host area gets the cleanest souvenir-card treatment.', localBite: 'Room snack idea: pizza slices, bagels, or deli sandwiches.', paperNote: 'Ticker tape, subway black, brass gold, dense editorial type, and night paper.' },
  MIA: { code: 'MIA', timeZone: 'America/New_York', venueName: 'Miami Stadium', cityNote: 'Tropical, bright, and ideal for late-match pub rooms.', venueNote: 'Warm-weather host feel with teal, coral, and sun-yellow accents.', localBite: 'Room snack idea: Cuban sandwiches or plantain chips.', paperNote: 'Deco curves, coral neon, teal water, palm cuts, and sun-bleached paper.' },
  ATL: { code: 'ATL', timeZone: 'America/New_York', venueName: 'Atlanta Stadium', cityNote: 'Southern host energy with a deep red, black, and gold editorial palette.', venueNote: 'A big indoor display-mode city for loud group votes.', localBite: 'Room snack idea: lemon pepper wings.', paperNote: 'Rail lines, peach-red ink, black type, gold highlights, and concert-poster texture.' },
  BOS: { code: 'BOS', timeZone: 'America/New_York', venueName: 'Boston Stadium', cityNote: 'Atlantic editorial treatment: serious, newspaper-like, and bracket-friendly.', venueNote: 'A northeast host stop with clean typography and cool neutrals.', localBite: 'Room snack idea: chowder cups or roast beef sandwiches.', paperNote: 'Harbor navy, brick red, old-map hatching, and academic editorial paper.' },
  DAL: { code: 'DAL', timeZone: 'America/Chicago', venueName: 'Dallas Stadium', cityNote: 'Scale, roofline, and big-screen watch-party drama.', venueNote: 'A huge central-time venue moment for office rooms.', localBite: 'Room snack idea: brisket sliders.', paperNote: 'Big-sky blue, metallic gold, star geometry, and oversized rodeo-poster stock.' },
  HOU: { code: 'HOU', timeZone: 'America/Chicago', venueName: 'Houston Stadium', cityNote: 'Gulf-coast colour with space-city sharpness and orange-blue contrast.', venueNote: 'Good for high-scoring banter prompts and late group-stage swings.', localBite: 'Room snack idea: Tex-Mex queso and chips.', paperNote: 'Space-grid lines, gulf blue, orange signal marks, and humid paper glow.' },
  KC: { code: 'KC', timeZone: 'America/Chicago', venueName: 'Kansas City Stadium', cityNote: 'Heartland weight, gold accents, and a strong pub-table food identity.', venueNote: 'Central-time city that makes timezone conversion matter for Europe and Asia.', localBite: 'Room snack idea: barbecue burnt ends.', paperNote: 'Burnt-end red, wheat gold, boulevard blocks, and sturdy letterpress paper.' },
  PHI: { code: 'PHI', timeZone: 'America/New_York', venueName: 'Philadelphia Stadium', cityNote: 'Atlantic city grit with teal-grey editorial tones.', venueNote: 'A strong room for rivalry-style prompts without official marks.', localBite: 'Room snack idea: cheesesteak trays.', paperNote: 'Rowhouse rhythm, river teal, steel grey, and rough broadsheet texture.' },
  SFBAY: { code: 'SFBAY', timeZone: 'America/Los_Angeles', venueName: 'San Francisco Bay Area Stadium', cityNote: 'Bay light, hills, and west-coast late kickoffs for European viewers.', venueNote: 'Pacific host city with a gold/red mountain treatment.', localBite: 'Room snack idea: sourdough and garlic fries.', paperNote: 'Fog bands, bay gold, bridge-red accents, hills, and soft risograph grain.' },
  SEA: { code: 'SEA', timeZone: 'America/Los_Angeles', venueName: 'Seattle Stadium', cityNote: 'Rain, sound, evergreen colour, and night-match intensity.', venueNote: 'Pacific northwest city palette with mountain motif.', localBite: 'Room snack idea: coffee, seafood bites, and game-night pastries.', paperNote: 'Evergreen rain, sound-wave lines, mountain blue, coffee ink, and matte paper.' },
};

export const OPENING_FIXTURE: Fixture = {
  id: 'match-001',
  matchNo: 1,
  stage: 'Group stage',
  group: 'A',
  kickoff: '2026-06-11T13:00:00-06:00',
  venue: 'Mexico City Stadium',
  cityCode: 'MEX-CITY',
  city: 'Mexico City',
  home: 'MEX',
  away: 'RSA',
};

export const FEATURED_FIXTURES: Fixture[] = [
  OPENING_FIXTURE,
  {
    id: 'match-002',
    matchNo: 2,
    stage: 'Group stage',
    group: 'A',
    kickoff: '2026-06-11T20:00:00-06:00',
    venue: 'Estadio Guadalajara',
    cityCode: 'GDL',
    city: 'Guadalajara',
    home: 'KOR',
    away: 'CZE',
  },
  {
    id: 'match-003',
    matchNo: 3,
    stage: 'Group stage',
    group: 'B',
    kickoff: '2026-06-12T15:00:00-04:00',
    venue: 'Toronto Stadium',
    cityCode: 'TOR',
    city: 'Toronto',
    home: 'CAN',
    away: 'BIH',
  },
  {
    id: 'match-004',
    matchNo: 4,
    stage: 'Group stage',
    group: 'D',
    kickoff: '2026-06-12T18:00:00-07:00',
    venue: 'Los Angeles Stadium',
    cityCode: 'LA',
    city: 'Los Angeles',
    home: 'USA',
    away: 'PAR',
  },
];

export const GROUPS: Record<string, [string, string, string, string]> = {
  A: ['MEX', 'RSA', 'KOR', 'CZE'],
  B: ['CAN', 'BIH', 'QAT', 'SUI'],
  C: ['BRA', 'MAR', 'HAI', 'SCO'],
  D: ['USA', 'PAR', 'AUS', 'TUR'],
  E: ['GER', 'CUW', 'CIV', 'ECU'],
  F: ['NED', 'JPN', 'SWE', 'TUN'],
  G: ['BEL', 'EGY', 'IRN', 'NZL'],
  H: ['ESP', 'CPV', 'KSA', 'URU'],
  I: ['FRA', 'SEN', 'IRQ', 'NOR'],
  J: ['ARG', 'ALG', 'AUT', 'JOR'],
  K: ['POR', 'COD', 'UZB', 'COL'],
  L: ['ENG', 'CRO', 'GHA', 'PAN'],
};

const GROUP_PAIRINGS: Array<[number, number]> = [[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2]];

export const GROUP_STAGE_FIXTURES: Fixture[] = buildGroupStageFixtures();
export const KNOCKOUT_FIXTURES: Fixture[] = buildKnockoutFixtures();
export const ALL_FIXTURES: Fixture[] = [...GROUP_STAGE_FIXTURES, ...KNOCKOUT_FIXTURES];

export function teamByCode(code: string): Team {
  const team = TEAMS.find((item) => item.code === code);
  if (!team) throw new Error(`Unknown team code: ${code}`);
  return team;
}

export function teamProfileByCode(code: string): TeamProfile {
  const profile = TEAM_PROFILES[code];
  if (!profile) throw new Error(`Unknown team profile: ${code}`);
  return profile;
}

export function fixtureTitle(fixture: Fixture): string {
  return `${fixtureTeamName(fixture.home)} v ${fixtureTeamName(fixture.away)}`;
}

export function fixtureTeamName(code: string): string {
  const team = TEAMS.find((item) => item.code === code);
  if (team) return team.name;
  const placeholder = /^(.*) (\d+) (home|away)$/.exec(code);
  if (!placeholder) return code;
  const [, stage, number, side] = placeholder;
  if (stage === 'Final') return side === 'home' ? 'Finalist A' : 'Finalist B';
  return `${stage} ${number} ${side === 'home' ? 'side A' : 'side B'}`;
}

export function hostCityByCode(code: string): HostCity {
  const fallback = HOST_CITIES[0];
  if (!fallback) throw new Error('No host cities configured');
  return HOST_CITIES.find((city) => city.code === code) ?? fallback;
}

export function hostCityProfileByCode(code: string): HostCityProfile {
  const profile = HOST_CITY_PROFILES[code] ?? HOST_CITY_PROFILES[hostCityByCode(code).code];
  if (!profile) throw new Error(`Unknown host city profile: ${code}`);
  return profile;
}

function hostCityAt(index: number): HostCity {
  const city = HOST_CITIES[index % HOST_CITIES.length];
  if (!city) throw new Error(`Unknown host city index: ${index}`);
  return city;
}

function buildGroupStageFixtures(): Fixture[] {
  const fixtures: Fixture[] = [...FEATURED_FIXTURES];
  let matchNo = fixtures.length + 1;
  const existingKeys = new Set(fixtures.map((fixture) => `${fixture.group}:${fixture.home}:${fixture.away}`));
  const start = Date.UTC(2026, 5, 13, 17, 0, 0);
  for (const [group, teams] of Object.entries(GROUPS)) {
    for (const [homeIndex, awayIndex] of GROUP_PAIRINGS) {
      const home = teams[homeIndex];
      const away = teams[awayIndex];
      if (!home || !away) throw new Error(`Bad group pairing for group ${group}`);
      const key = `${group}:${home}:${away}`;
      if (existingKeys.has(key)) continue;
      const city = hostCityAt(matchNo - 1);
      fixtures.push({
        id: `match-${String(matchNo).padStart(3, '0')}`,
        matchNo,
        stage: 'Group stage',
        group,
        kickoff: new Date(start + (matchNo - 5) * 7_200_000).toISOString(),
        venue: venueForCity(city.code),
        cityCode: city.code,
        city: city.name,
        home,
        away,
      });
      matchNo += 1;
    }
  }
  return fixtures.slice(0, 72);
}

function buildKnockoutFixtures(): Fixture[] {
  const stages: Array<{ stage: string; count: number }> = [
    { stage: 'Round of 32', count: 16 },
    { stage: 'Round of 16', count: 8 },
    { stage: 'Quarter-final', count: 4 },
    { stage: 'Semi-final', count: 2 },
    { stage: 'Third-place match', count: 1 },
    { stage: 'Final', count: 1 },
  ];
  const fixtures: Fixture[] = [];
  let matchNo = 73;
  let dayOffset = 22;
  for (const stage of stages) {
    for (let i = 0; i < stage.count; i += 1) {
      const city = stage.stage === 'Final'
        ? hostCityByCode('NYNJ')
        : hostCityAt(matchNo + i);
      fixtures.push({
        id: `match-${String(matchNo).padStart(3, '0')}`,
        matchNo,
        stage: stage.stage,
        group: '',
        kickoff: new Date(Date.UTC(2026, 5, 11 + dayOffset, 19 + (i % 3), 0, 0)).toISOString(),
        venue: venueForCity(city.code),
        cityCode: city.code,
        city: city.name,
        home: `${stage.stage} ${i + 1} home`,
        away: `${stage.stage} ${i + 1} away`,
      });
      matchNo += 1;
    }
    dayOffset += stage.stage === 'Round of 32' ? 4 : 3;
  }
  return fixtures;
}

function venueForCity(code: string): string {
  switch (code) {
    case 'MEX-CITY': return 'Mexico City Stadium';
    case 'GDL': return 'Estadio Guadalajara';
    case 'MTY': return 'Estadio Monterrey';
    case 'TOR': return 'Toronto Stadium';
    case 'VAN': return 'BC Place Vancouver';
    case 'LA': return 'Los Angeles Stadium';
    case 'NYNJ': return 'New York New Jersey Stadium';
    case 'SFBAY': return 'San Francisco Bay Area Stadium';
    default: return `${hostCityByCode(code).name} Stadium`;
  }
}
