import type { LngLat, MapExtent, RoutePack } from './parade-2026';

export type OfflineMapAreaKind = 'park' | 'water' | 'stadium' | 'station-zone' | 'town-centre';
export type OfflineMapLineKind = 'route-road' | 'major-road' | 'street' | 'path' | 'rail' | 'waterway';
export type OfflineMapLabelKind = 'district' | 'road' | 'place' | 'station' | 'pinpoint';

export interface OfflineMapArea {
  id: string;
  kind: OfflineMapAreaKind;
  label?: string;
  coordinates: [number, number][];
  minScale?: number;
}

export interface OfflineMapLine {
  id: string;
  kind: OfflineMapLineKind;
  label?: string;
  coordinates: [number, number][];
  minScale?: number;
}

export interface OfflineMapLabel extends LngLat {
  id: string;
  kind: OfflineMapLabelKind;
  label: string;
  minScale?: number;
}

export interface OfflineMapDetails {
  id: string;
  areas: OfflineMapArea[];
  lines: OfflineMapLine[];
  labels: OfflineMapLabel[];
}

const ISLINGTON_DETAILS: OfflineMapDetails = {
  id: 'arsenal-islington',
  areas: [
    area('emirates-footprint', 'stadium', 'Stadium', [
      [-0.1104, 51.5558],
      [-0.1067, 51.5561],
      [-0.1059, 51.5542],
      [-0.1090, 51.5534],
    ]),
    area('highbury-fields-area', 'park', 'Highbury Fields', [
      [-0.1050, 51.5483],
      [-0.1008, 51.5482],
      [-0.1007, 51.5445],
      [-0.1043, 51.5444],
    ]),
    area('islington-green-area', 'park', 'Islington Green', [
      [-0.1061, 51.5388],
      [-0.1046, 51.5387],
      [-0.1048, 51.5376],
      [-0.1062, 51.5377],
    ], 1.25),
    area('angel-zone', 'station-zone', 'Angel', [
      [-0.1075, 51.5342],
      [-0.1045, 51.5342],
      [-0.1048, 51.5318],
      [-0.1078, 51.5318],
    ], 1.35),
  ],
  lines: [
    line('holloway-road', 'major-road', 'Holloway Road', [[-0.123, 51.5529], [-0.1130, 51.5528], [-0.1055, 51.5532], [-0.098, 51.5528]]),
    line('drayton-park-road', 'route-road', 'Drayton Park', [[-0.1090, 51.5568], [-0.1086, 51.5549], [-0.1055, 51.5532], [-0.1044, 51.5512]]),
    line('aubert-park', 'route-road', 'Aubert Park', [[-0.1055, 51.5532], [-0.1032, 51.5526], [-0.1016, 51.5486]]),
    line('highbury-grove', 'route-road', 'Highbury Grove', [[-0.1028, 51.5525], [-0.1016, 51.5486], [-0.1027, 51.5461]]),
    line('st-pauls-road', 'route-road', "St Paul's Road", [[-0.1120, 51.5459], [-0.1060, 51.5460], [-0.1027, 51.5461], [-0.0965, 51.5462]]),
    line('upper-street', 'route-road', 'Upper Street', [[-0.1027, 51.5461], [-0.1035, 51.5438], [-0.1044, 51.5402], [-0.1058, 51.5327]]),
    line('canonbury-road', 'street', 'Canonbury Road', [[-0.0980, 51.5505], [-0.1016, 51.5486], [-0.1031, 51.5462]], 1.35),
    line('essex-road', 'major-road', 'Essex Road', [[-0.0938, 51.5460], [-0.0968, 51.5418], [-0.1004, 51.5352]], 1.3),
    line('liverpool-road', 'street', 'Liverpool Road', [[-0.1115, 51.5463], [-0.1105, 51.5410], [-0.1085, 51.5350]], 1.45),
    line('caledonian-road', 'major-road', 'Caledonian Road', [[-0.1190, 51.5500], [-0.1176, 51.5430], [-0.1165, 51.5350]], 1.35),
    line('fieldway', 'path', 'Highbury Fields path', [[-0.1040, 51.5474], [-0.1024, 51.5464], [-0.1014, 51.5454]], 2.05),
    line('town-hall-side', 'street', 'Town Hall side streets', [[-0.1047, 51.5427], [-0.1026, 51.5421], [-0.1003, 51.5417]], 2.05),
    line('north-london-line', 'rail', 'North London Line', [[-0.1230, 51.5471], [-0.1135, 51.5466], [-0.1031, 51.5460], [-0.0940, 51.5460]], 1.2),
    line('ronalds-road', 'street', 'Ronalds Road', [[-0.1105, 51.5500], [-0.1053, 51.5490], [-0.1018, 51.5486]], 2.0),
    line('calabria-road', 'street', 'Calabria Road', [[-0.1080, 51.5481], [-0.1032, 51.5475], [-0.1002, 51.5472]], 2.0),
    line('compton-terrace', 'street', 'Compton Terrace', [[-0.1046, 51.5460], [-0.1049, 51.5429], [-0.1052, 51.5408]], 2.1),
    line('almeida-street', 'street', 'Almeida Street', [[-0.1046, 51.5437], [-0.1025, 51.5434], [-0.1009, 51.5430]], 2.15),
    line('chapel-market', 'street', 'Chapel Market', [[-0.1087, 51.5357], [-0.1062, 51.5354], [-0.1036, 51.5350]], 2.1),
  ],
  labels: [
    label('label-stadium', 'place', 'Stadium area', -0.1086, 51.5552),
    label('label-drayton', 'station', 'Drayton Park', -0.1055, 51.5534),
    label('label-highbury-fields-n', 'pinpoint', 'Highbury Fields north edge', -0.1024, 51.5478, 1.7),
    label('label-highbury-fields-s', 'pinpoint', 'Highbury Fields south edge', -0.1027, 51.5450, 2.2),
    label('label-highbury-corner', 'place', 'Highbury Corner', -0.1032, 51.5461, 1.35),
    label('label-upper-street', 'road', 'Upper Street', -0.1042, 51.5404, 1.7),
    label('label-town-hall', 'place', 'Town Hall', -0.1026, 51.5421, 1.45),
    label('label-islington-green', 'place', 'Islington Green', -0.1052, 51.5380, 1.7),
    label('label-angel', 'station', 'Angel', -0.1058, 51.5327, 1.3),
  ],
};

const AMSTERDAM_DETAILS: OfflineMapDetails = {
  id: 'amsterdam-vondelpark',
  areas: [
    area('vondelpark-area', 'park', 'Vondelpark', [[4.858, 52.3595], [4.882, 52.3602], [4.886, 52.3562], [4.861, 52.3544]]),
    area('museumplein-area', 'park', 'Museumplein', [[4.878, 52.3606], [4.888, 52.3602], [4.887, 52.3562], [4.878, 52.3560]], 1.4),
    area('oosterpark-area', 'park', 'Oosterpark', [[4.915, 52.3635], [4.925, 52.3630], [4.924, 52.3570], [4.916, 52.3566]], 1.4),
    area('ij-water', 'water', 'IJ water', [[4.875, 52.3870], [4.940, 52.3980], [4.965, 52.3890], [4.890, 52.3815]], 1.2),
    area('centraal-zone', 'station-zone', 'Centraal', [[4.894, 52.3813], [4.907, 52.3815], [4.908, 52.3768], [4.895, 52.3766]], 1.2),
  ],
  lines: [
    line('ams-ij', 'waterway', 'IJ', [[4.780, 52.388], [4.865, 52.389], [4.940, 52.394], [5.060, 52.382]], 1.1),
    line('ams-ring-canal-1', 'waterway', 'Singel', [[4.884, 52.377], [4.889, 52.372], [4.892, 52.366], [4.895, 52.360]], 1.45),
    line('ams-ring-canal-2', 'waterway', 'Herengracht', [[4.887, 52.378], [4.893, 52.372], [4.897, 52.365], [4.901, 52.358]], 1.55),
    line('ams-ring-canal-3', 'waterway', 'Prinsengracht', [[4.881, 52.375], [4.888, 52.369], [4.893, 52.362], [4.898, 52.356]], 1.6),
    line('ams-overtoom', 'major-road', 'Overtoom', [[4.856, 52.360], [4.870, 52.360], [4.884, 52.361]], 1.2),
    line('ams-stadhouderskade', 'major-road', 'Stadhouderskade', [[4.867, 52.360], [4.883, 52.359], [4.906, 52.358], [4.923, 52.358]], 1.2),
    line('ams-wibautstraat', 'major-road', 'Wibautstraat', [[4.912, 52.350], [4.913, 52.358], [4.914, 52.367]], 1.35),
    line('ams-amstel', 'waterway', 'Amstel', [[4.898, 52.356], [4.906, 52.360], [4.910, 52.368], [4.906, 52.378]], 1.25),
    line('ams-vondel-path', 'path', 'Vondelpark main path', [[4.8615, 52.3562], [4.8665, 52.3570], [4.8731, 52.3590], [4.8790, 52.3588]], 1.75),
    line('ams-linnaeusstraat', 'major-road', 'Linnaeusstraat', [[4.917, 52.362], [4.928, 52.361], [4.942, 52.361]], 1.6),
    line('ams-ijburglaan', 'major-road', 'IJburglaan', [[4.970, 52.356], [5.000, 52.3555], [5.060, 52.356]], 1.45),
    line('ams-rail-west-east', 'rail', 'Rail corridor', [[4.835, 52.389], [4.9003, 52.3791], [4.9175, 52.3467], [4.9479, 52.3122]], 1.2),
    line('ams-damrak-rokin', 'major-road', 'Damrak / Rokin', [[4.899, 52.379], [4.894, 52.373], [4.891, 52.368], [4.890, 52.363]], 1.35),
    line('ams-vijzelstraat', 'major-road', 'Vijzelstraat', [[4.891, 52.366], [4.894, 52.360], [4.897, 52.354]], 1.55),
    line('ams-ferdinand-bol', 'street', 'Ferdinand Bolstraat', [[4.889, 52.357], [4.891, 52.352], [4.895, 52.346]], 1.9),
    line('ams-ceintuurbaan', 'major-road', 'Ceintuurbaan', [[4.882, 52.354], [4.897, 52.352], [4.914, 52.351]], 1.65),
    line('ams-van-baerlestraat', 'street', 'Van Baerlestraat', [[4.878, 52.360], [4.882, 52.356], [4.886, 52.352]], 1.85),
    line('ams-hobbemakade', 'street', 'Hobbemakade', [[4.879, 52.356], [4.885, 52.352], [4.891, 52.349]], 2.05),
    line('ams-nassaukade', 'major-road', 'Nassaukade', [[4.866, 52.365], [4.869, 52.360], [4.873, 52.354]], 1.8),
    line('ams-marnixstraat', 'street', 'Marnixstraat', [[4.878, 52.378], [4.875, 52.371], [4.871, 52.363]], 1.9),
    line('ams-piet-heinkade', 'major-road', 'Piet Heinkade', [[4.906, 52.377], [4.925, 52.377], [4.950, 52.374]], 1.7),
    line('ams-middenweg', 'major-road', 'Middenweg', [[4.920, 52.363], [4.932, 52.359], [4.945, 52.355]], 1.7),
  ],
  labels: [
    label('ams-label-centraal', 'station', 'Centraal', 4.9003, 52.3791),
    label('ams-label-dam', 'place', 'Dam Square', 4.8925, 52.3731, 1.3),
    label('ams-label-vondel-west', 'pinpoint', 'Vondelpark west gate', 4.8615, 52.3562, 1.55),
    label('ams-label-vondel-east', 'pinpoint', 'Vondelpark east gate', 4.8731, 52.3590, 1.55),
    label('ams-label-museum', 'place', 'Museumplein', 4.8810, 52.3584, 1.3),
    label('ams-label-oosterpark', 'place', 'Oosterpark', 4.9201, 52.3600, 1.5),
    label('ams-label-noord', 'station', 'Noord', 4.9305, 52.4020, 1.25),
    label('ams-label-ijburg', 'place', 'IJburg', 5.0000, 52.3555, 1.2),
    label('ams-label-amstel', 'station', 'Amstel', 4.9175, 52.3467, 1.25),
  ],
};

const WATFORD_DETAILS: OfflineMapDetails = {
  id: 'watford-vicarage',
  areas: [
    area('vicarage-road-area', 'stadium', 'Vicarage Road', [[-0.404, 51.6512], [-0.399, 51.6514], [-0.399, 51.6482], [-0.404, 51.6480]]),
    area('cassiobury-park-area', 'park', 'Cassiobury Park', [[-0.440, 51.673], [-0.414, 51.674], [-0.410, 51.657], [-0.438, 51.656]], 1.25),
    area('town-centre-area', 'town-centre', 'Town centre', [[-0.402, 51.660], [-0.391, 51.660], [-0.392, 51.654], [-0.401, 51.654]], 1.25),
    area('junction-zone', 'station-zone', 'Watford Junction', [[-0.397, 51.663], [-0.389, 51.663], [-0.389, 51.658], [-0.397, 51.658]], 1.2),
  ],
  lines: [
    line('wat-vicarage-road', 'major-road', 'Vicarage Road', [[-0.406, 51.647], [-0.4019, 51.6498], [-0.398, 51.654]], 1.1),
    line('wat-high-street', 'major-road', 'High Street', [[-0.399, 51.653], [-0.3970, 51.6580], [-0.395, 51.662]], 1.1),
    line('wat-clarendon-road', 'street', 'Clarendon Road', [[-0.395, 51.658], [-0.3935, 51.6605], [-0.391, 51.664]], 1.35),
    line('wat-exchange-road', 'major-road', 'Exchange Road', [[-0.407, 51.658], [-0.3975, 51.6575], [-0.387, 51.656]], 1.2),
    line('wat-hempstead-road', 'major-road', 'Hempstead Road', [[-0.396, 51.660], [-0.388, 51.673], [-0.3810, 51.6860]], 1.2),
    line('wat-rickmansworth-road', 'major-road', 'Rickmansworth Road', [[-0.396, 51.655], [-0.4135, 51.6725], [-0.4415, 51.6470]], 1.25),
    line('wat-bushey-road', 'major-road', 'Lower High Street', [[-0.397, 51.655], [-0.3865, 51.6430], [-0.365, 51.645]], 1.25),
    line('wat-cassiobury-path', 'path', 'Cassiobury paths', [[-0.4355, 51.6650], [-0.4250, 51.6650], [-0.4180, 51.6610], [-0.4135, 51.6725]], 1.75),
    line('wat-rail', 'rail', 'Rail line', [[-0.3865, 51.6430], [-0.3960, 51.6555], [-0.3935, 51.6605], [-0.3810, 51.6860]], 1.15),
    line('wat-st-albans-road', 'major-road', 'St Albans Road', [[-0.3955, 51.6610], [-0.3900, 51.6700], [-0.3860, 51.6790]], 1.35),
    line('wat-queens-road', 'street', 'Queens Road', [[-0.4030, 51.6595], [-0.3970, 51.6590], [-0.3915, 51.6585]], 1.7),
    line('wat-beechen-grove', 'street', 'Beechen Grove', [[-0.4020, 51.6560], [-0.3965, 51.6575], [-0.3905, 51.6585]], 1.55),
    line('wat-market-street', 'street', 'Market Street', [[-0.4010, 51.6570], [-0.3970, 51.6580], [-0.3930, 51.6590]], 1.9),
    line('wat-water-lane', 'street', 'Water Lane', [[-0.4005, 51.6530], [-0.3960, 51.6555], [-0.3910, 51.6575]], 1.8),
    line('wat-wiggenhall-road', 'major-road', 'Wiggenhall Road', [[-0.405, 51.649], [-0.402, 51.641], [-0.398, 51.633]], 1.7),
  ],
  labels: [
    label('wat-label-stadium', 'place', 'Vicarage Road', -0.4019, 51.6498),
    label('wat-label-high-street', 'place', 'High Street', -0.3970, 51.6580, 1.25),
    label('wat-label-junction', 'station', 'Watford Junction', -0.3935, 51.6605),
    label('wat-label-cassiobury', 'place', 'Cassiobury Park', -0.4180, 51.6610, 1.35),
    label('wat-label-garston', 'station', 'Garston', -0.3810, 51.6860, 1.2),
    label('wat-label-bushey', 'station', 'Bushey', -0.3865, 51.6430, 1.2),
    label('wat-label-croxley', 'station', 'Croxley', -0.4415, 51.6470, 1.25),
    label('wat-label-town-centre', 'pinpoint', 'Town centre', -0.3975, 51.6575, 1.8),
  ],
};

const DETAILS_BY_ID: Record<string, OfflineMapDetails> = {
  'arsenal-islington': ISLINGTON_DETAILS,
  'amsterdam-vondelpark': AMSTERDAM_DETAILS,
  'watford-vicarage': WATFORD_DETAILS,
};

export function offlineMapDetailsFor(pack: RoutePack): OfflineMapDetails {
  const title = pack.event.title.toLowerCase();
  if (title.includes('amsterdam')) return AMSTERDAM_DETAILS;
  if (title.includes('watford')) return WATFORD_DETAILS;
  return ISLINGTON_DETAILS;
}

export function validateOfflineMapDetails(details: OfflineMapDetails, extent: MapExtent): boolean {
  return (
    details.areas.every((feature) => feature.coordinates.length >= 3 && feature.coordinates.every((coord) => coordInside(coord, extent))) &&
    details.lines.every((feature) => feature.coordinates.length >= 2 && feature.coordinates.every((coord) => coordInside(coord, extent))) &&
    details.labels.every((item) => pointInside(item, extent))
  );
}

export function listOfflineMapDetailIds(): string[] {
  return Object.keys(DETAILS_BY_ID);
}

function area(
  id: string,
  kind: OfflineMapAreaKind,
  label: string,
  coordinates: [number, number][],
  minScale = 1,
): OfflineMapArea {
  return { id, kind, label, coordinates, minScale };
}

function line(
  id: string,
  kind: OfflineMapLineKind,
  label: string,
  coordinates: [number, number][],
  minScale = 1,
): OfflineMapLine {
  return { id, kind, label, coordinates, minScale };
}

function label(
  id: string,
  kind: OfflineMapLabelKind,
  text: string,
  lng: number,
  lat: number,
  minScale = 1,
): OfflineMapLabel {
  return { id, kind, label: text, lng, lat, minScale };
}

function coordInside(coord: [number, number], extent: MapExtent): boolean {
  return pointInside({ lng: coord[0], lat: coord[1] }, extent);
}

function pointInside(point: LngLat, extent: MapExtent): boolean {
  return point.lng >= extent.west && point.lng <= extent.east && point.lat >= extent.south && point.lat <= extent.north;
}
