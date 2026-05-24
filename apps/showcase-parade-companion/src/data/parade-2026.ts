export interface MapExtent {
  west: number;
  east: number;
  south: number;
  north: number;
  pxWidth: number;
  pxHeight: number;
}

export interface LngLat {
  lng: number;
  lat: number;
}

export interface RoutePackSource {
  label: string;
  url: string;
  note?: string;
}

export type RoutePoiKind =
  | 'station'
  | 'landmark'
  | 'medical'
  | 'exit'
  | 'toilet'
  | 'meeting'
  | 'stewards'
  // Practical "find a thing" categories for the POI library bake.
  // Food/pub kinds are accepted for future route packs, but v1 hides them
  // unless verified; "open now" travels through peer reports instead.
  | 'tube-exit'
  | 'water'
  | 'food'
  | 'pub'
  | 'atm'
  | 'family'
  | 'view';

export interface RoutePoi extends LngLat {
  id: string;
  kind: RoutePoiKind;
  name: string;
  note?: string;
}

export interface RouteBanterChant {
  id: string;
  title: string;
  cue: string;
  detail: string;
}

export interface RouteBanterTrivia {
  id: string;
  question: string;
  answerId: string;
  source: string;
  explainer: string;
  options: Array<{ id: string; label: string; detail?: string }>;
}

export interface RouteBanterPoll {
  id: string;
  question: string;
  options: Array<{ id: string; label: string }>;
  otherOptions?: Array<{ id: string; label: string }>;
}

export interface RouteBanter {
  chants: RouteBanterChant[];
  polls: RouteBanterPoll[];
  trivia?: RouteBanterTrivia[];
}

export interface RoutePack {
  schemaVersion: 1;
  packVersion: string;
  event: {
    title: string;
    dateLabel: string;
    startTime: string;
    status: 'route-tbd' | 'confirmed' | 'updated';
  };
  sources: RoutePackSource[];
  route: {
    type: 'LineString';
    coordinates: [number, number][];
    label: string;
    note?: string;
  };
  pois: RoutePoi[];
  closures: Array<{ label: string; note: string }>;
  transport: {
    stations: Array<{ name: string; status: 'open-check' | 'avoid' | 'closed' | 'unknown'; note: string }>;
    stepFreeRoutesOut: Array<{ label: string; via: string; note: string }>;
  };
  meetingLandmarks: Array<{ id: string; label: string; lng: number; lat: number; note?: string }>;
  safety: Array<{ heading: string; body: string }>;
  // Optional `lng`/`lat` on a schedule row places a numbered marker (①②③…)
  // on the route polyline at that position. Round-8 addition.
  scheduleEstimate: Array<{ label: string; time: string; note?: string; lng?: number; lat?: number }>;
  banter?: RouteBanter;
}

export const CORRIDOR_EXTENT: MapExtent = {
  west: -0.125,
  east: -0.085,
  south: 51.531,
  north: 51.566,
  pxWidth: 1800,
  pxHeight: 1800,
};

export const FALLBACK_ROUTE_PACK: RoutePack = {
  schemaVersion: 1,
  packVersion: '2026-05-24T20:30:00+01:00',
  event: {
    title: 'Parade Companion — Islington',
    dateLabel: 'Sunday 31 May 2026',
    startTime: '2026-05-31T14:00:00+01:00',
    status: 'route-tbd',
  },
  sources: [
    {
      label: 'Islington Council parade page',
      url: 'https://www.islington.gov.uk/Roads/Arsenal-Football-Club-parade',
      note: 'Official source for date, 14:00 start time, and route updates.',
    },
    {
      label: 'Islington possible route and closures map',
      url: 'https://www.islington.gov.uk/~/media/sharepoint-lists/public-records/transportandinfrastructure/publicity/publicconsultation/20252026/20260521arsenal-parade-possible-route-map-and-closures.pdf',
      note: 'Council PDF showing the possible route/closure corridor. Check again before travelling.',
    },
    {
      label: 'TfL travel updates',
      url: 'https://tfl.gov.uk/status-updates/',
      note: 'Use on Wi-Fi before travelling for final station and service changes.',
    },
  ],
  route: {
    type: 'LineString',
    label: 'Provisional parade corridor',
    note: 'Council possible-route corridor: stadium area, Drayton Park, Aubert Park, Highbury Grove, St Pauls Road, Upper Street, Town Hall area. Confirm before travel.',
    coordinates: [
      [-0.1086, 51.5549],
      [-0.1055, 51.5532],
      [-0.1028, 51.5525],
      [-0.1016, 51.5486],
      [-0.1027, 51.5461],
      [-0.1026, 51.5421],
    ],
  },
  pois: [
    {
      id: 'emirates',
      kind: 'landmark',
      name: 'Stadium area',
      lng: -0.1086,
      lat: 51.5549,
      note: 'Expected start area. Use official stewarding and road-closure guidance on the day.',
    },
    {
      id: 'drayton-park',
      kind: 'station',
      name: 'Drayton Park',
      lng: -0.1055,
      lat: 51.5532,
      note: 'Nearby rail station; check event access before relying on it.',
    },
    {
      id: 'highbury-fields',
      kind: 'exit',
      name: 'Highbury Fields',
      lng: -0.1027,
      lat: 51.5461,
      note: 'Open-space fallback landmark if the crowd gets tight.',
    },
    {
      id: 'town-hall',
      kind: 'landmark',
      name: 'Islington Town Hall area',
      lng: -0.1026,
      lat: 51.5421,
      note: 'Likely civic endpoint area. Confirm before travel.',
    },
    {
      id: 'highbury-islington',
      kind: 'station',
      name: 'Highbury & Islington',
      lng: -0.1031,
      lat: 51.546,
      note: 'Very busy. Have a walking fallback.',
    },
    {
      id: 'angel',
      kind: 'station',
      name: 'Angel',
      lng: -0.1058,
      lat: 51.5327,
      note: 'Useful southern exit if Upper Street is crowded.',
    },
    {
      id: 'medical-north',
      kind: 'medical',
      name: 'Ask steward for nearest first aid',
      lng: -0.1067,
      lat: 51.5519,
      note: 'Placeholder until official first-aid points are published.',
    },
    {
      id: 'stewards-upper',
      kind: 'stewards',
      name: 'Stewarded route area',
      lng: -0.1035,
      lat: 51.5445,
      note: 'Follow Met Police, steward and council directions over this offline pack.',
    },
  ],
  closures: [
    {
      label: 'Road closures',
      note: 'Closures are expected around the route. This offline pack will be updated as official details firm up.',
    },
    {
      label: 'Tube and rail access',
      note: 'Station entry may change at short notice for crowd control. Keep a walking fallback.',
    },
  ],
  transport: {
    stations: [
      { name: 'Arsenal', status: 'open-check', note: 'Closest to the start area; likely very busy.' },
      { name: 'Holloway Road', status: 'open-check', note: 'Check before travelling; event controls may change access.' },
      { name: 'Drayton Park', status: 'open-check', note: 'National Rail station near the stadium area.' },
      { name: 'Highbury & Islington', status: 'open-check', note: 'Major interchange; expect crowd-control queues.' },
      { name: 'Angel', status: 'open-check', note: 'Useful southern exit if Upper Street is busy.' },
    ],
    stepFreeRoutesOut: [
      {
        label: 'Southbound fallback',
        via: 'Upper Street toward Angel',
        note: 'Use if northern stations are blocked or crowded.',
      },
      {
        label: 'North/east fallback',
        via: 'Highbury Fields, then quieter side streets',
        note: 'Avoid forcing through dense crowds to reach a closed station.',
      },
    ],
  },
  meetingLandmarks: [
    { id: 'stadium-clock-end', label: 'Stadium area', lng: -0.1086, lat: 51.5549 },
    { id: 'drayton-park', label: 'Drayton Park station area', lng: -0.1055, lat: 51.5532 },
    { id: 'highbury-fields', label: 'Highbury Fields edge', lng: -0.1027, lat: 51.5461 },
    { id: 'town-hall', label: 'Town Hall area', lng: -0.1026, lat: 51.5421 },
    { id: 'angel', label: 'Angel station area', lng: -0.1058, lat: 51.5327 },
  ],
  safety: [
    {
      heading: 'If the crowd stops moving',
      body: 'Stay upright, keep arms in front of your chest, and move diagonally with the flow rather than pushing against it.',
    },
    {
      heading: 'If you lose your group',
      body: 'Do not fight back through the densest area. Go to your fallback point at the agreed time.',
    },
    {
      heading: 'If signal dies',
      body: 'Airplane mode is fine, but keep Location Services on. Your GPS dot can still work without internet.',
    },
    {
      heading: 'If you need help',
      body: 'Show the My location card to a steward. It has your coordinates, accuracy radius, and nearest landmark.',
    },
  ],
  scheduleEstimate: [
    { label: 'Parade starts at the stadium area', time: '14:00', note: 'Official start time.', lng: -0.1086, lat: 51.5549 },
    { label: 'Expected movement along the corridor', time: '14:20-15:15', note: 'Estimated, not live.', lng: -0.1027, lat: 51.5461 },
    { label: 'Crowds disperse toward stations and side streets', time: '15:30+', note: 'Leave extra time.', lng: -0.1026, lat: 51.5421 },
  ],
  banter: {
    chants: [
      {
        id: 'north-london-forever',
        title: 'North London Forever',
        cue: 'North London forever / whatever the weather',
        detail: 'Start: "North London forever".\nSlow anthem, scarves up, let the chorus breathe.\nBest moment: bus in sight, crowd already singing.',
      },
      {
        id: 'one-nil',
        title: 'One-nil to The Arsenal',
        cue: 'One-nil to The Arsenal',
        detail: 'Start: "One-nil".\nShort, old-school, repeatable.\nUse after someone mentions clean sheets, Raya, Gabriel, or Saliba.',
      },
      {
        id: 'forty-nine',
        title: '49 undefeated',
        cue: '49, 49 undefeated',
        detail: 'Start: "49".\nKeep it punchy: call, clap, repeat.\nA history flex for the queue, the pub, or any Spurs-adjacent banter.',
      },
      {
        id: 'till-i-die',
        title: 'Arsenal till I die',
        cue: 'Arsenal till I die',
        detail: 'Start: "Arsenal".\nSimple loyalty chant.\nGood when the crowd needs one everyone can join without checking words.',
      },
      {
        id: 'greatest-team',
        title: 'Greatest team',
        cue: "We're by far the greatest team",
        detail: 'Start: "by far".\nBig grin energy, no subtlety.\nRepeat twice, clap on the gaps, keep it clean around families.',
      },
      {
        id: 'oh-to-be',
        title: 'Oh to be a Gooner',
        cue: 'Oh to be a Gooner',
        detail: 'Start: "Oh to be".\nFast chant, easy lift.\nWorks while walking between stations or waiting for the next bus glimpse.',
      },
      {
        id: 'allez',
        title: 'Allez Allez Allez',
        cue: 'Allez, allez, allez',
        detail: 'Start: "Allez".\nEuropean-night rhythm.\nUse as a rolling chant when the street is moving and people can clap along.',
      },
      {
        id: 'set-piece',
        title: 'Set-piece again',
        cue: 'Set-piece again, ole ole',
        detail: 'Start: "Set-piece".\nFor the corner-kick era and Gabriel chaos.\nShort enough to use as a joke every time someone points at a lamp post.',
      },
      {
        id: 'we-love-you',
        title: 'We love you Arsenal',
        cue: 'We love you Arsenal, we do',
        detail: 'Start: "We love you".\nWarm, family-safe, simple.\nBest when the bus slows or players wave directly at your section.',
      },
      {
        id: 'north-bank-clock-end',
        title: 'North Bank / Clock End',
        cue: "We're the North Bank, Highbury",
        detail: 'Start: "North Bank".\nOld-ground call-and-response.\nLet one side answer the other if the street splits naturally.',
      },
      {
        id: 'come-on-you-reds',
        title: 'Come on you reds',
        cue: 'Come on you reds',
        detail: 'Start: "Come on".\nThe emergency chant: no setup, no memory test.\nUse when something needs to start right now.',
      },
      {
        id: 'up-the-arsenal',
        title: 'Up the Arsenal',
        cue: 'Up The Arsenal',
        detail: 'Start: "Up".\nTiny phrase, massive usefulness.\nA quick shout after a tap, photo, wave, or group reunion.',
      },
      {
        id: 'saliba',
        title: 'Saliba',
        cue: 'Da da da da da, Saliba',
        detail: 'Start: rhythm first, then "Saliba".\nDefender chant, arms up, bouncing optional.\nKeep the beat more than the words.',
      },
      {
        id: 'rice-rice-baby',
        title: 'Rice Rice Baby',
        cue: 'Rice, Rice, Baby',
        detail: 'Start: "Rice".\nMidfield engine chant.\nBest after trivia, player vote, or any mention of running forever.',
      },
      {
        id: 'bukayo-saka',
        title: 'Bukayo Saka',
        cue: 'Bukayo, Saka',
        detail: 'Start: "Bukayo".\nKeep it bright and clean.\nShort player chant for families, kids, and shirts with number 7 everywhere.',
      },
      {
        id: 'odegaard-oi',
        title: 'Odegaard Oi Oi',
        cue: 'Martin Odegaard, oi oi oi',
        detail: 'Start: "Martin".\nCaptain chant, clipped rhythm.\nGood for a quick lift without turning the whole street into a mosh pit.',
      },
      {
        id: 'super-mik',
        title: 'Super Mik Arteta',
        cue: "We've got Super Mik Arteta",
        detail: 'Start: "Super Mik".\nManager appreciation, loud but tidy.\nUse after season-moment votes or when someone starts talking tactics.',
      },
      {
        id: 'kai-havertz',
        title: 'Kai Havertz scores again',
        cue: 'Kai Havertz scores again',
        detail: 'Start: "Kai".\nForward chant with a wink.\nGood when the crowd is playful and someone wants a proper terrace bit.',
      },
      {
        id: 'his-name-is-gabi',
        title: 'His name is Gabi',
        cue: 'His name is Gabi',
        detail: 'Start: "Gabi".\nUse for Gabriel, Martinelli, or general Gabi confusion.\nIf in doubt: point at the shirt and laugh.',
      },
      {
        id: 'trossard-again',
        title: 'Trossard again',
        cue: 'Trossard again, ole ole',
        detail: 'Start: "Trossard".\nSuper-sub energy, quick repeat.\nSave it for the person who brought snacks out of nowhere.',
      },
    ],
    polls: [
      {
        id: 'player-of-season',
        question: 'Player of the season',
        options: [
          { id: 'saka', label: 'Saka' },
          { id: 'rice', label: 'Rice' },
          { id: 'saliba', label: 'Saliba' },
          { id: 'odegaard', label: 'Odegaard' },
          { id: 'raya', label: 'Raya' },
          { id: 'gabriel', label: 'Gabriel' },
          { id: 'other', label: 'Other' },
        ],
        otherOptions: [
          { id: 'martinelli', label: 'Martinelli' },
          { id: 'havertz', label: 'Havertz' },
          { id: 'trossard', label: 'Trossard' },
          { id: 'timber', label: 'Timber' },
          { id: 'white', label: 'White' },
          { id: 'calafiori', label: 'Calafiori' },
          { id: 'merino', label: 'Merino' },
          { id: 'jesus', label: 'Gabriel Jesus' },
          { id: 'zinchenko', label: 'Zinchenko' },
          { id: 'kiwior', label: 'Kiwior' },
          { id: 'lewis-skelly', label: 'Myles Lewis-Skelly' },
          { id: 'zubimendi', label: 'Zubimendi' },
          { id: 'norgaard', label: 'Norgaard' },
          { id: 'fabio-vieira', label: 'Fabio Vieira' },
          { id: 'reiss-nelson', label: 'Reiss Nelson' },
          { id: 'kepa', label: 'Kepa' },
          { id: 'karl-hein', label: 'Karl Hein' },
          { id: 'nwaneri', label: 'Ethan Nwaneri' },
          { id: 'lokonga', label: 'Lokonga' },
        ],
      },
      {
        id: 'moment-of-season',
        question: 'Moment of the season',
        options: [
          { id: 'title-confirmed', label: 'Title confirmed' },
          { id: 'derby-day', label: 'Derby day' },
          { id: 'late-winner', label: 'Late winner' },
          { id: 'clean-sheet-run', label: 'Clean sheet run' },
          { id: 'other', label: 'Other' },
        ],
      },
      {
        id: 'after-parade',
        question: 'After the parade',
        options: [
          { id: 'pub', label: 'Pub' },
          { id: 'park', label: 'Park' },
          { id: 'food', label: 'Food' },
          { id: 'home', label: 'Home' },
          { id: 'deciding', label: 'Still deciding' },
        ],
      },
    ],
    trivia: [
      {
        id: 'minutes-monster',
        question: 'Who felt like the season workload monster?',
        answerId: 'rice',
        source: 'Season stats pack',
        explainer: 'Rice was the obvious all-action answer in midfield: starts, minutes, set pieces, duels, everything.',
        options: [
          { id: 'rice', label: 'Declan Rice', detail: 'Midfield engine' },
          { id: 'odegaard', label: 'Martin Odegaard', detail: 'Captain hub' },
          { id: 'saka', label: 'Bukayo Saka', detail: 'Right-side threat' },
          { id: 'havertz', label: 'Kai Havertz', detail: 'Forward graft' },
        ],
      },
      {
        id: 'pass-accuracy',
        question: 'Who is the safest pass-accuracy shout?',
        answerId: 'saliba',
        source: 'Season stats pack',
        explainer: 'Saliba is the calm centre-back answer: short exits, switches, and pressure-proof recycling.',
        options: [
          { id: 'saliba', label: 'William Saliba', detail: 'Calm distributor' },
          { id: 'gabriel', label: 'Gabriel', detail: 'Left-sided outlet' },
          { id: 'partey', label: 'Thomas Partey', detail: 'Midfield passer' },
          { id: 'raya', label: 'David Raya', detail: 'Keeper build-up' },
        ],
      },
      {
        id: 'clean-sheet-core',
        question: 'Who anchors the clean-sheet story?',
        answerId: 'raya',
        source: 'Season reports',
        explainer: 'Raya is the keeper answer, with Gabriel and Saliba doing the heavy defensive lifting in front.',
        options: [
          { id: 'raya', label: 'David Raya', detail: 'Keeper platform' },
          { id: 'saka', label: 'Bukayo Saka', detail: 'Right-wing spark' },
          { id: 'merino', label: 'Mikel Merino', detail: 'Midfield depth' },
          { id: 'trossard', label: 'Leandro Trossard', detail: 'Late-game threat' },
        ],
      },
      {
        id: 'set-piece-menace',
        question: 'Who is the set-piece menace?',
        answerId: 'gabriel',
        source: 'Season reports',
        explainer: 'Gabriel is the obvious box-crashing pick: corners, blocks, headers, panic.',
        options: [
          { id: 'gabriel', label: 'Gabriel', detail: 'Corner chaos' },
          { id: 'white', label: 'Ben White', detail: 'Near-post nuisance' },
          { id: 'timber', label: 'Jurrien Timber', detail: 'Duel machine' },
          { id: 'jesus', label: 'Gabriel Jesus', detail: 'Pressing forward' },
        ],
      },
      {
        id: 'captain-creator',
        question: 'Who is the captain-creator hub?',
        answerId: 'odegaard',
        source: 'Season reports',
        explainer: 'Odegaard is the organiser answer: press trigger, right-half-space passing, captain energy.',
        options: [
          { id: 'odegaard', label: 'Martin Odegaard', detail: 'Captain' },
          { id: 'rice', label: 'Declan Rice', detail: 'Runner' },
          { id: 'saka', label: 'Bukayo Saka', detail: 'Final-third threat' },
          { id: 'timber', label: 'Jurrien Timber', detail: 'Full-back power' },
        ],
      },
      {
        id: 'academy-spark',
        question: 'Which young player gets the academy spark card?',
        answerId: 'nwaneri',
        source: 'Season reports',
        explainer: 'Nwaneri is the local excitement answer: young, brave, and instantly chantable.',
        options: [
          { id: 'nwaneri', label: 'Ethan Nwaneri', detail: 'Academy spark' },
          { id: 'raya', label: 'David Raya', detail: 'Keeper' },
          { id: 'jorginho', label: 'Jorginho', detail: 'Veteran tempo' },
          { id: 'zinchenko', label: 'Zinchenko', detail: 'Inverted full-back' },
        ],
      },
    ],
  },
};
