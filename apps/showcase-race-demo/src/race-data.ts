export const TOTAL_KM = 21.1;

export interface Wave {
  id: string;
  label: string;
  time: string;
  detail: string;
}

export interface Station {
  id: string;
  kind: 'water' | 'aid' | 'cutoff' | 'finish';
  name: string;
  km: number;
  cutoffTime?: string;
  supplies: string[];
  medical?: string;
  note?: string;
}

export interface RouteStop {
  label: string;
  detail: string;
}

export const race = {
  name: 'Hackney Half Marathon 2026',
  shortName: 'Hackney Half 2026',
  distanceMiles: 13.1,
  distanceKm: TOTAL_KM,
  date: 'Sunday 15 June 2026',
  startLocation: 'Hackney Marshes, Homerton Road, London E9 5PF',
  finishLocation: 'Victoria Park, Grove Road, London E3 5TB',
  waveStartIso: '2026-06-15T09:00:00+01:00',
  courseClose: '13:30',
};

export const participant = {
  name: 'Alex Thompson',
  bib: '4872',
  wave: 'C',
  waveStart: '09:00',
  category: 'Male 35-44',
  club: 'Hackney Runners',
  targetLabel: 'Sub 2:00:00',
  targetSeconds: 7200,
  targetPaceSecondsPerKm: 341,
  personalBestSeconds: 7422,
  emergencyName: 'Sam Thompson',
  emergencyPhone: '07700 900456',
};

export const waves: Wave[] = [
  { id: 'A', label: 'Wave A', time: '08:30', detail: 'Elite and sub-1:30 targets' },
  { id: 'B', label: 'Wave B', time: '08:45', detail: '1:30 to 1:50 targets' },
  { id: 'C', label: 'Wave C', time: '09:00', detail: '1:50 to 2:10 targets' },
  { id: 'D', label: 'Wave D', time: '09:15', detail: '2:10 to 2:30 targets' },
  { id: 'E', label: 'Wave E', time: '09:30', detail: '2:30+ and walkers' },
];

export const venueChecklist = [
  { label: 'Bag drop closes', value: '08:50' },
  { label: 'Toilets', value: 'near bag drop, south end' },
  { label: 'Start corral', value: 'Green, 200m north of bag drop' },
];

export const weather = {
  temp: '16C to 19C',
  sky: 'Overcast with sunny spells',
  wind: '8mph SW',
  humidity: '65%',
  uv: '4 moderate',
  verdict: 'Good conditions. Slightly warm - pace accordingly.',
};

export const stations: Station[] = [
  {
    id: 'water-2',
    kind: 'water',
    name: 'Water station 1',
    km: 2,
    supplies: ['Water'],
    medical: "St John's Ambulance",
  },
  {
    id: 'cutoff-5',
    kind: 'cutoff',
    name: 'Cut-off point 1',
    km: 5,
    cutoffTime: '10:30',
    supplies: ['Water', 'Electrolytes', 'Gels'],
    medical: 'Full team with vehicle',
  },
  {
    id: 'aid-8',
    kind: 'aid',
    name: 'Water station 2',
    km: 8,
    supplies: ['Water', 'Electrolytes', 'Gels', 'Bananas', 'Vaseline', 'Wet sponges'],
    medical: "St John's Ambulance present",
  },
  {
    id: 'cutoff-105',
    kind: 'cutoff',
    name: 'Cut-off point 2',
    km: 10.5,
    cutoffTime: '11:30',
    supplies: ['Water', 'Electrolytes', 'Gels', 'Drop bags'],
    medical: 'Medical team',
  },
  {
    id: 'water-13',
    kind: 'water',
    name: 'Water station 3',
    km: 13,
    supplies: ['Water', 'Electrolytes', 'Jelly babies'],
  },
  {
    id: 'water-16',
    kind: 'water',
    name: 'Water station 4',
    km: 16,
    supplies: ['Water', 'Electrolytes', 'Gels', 'Oranges'],
  },
  {
    id: 'cutoff-19',
    kind: 'cutoff',
    name: 'Cut-off point 3',
    km: 19,
    cutoffTime: '12:30',
    supplies: ['Final marshal check'],
    medical: 'Mobile response',
  },
  {
    id: 'finish',
    kind: 'finish',
    name: 'Finish - Victoria Park',
    km: 21.1,
    cutoffTime: '13:30',
    supplies: ['Medal', 'Foil blankets', 'Water', 'Fruit', 'Energy bars', 'Bag collection'],
    medical: 'Full team',
    note: 'Photographer at the finish line',
  },
];

export const routeStops: RouteStop[] = [
  { label: 'Start', detail: 'Hackney Marshes east side, near the football pitches' },
  { label: 'Mile 1', detail: 'Along the Marshes, past the athletics track' },
  { label: 'Mile 2', detail: 'Through Homerton, onto Victoria Park Road' },
  { label: 'Mile 3', detail: 'Victoria Park north entrance, around the boating lake' },
  { label: 'Mile 4', detail: 'Exit Victoria Park south, along Grove Road' },
  { label: 'Mile 5', detail: 'Through Mile End, alongside the canal' },
  { label: 'Mile 6', detail: 'Limehouse Basin, along the Regents Canal towpath' },
  { label: 'Mile 7', detail: 'Poplar, under the DLR' },
  { label: 'Mile 8', detail: 'Back along the canal heading north' },
  { label: 'Mile 9', detail: 'Hackney Wick, Olympic Park perimeter' },
  { label: 'Mile 10', detail: 'Along the River Lee' },
  { label: 'Mile 11', detail: 'Return through Hackney Marshes' },
  { label: 'Mile 12', detail: 'Final lap of the Marshes' },
  { label: 'Mile 13', detail: 'Victoria Park finish straight' },
  { label: 'Finish', detail: 'Victoria Park bandstand' },
];

export const infoSections = [
  {
    title: 'Bag Drop',
    rows: [
      ['Location', 'Hackney Marshes start, east side'],
      ['Opens', '07:30'],
      ['Closes', '08:50, no exceptions'],
      ['Collection', 'Victoria Park main tent'],
    ],
  },
  {
    title: 'Getting There',
    rows: [
      ['Start', 'Homerton Overground, 8 min walk'],
      ['Bus', '26, 30, 388 to Homerton Road'],
      ['Parking', 'No car parking at start'],
      ['Finish', 'Hackney Wick, Mile End, or buses 277/339'],
      ['Shuttles', 'Every 30 min, 10:00 to 15:00'],
    ],
  },
  {
    title: 'After Race',
    rows: [
      ['Race village', 'Victoria Park by the bandstand'],
      ['Refuel', 'Bananas, flapjacks, water, sports drinks'],
      ['Massage', '15 min sessions, pre-book on app'],
      ['Results', 'Chip times at finish, full results within 2 hours'],
    ],
  },
  {
    title: 'Emergency',
    rows: [
      ['Race medical', '07700 900100'],
      ['Race director', '07700 900101'],
      ['Missing person', "Contact any marshal or St John's"],
    ],
  },
];

export const paceChart = [
  { finish: '1:45:00', perKm: '5:00', perMile: '8:02' },
  { finish: '1:50:00', perKm: '5:14', perMile: '8:24' },
  { finish: '1:55:00', perKm: '5:27', perMile: '8:46' },
  { finish: '2:00:00', perKm: '5:41', perMile: '9:09' },
  { finish: '2:10:00', perKm: '6:09', perMile: '9:54' },
  { finish: '2:30:00', perKm: '7:06', perMile: '11:26' },
];
