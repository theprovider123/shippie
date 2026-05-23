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

export interface RoutePoi extends LngLat {
  id: string;
  kind:
    | 'station'
    | 'landmark'
    | 'medical'
    | 'exit'
    | 'toilet'
    | 'meeting'
    | 'stewards';
  name: string;
  note?: string;
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
  scheduleEstimate: Array<{ label: string; time: string; note?: string }>;
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
  packVersion: '2026-05-22T12:00:00+01:00',
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
  ],
  route: {
    type: 'LineString',
    label: 'Provisional parade corridor',
    note: 'Official route not final in this pack. Use this as a planning corridor only.',
    coordinates: [
      [-0.1086, 51.5549],
      [-0.1066, 51.5524],
      [-0.1048, 51.5487],
      [-0.1037, 51.5457],
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
  ],
  closures: [
    {
      label: 'Road closures',
      note: 'Closures are expected around the route. This offline pack will be updated as official details firm up.',
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
  ],
  scheduleEstimate: [
    { label: 'Parade starts at the stadium area', time: '14:00', note: 'Official start time.' },
    { label: 'Expect movement along the corridor', time: '14:20-15:15', note: 'Estimated, not live.' },
    { label: 'Crowds disperse toward stations and side streets', time: '15:30+', note: 'Leave extra time.' },
  ],
};
