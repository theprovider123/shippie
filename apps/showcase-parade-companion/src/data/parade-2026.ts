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

export type RouteRestrictedZoneKind = 'no-pedestrian' | 'no-view' | 'closed-road';

export interface RouteRestrictedZone {
  id: string;
  kind: RouteRestrictedZoneKind;
  label: string;
  note: string;
  coordinates: [number, number][];
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
  answerId?: string;
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
  /**
   * Bounding-box + canvas projection for this pack. Round 10 lifted this
   * from a single global constant so the app can host multiple corridors
   * (arsenal-islington / watford-vicarage) via
   * `?pack=…` without code edits.
   */
  mapExtent: MapExtent;
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
  restrictedZones?: RouteRestrictedZone[];
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

const OFFICIAL_ROUTE_COORDINATES: [number, number][] = [
  [-0.1141, 51.5529],
  [-0.1220, 51.5549],
  [-0.1191, 51.5575],
  [-0.1124, 51.5594],
  [-0.1053, 51.5613],
  [-0.1004, 51.5638],
  [-0.0978, 51.5610],
  [-0.0957, 51.5576],
  [-0.0911, 51.5564],
  [-0.0875, 51.5549],
  [-0.0866, 51.5518],
  [-0.0868, 51.5488],
  [-0.0875, 51.5459],
  [-0.0878, 51.5421],
  [-0.0877, 51.5403],
  [-0.0905, 51.5385],
  [-0.0947, 51.5362],
  [-0.0994, 51.5342],
  [-0.1034, 51.5317],
  [-0.1054, 51.5354],
  [-0.1048, 51.5392],
  [-0.1037, 51.5431],
  [-0.1027, 51.5461],
  [-0.1090, 51.5461],
  [-0.1158, 51.5488],
  [-0.1141, 51.5529],
];

const OFFICIAL_RESTRICTED_ZONES: RouteRestrictedZone[] = [
  {
    id: 'stadium-drayton-no-public-access',
    kind: 'no-pedestrian',
    label: 'No public access',
    note: 'Official guidance: Emirates Stadium, Drayton Park and surrounding roads are closed and not accessible to the public.',
    coordinates: [
      [-0.1122, 51.5565],
      [-0.1056, 51.5564],
      [-0.1029, 51.5538],
      [-0.1046, 51.5502],
      [-0.1103, 51.5497],
      [-0.1130, 51.5527],
    ],
  },
  {
    id: 'hornsey-benwell-no-view',
    kind: 'no-view',
    label: 'Do not wait here',
    note: 'Supporters are encouraged not to congregate around Hornsey Road, Benwell Road or Drayton Park; you will not see the teams from these locations.',
    coordinates: [
      [-0.1185, 51.5571],
      [-0.1112, 51.5566],
      [-0.1105, 51.5539],
      [-0.1161, 51.5530],
    ],
  },
];

export const FALLBACK_ROUTE_PACK: RoutePack = {
  schemaVersion: 1,
  packVersion: '2026-05-28T10:00:00+01:00',
  mapExtent: CORRIDOR_EXTENT,
  event: {
    title: 'Parade Companion — Islington',
    dateLabel: 'Sunday 31 May 2026',
    startTime: '2026-05-31T14:00:00+01:00',
    status: 'confirmed',
  },
  sources: [
    {
      label: 'Arsenal official parade details',
      url: 'https://www.arsenal.com/news/champions-parade-what-you-need-know',
      note: 'Official club article: start time, convoy format, route advice, travel and safety guidance.',
    },
    {
      label: 'Champions Parade map',
      url: 'https://www.arsenal.com/news/champions-parade-what-you-need-know',
      note: 'Official route map published with the Arsenal parade article on 27 May 2026.',
    },
    {
      label: 'Arsenal parade FAQs',
      url: 'https://help.arsenal.com/support/solutions/articles/101000584937-parade',
      note: 'Official FAQ for station restrictions, prohibited items, toilets and safety advice.',
    },
    {
      label: 'TfL travel updates',
      url: 'https://tfl.gov.uk/status-updates/',
      note: 'Use on Wi-Fi before travelling for final station and service changes.',
    },
  ],
  route: {
    type: 'LineString',
    label: 'Official Champions Parade route',
    note: 'Confirmed outer route from Arsenal: Holloway Road, Seven Sisters Road, Blackstock Road, Mountgrove Road, Green Lanes, Petherton Road, Beresford Road, Newington Green Road, Essex Road, Upper Street and Highbury Corner.',
    coordinates: OFFICIAL_ROUTE_COORDINATES,
  },
  restrictedZones: OFFICIAL_RESTRICTED_ZONES,
  pois: [
    {
      id: 'emirates',
      kind: 'landmark',
      name: 'Emirates Stadium',
      lng: -0.1086,
      lat: 51.5549,
      note: 'Closed to the public during the parade. Do not gather here expecting a view.',
    },
    {
      id: 'stadium-no-view',
      kind: 'view',
      name: 'No-view stadium zone',
      lng: -0.1072,
      lat: 51.5533,
      note: 'Official guidance says you will not see the teams around Emirates Stadium, Hornsey Road, Benwell Road or Drayton Park.',
    },
    {
      id: 'holloway-road-public-route',
      kind: 'landmark',
      name: 'Holloway Road route',
      lng: -0.1186,
      lat: 51.5539,
      note: 'Western/north-western public route section. Spread out and follow steward directions.',
    },
    {
      id: 'seven-sisters-route',
      kind: 'landmark',
      name: 'Seven Sisters Road route',
      lng: -0.1123,
      lat: 51.5593,
      note: 'Public route section on the northern arc.',
    },
    {
      id: 'blackstock-route',
      kind: 'landmark',
      name: 'Blackstock Road route',
      lng: -0.0982,
      lat: 51.5608,
      note: 'North-east route section near Finsbury Park connections.',
    },
    {
      id: 'green-lanes-route',
      kind: 'landmark',
      name: 'Green Lanes route',
      lng: -0.0870,
      lat: 51.5523,
      note: 'Eastern route section. Good place to spread out if Upper Street is packed.',
    },
    {
      id: 'newington-green-route',
      kind: 'landmark',
      name: 'Newington Green route',
      lng: -0.0887,
      lat: 51.5395,
      note: 'South-eastern route section before Essex Road.',
    },
    {
      id: 'essex-road-route',
      kind: 'landmark',
      name: 'Essex Road route',
      lng: -0.0972,
      lat: 51.5354,
      note: 'Southern route section heading back toward Upper Street.',
    },
    {
      id: 'highbury-corner-route',
      kind: 'landmark',
      name: 'Highbury Corner route',
      lng: -0.1028,
      lat: 51.5461,
      note: 'Crowd-control pinch point. Keep exits and side streets in mind.',
    },
    {
      id: 'drayton-park',
      kind: 'station',
      name: 'Drayton Park',
      lng: -0.1055,
      lat: 51.5532,
      note: 'Closed for the parade. Do not plan to use this station.',
    },
    {
      id: 'holloway-road-station',
      kind: 'station',
      name: 'Holloway Road',
      lng: -0.1127,
      lat: 51.5527,
      note: 'Closed for the parade. Use alternatives and check TfL before travel.',
    },
    {
      id: 'highbury-islington',
      kind: 'station',
      name: 'Highbury & Islington',
      lng: -0.1031,
      lat: 51.546,
      note: 'Restricted: Victoria line non-stopping; Overground exit-only and unavailable after the parade. Not step-free.',
    },
    {
      id: 'canonbury-station',
      kind: 'station',
      name: 'Canonbury',
      lng: -0.0924,
      lat: 51.5480,
      note: 'Exit-only during the event and unavailable after the parade. Expect queues.',
    },
    {
      id: 'essex-road-station',
      kind: 'station',
      name: 'Essex Road',
      lng: -0.0936,
      lat: 51.5406,
      note: 'Closed for the parade.',
    },
    {
      id: 'finsbury-park',
      kind: 'station',
      name: 'Finsbury Park',
      lng: -0.1056,
      lat: 51.5645,
      note: 'Recommended step-free option north of the route. Expect it to be busy.',
    },
    {
      id: 'highbury-fields',
      kind: 'family',
      name: 'Highbury Fields',
      lng: -0.1027,
      lat: 51.5461,
      note: 'Open-space fallback landmark. Good place to recompose if the crowd feels tight.',
    },
    {
      id: 'town-hall',
      kind: 'landmark',
      name: 'Islington Town Hall area',
      lng: -0.1026,
      lat: 51.5421,
      note: 'Useful Upper Street landmark, not the only place to stand.',
    },
    {
      id: 'angel',
      kind: 'station',
      name: 'Angel',
      lng: -0.1058,
      lat: 51.5327,
      note: 'Alternative southern station. Walk away from the immediate route before joining queues.',
    },
    {
      id: 'kings-cross',
      kind: 'station',
      name: 'King’s Cross St Pancras',
      lng: -0.1233,
      lat: 51.5316,
      note: 'Larger onward interchange outside the immediate parade pinch points.',
    },
    {
      id: 'medical-north',
      kind: 'medical',
      name: 'Ask steward for nearest first aid',
      lng: -0.1180,
      lat: 51.5542,
      note: 'Official first-aid points will be signposted. Ask stewards; call 999 in an emergency.',
    },
    {
      id: 'medical-south',
      kind: 'medical',
      name: 'Ask steward for nearest first aid',
      lng: -0.1007,
      lat: 51.5351,
      note: 'Official first-aid points will be signposted. Ask stewards; call 999 in an emergency.',
    },
    {
      id: 'stewards-upper',
      kind: 'stewards',
      name: 'Stewarded route area',
      lng: -0.1035,
      lat: 51.5445,
      note: 'Follow Met Police, steward and council directions over this offline pack.',
    },
    {
      id: 'toilet-highbury-fields',
      kind: 'toilet',
      name: 'WC nearby',
      lng: -0.1026,
      lat: 51.5464,
      note: 'Community-reported/nearby option. Arsenal FAQ says there are no official toilets along the route.',
    },
    {
      id: 'toilet-islington-green',
      kind: 'toilet',
      name: 'WC nearby',
      lng: -0.1050,
      lat: 51.5378,
      note: 'Community-reported/nearby option. Check locally before relying on it.',
    },
    {
      id: 'water-highbury-fields',
      kind: 'water',
      name: 'Water refill nearby',
      lng: -0.1028,
      lat: 51.5456,
      note: 'Bring your own water. This is a nearby helper point, not an official parade service.',
    },
    {
      id: 'atm-highbury-corner',
      kind: 'atm',
      name: 'Cashpoint nearby',
      lng: -0.1044,
      lat: 51.5463,
      note: 'May be busy or unavailable. Carry essentials before travelling.',
    },
    {
      id: 'atm-angel',
      kind: 'atm',
      name: 'Cashpoint nearby',
      lng: -0.1059,
      lat: 51.5329,
      note: 'May be busy or unavailable. Carry essentials before travelling.',
    },
    {
      id: 'family-newington-green',
      kind: 'family',
      name: 'Newington Green edge',
      lng: -0.0879,
      lat: 51.5405,
      note: 'Wider-feeling edge of the route. Still follow steward instructions.',
    },
  ],
  closures: [
    {
      label: 'Road closures 04:00-20:00+',
      note: 'Road closures and parking suspensions are expected from about 04:00 on Sunday 31 May until about 20:00 or later if needed for safety.',
    },
    {
      label: 'No public access around stadium',
      note: 'Emirates Stadium, Drayton Park and surrounding roads will be closed and not accessible to the public during the parade.',
    },
    {
      label: 'Do not wait in no-view streets',
      note: 'Official guidance asks supporters not to congregate around the stadium area, Hornsey Road, Benwell Road or Drayton Park because you will not see the teams there.',
    },
    {
      label: 'No parking on route and side roads',
      note: 'Cars left on the route or side roads leading to it from 04:00 may be removed.',
    },
    {
      label: 'Public transport disruption',
      note: 'Expect station restrictions, queues, non-stopping trains, closed stations and bus diversions. Check TfL and National Rail before travelling.',
    },
  ],
  transport: {
    stations: [
      { name: 'Holloway Road', status: 'closed', note: 'Closed for the parade.' },
      { name: 'Drayton Park', status: 'closed', note: 'Closed for the parade.' },
      { name: 'Essex Road', status: 'closed', note: 'Closed for the parade.' },
      { name: 'Highbury & Islington', status: 'avoid', note: 'Victoria line non-stopping; Overground exit-only and unavailable after the parade. Not step-free.' },
      { name: 'Canonbury', status: 'avoid', note: 'Exit-only during the event and unavailable after the parade.' },
      { name: 'Finsbury Park', status: 'open-check', note: 'Recommended step-free alternative. Expect heavy demand.' },
      { name: 'Angel', status: 'open-check', note: 'Southern alternative. Walk away from the immediate route before joining queues.' },
      { name: 'King’s Cross St Pancras', status: 'open-check', note: 'Larger onward interchange outside the route. Expect queues.' },
    ],
    stepFreeRoutesOut: [
      {
        label: 'North step-free fallback',
        via: 'Finsbury Park',
        note: 'Recommended official alternative for step-free access north of the route.',
      },
      {
        label: 'Southbound fallback',
        via: 'Upper Street toward Angel or King’s Cross',
        note: 'Walk away from the immediate route if Highbury & Islington or Canonbury are restricted.',
      },
    ],
  },
  meetingLandmarks: [
    { id: 'holloway-seven-sisters', label: 'Holloway / Seven Sisters', lng: -0.1187, lat: 51.5562 },
    { id: 'blackstock-route', label: 'Blackstock Road', lng: -0.0982, lat: 51.5608 },
    { id: 'green-lanes-route', label: 'Green Lanes', lng: -0.0868, lat: 51.5518 },
    { id: 'newington-green-route', label: 'Newington Green', lng: -0.0879, lat: 51.5403 },
    { id: 'highbury-fields', label: 'Highbury Fields edge', lng: -0.1027, lat: 51.5461 },
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
    {
      heading: 'If you are near the stadium',
      body: 'Move to the public route. Emirates Stadium, Drayton Park and surrounding roads are closed and not accessible to the public.',
    },
    {
      heading: 'What not to bring',
      body: 'Do not bring flares, fireworks, pyrotechnics, drones, glass, tents, stools, folding chairs, BBQs or camping equipment.',
    },
    {
      heading: 'Toilets and first aid',
      body: 'Arsenal says there are no official toilets along the route. First aid points will be signposted; ask stewards for the nearest one.',
    },
  ],
  scheduleEstimate: [
    { label: 'Champions truck and four buses start moving', time: '14:00', note: 'Official start time. The convoy keeps moving and does not stop.', lng: -0.1141, lat: 51.5529 },
    { label: 'North arc: Holloway / Seven Sisters / Blackstock', time: '14:20+', note: 'Estimated, not live. Spread out across the route.', lng: -0.1045, lat: 51.5614 },
    { label: 'East and south arc: Green Lanes / Essex Road', time: '15:00+', note: 'Estimated, not live. Watch crowd flow and steward instructions.', lng: -0.0877, lat: 51.5421 },
    { label: 'Upper Street / Highbury Corner and dispersal', time: '15:45+', note: 'Travel network may stay restricted after the parade.', lng: -0.1037, lat: 51.5431 },
  ],
  banter: {
    chants: [
      {
        id: 'north-london-forever',
        title: 'North London Forever',
        cue: 'Anthem',
        detail: '"North London forever..." · "Whatever the weather..."',
      },
      {
        id: 'good-old-arsenal',
        title: 'Good Old Arsenal',
        cue: 'Classic',
        detail: '"Good old Arsenal..." · "We\'re proud to say..."',
      },
      {
        id: 'one-nil',
        title: 'One-nil to The Arsenal',
        cue: 'Defensive classic',
        detail: '"One-nil to The Arsenal..."',
      },
      {
        id: 'forty-nine',
        title: '49 Undefeated',
        cue: 'Invincibles',
        detail: '"Forty-nine, forty-nine undefeated..."',
      },
      {
        id: 'till-i-die',
        title: 'Arsenal Till I Die',
        cue: 'Loyalty',
        detail: '"Arsenal till I die..."',
      },
      {
        id: 'greatest-team',
        title: 'By Far The Greatest Team',
        cue: 'Terrace classic',
        detail: '"By far the greatest team..."',
      },
      {
        id: 'oh-to-be',
        title: 'Oh To Be A Gooner',
        cue: 'Joy chant',
        detail: '"Oh to be a Gooner..."',
      },
      {
        id: 'come-on-you-reds',
        title: 'Come On You Reds',
        cue: 'Quick roar',
        detail: '"Come on you Reds..."',
      },
      {
        id: 'up-the-arsenal',
        title: 'Up The Arsenal',
        cue: 'Terrace staple',
        detail: '"Up The Arsenal..."',
      },
      {
        id: 'we-love-you',
        title: 'We Love You Arsenal',
        cue: 'Call-and-response',
        detail: '"We love you Arsenal..."',
      },
      {
        id: 'north-bank-clock-end',
        title: 'North Bank / Clock End',
        cue: 'Highbury heritage',
        detail: '"North Bank..." · "Clock End..."',
      },
      {
        id: 'yellow-ribbon',
        title: 'She Wore A Yellow Ribbon',
        cue: 'Cup-day classic',
        detail: '"She wore a yellow ribbon..."',
      },
      {
        id: 'super-mik',
        title: 'Super Mik Arteta',
        cue: 'Manager chant',
        detail: '"Super Mik Arteta..."',
      },
      {
        id: 'saliba',
        title: 'Saliba',
        cue: 'Centre-back',
        detail: '"Saliba..." · then the bounce',
      },
      {
        id: 'rice-rice-baby',
        title: 'Rice Rice Baby',
        cue: 'Midfield',
        detail: '"Rice, Rice Baby..."',
      },
      {
        id: 'bukayo-saka',
        title: 'Bukayo Saka',
        cue: 'Starboy',
        detail: '"Bukayo Saka..." · "Starboy..."',
      },
      {
        id: 'odegaard-oi',
        title: 'Martin Odegaard',
        cue: 'Captain',
        detail: '"Martin Odegaard..." · captain rhythm',
      },
      {
        id: 'kai-havertz',
        title: 'Kai Havertz scores again',
        cue: 'Forward',
        detail: '"Kai Havertz scores again..."',
      },
      {
        id: 'gabi-martinelli',
        title: 'Gabriel Martinelli',
        cue: 'Left wing',
        detail: '"Gabriel Martinelli..."',
      },
      {
        id: 'trossard-again',
        title: 'Trossard again',
        cue: 'Clutch finisher',
        detail: '"Trossard again..."',
      },
    ],
    polls: [
      {
        id: 'parade-mood',
        question: 'What is the parade feeling like?',
        options: [
          { id: 'limbs', label: 'Limbs' },
          { id: 'bus-watch', label: 'Convoy watch' },
          { id: 'singing', label: 'Singing' },
          { id: 'packed', label: 'Packed' },
          { id: 'pub-later', label: 'Pub later' },
          { id: 'emotional', label: 'Emotional' },
        ],
      },
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
          { id: 'eze', label: 'Eze' },
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
          { id: 'dowman', label: 'Max Dowman' },
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
          { id: 'west-ham-var', label: 'West Ham VAR decision' },
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
        question: 'Who carried the title run when legs were gone?',
        source: 'Fan debate card',
        explainer: 'No official answer — this is the one to argue in the queue, not a stat exam.',
        options: [
          { id: 'rice', label: 'Declan Rice', detail: 'Engine room' },
          { id: 'saka', label: 'Bukayo Saka', detail: 'Right-side burden' },
          { id: 'odegaard', label: 'Martin Odegaard', detail: 'Captain rhythm' },
          { id: 'saliba', label: 'William Saliba', detail: 'Calm base' },
          { id: 'gabriel', label: 'Gabriel', detail: 'Box dominance' },
          { id: 'raya', label: 'David Raya', detail: 'Back-line nerve' },
        ],
      },
      {
        id: 'replay-moment',
        question: 'Which moment are you still replaying?',
        source: 'Fan debate card',
        explainer: 'Your pick saves locally. The point is the conversation when someone next to you disagrees.',
        options: [
          { id: 'dowman-everton', label: 'Dowman at Everton', detail: 'The kid moment' },
          { id: 'eze-goal', label: 'Eze goal', detail: 'Pure limbs' },
          { id: 'city-bournemouth', label: 'Bournemouth hold City', detail: 'Title-race swing' },
          { id: 'west-ham-var', label: 'West Ham VAR', detail: 'The wait, then noise' },
          { id: 'derby-day', label: 'Derby day', detail: 'North London tax' },
          { id: 'title-whistle', label: 'Title whistle', detail: 'Release valve' },
        ],
      },
      {
        id: 'clean-sheet-core',
        question: 'Who gave the back line its aura?',
        source: 'Fan debate card',
        explainer: 'No wrong answer — keeper calm, centre-back dominance, full-back bite and midfield cover all count.',
        options: [
          { id: 'raya', label: 'David Raya', detail: 'Keeper platform' },
          { id: 'saliba', label: 'William Saliba', detail: 'Rolls-Royce calm' },
          { id: 'gabriel', label: 'Gabriel', detail: 'Duel monster' },
          { id: 'timber', label: 'Jurrien Timber', detail: 'Full-back bite' },
          { id: 'white', label: 'Ben White', detail: 'Dark arts' },
          { id: 'rice', label: 'Declan Rice', detail: 'Screening work' },
        ],
      },
      {
        id: 'set-piece-menace',
        question: 'Who is the set-piece menace?',
        source: 'Fan debate card',
        explainer: 'Goal threat, blocks, screens, delivery, keeper traffic — choose your favourite chaos merchant.',
        options: [
          { id: 'gabriel', label: 'Gabriel', detail: 'Corner chaos' },
          { id: 'saliba', label: 'William Saliba', detail: 'Far-post threat' },
          { id: 'white', label: 'Ben White', detail: 'Keeper traffic' },
          { id: 'rice', label: 'Declan Rice', detail: 'Delivery' },
          { id: 'saka', label: 'Bukayo Saka', detail: 'Left-foot whip' },
          { id: 'timber', label: 'Jurrien Timber', detail: 'Second-ball bite' },
        ],
      },
      {
        id: 'captain-creator',
        question: 'Who made the season tick?',
        source: 'Fan debate card',
        explainer: 'No referee on this one — choose the player your group thinks everything flowed through.',
        options: [
          { id: 'odegaard', label: 'Martin Odegaard', detail: 'Captain hub' },
          { id: 'rice', label: 'Declan Rice', detail: 'Tempo and legs' },
          { id: 'saka', label: 'Bukayo Saka', detail: 'Final-third threat' },
          { id: 'eze', label: 'Eze', detail: 'Spark' },
          { id: 'timber', label: 'Jurrien Timber', detail: 'Full-back power' },
          { id: 'havertz', label: 'Kai Havertz', detail: 'Link and press' },
        ],
      },
      {
        id: 'academy-spark',
        question: 'Which Hale End spark had you grinning?',
        source: 'Fan debate card',
        explainer: 'No official answer — save your pick, then settle it in the group.',
        options: [
          { id: 'nwaneri', label: 'Ethan Nwaneri', detail: 'Academy spark' },
          { id: 'dowman', label: 'Max Dowman', detail: 'Everton moment' },
          { id: 'lewis-skelly', label: 'Myles Lewis-Skelly', detail: 'Left-side burst' },
          { id: 'skelly-nwaneri', label: 'MLS + Ethan', detail: 'Double act' },
          { id: 'dowman-nwaneri', label: 'Dowman + Ethan', detail: 'Future noise' },
          { id: 'all-of-them', label: 'All of them', detail: 'No splitting them' },
        ],
      },
    ],
  },
};
