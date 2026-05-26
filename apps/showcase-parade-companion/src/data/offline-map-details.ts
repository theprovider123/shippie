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
    area('highbury-corner-zone', 'station-zone', 'Highbury Corner', [
      [-0.1058, 51.5473],
      [-0.1005, 51.5472],
      [-0.1003, 51.5448],
      [-0.1057, 51.5448],
    ], 1.25),
    area('town-hall-zone', 'town-centre', 'Town Hall', [
      [-0.1060, 51.5437],
      [-0.1016, 51.5436],
      [-0.1018, 51.5413],
      [-0.1063, 51.5414],
    ], 1.55),
    area('caledonian-road-zone', 'station-zone', 'Caledonian Road', [
      [-0.1212, 51.5495],
      [-0.1160, 51.5493],
      [-0.1165, 51.5468],
      [-0.1215, 51.5470],
    ], 1.45),
  ],
  lines: [
    line('holloway-road', 'major-road', 'Holloway Road', [[-0.123, 51.5529], [-0.1130, 51.5528], [-0.1055, 51.5532], [-0.098, 51.5528]]),
    line('seven-sisters-road', 'major-road', 'Seven Sisters Road', [[-0.122, 51.5584], [-0.1135, 51.5581], [-0.1050, 51.5580], [-0.096, 51.5585]], 1.2),
    line('hornsey-road', 'major-road', 'Hornsey Road', [[-0.119, 51.5650], [-0.1162, 51.5580], [-0.1138, 51.5528], [-0.1120, 51.5460]], 1.35),
    line('blackstock-road', 'major-road', 'Blackstock Road', [[-0.0980, 51.5588], [-0.1008, 51.5550], [-0.1028, 51.5525], [-0.1016, 51.5486]], 1.35),
    line('drayton-park-road', 'route-road', 'Drayton Park', [[-0.1090, 51.5568], [-0.1086, 51.5549], [-0.1055, 51.5532], [-0.1044, 51.5512]]),
    line('gillespie-road', 'street', 'Gillespie Road', [[-0.1138, 51.5571], [-0.1104, 51.5568], [-0.1068, 51.5561], [-0.1032, 51.5558]], 1.55),
    line('benwell-road', 'street', 'Benwell Road', [[-0.1112, 51.5550], [-0.1083, 51.5548], [-0.1046, 51.5544], [-0.1018, 51.5538]], 1.7),
    line('avenell-road', 'street', 'Avenell Road', [[-0.1103, 51.5537], [-0.1074, 51.5534], [-0.1043, 51.5528], [-0.1015, 51.5520]], 1.85),
    line('highbury-hill', 'major-road', 'Highbury Hill', [[-0.1052, 51.5555], [-0.1040, 51.5525], [-0.1022, 51.5495], [-0.1027, 51.5461]], 1.35),
    line('highbury-park', 'major-road', 'Highbury Park', [[-0.1015, 51.5572], [-0.0998, 51.5538], [-0.1006, 51.5508], [-0.1016, 51.5486]], 1.5),
    line('aubert-park', 'route-road', 'Aubert Park', [[-0.1055, 51.5532], [-0.1032, 51.5526], [-0.1016, 51.5486]]),
    line('highbury-grove', 'route-road', 'Highbury Grove', [[-0.1028, 51.5525], [-0.1016, 51.5486], [-0.1027, 51.5461]]),
    line('st-pauls-road', 'route-road', "St Paul's Road", [[-0.1120, 51.5459], [-0.1060, 51.5460], [-0.1027, 51.5461], [-0.0965, 51.5462]]),
    line('upper-street', 'route-road', 'Upper Street', [[-0.1027, 51.5461], [-0.1035, 51.5438], [-0.1044, 51.5402], [-0.1058, 51.5327]]),
    line('canonbury-road', 'street', 'Canonbury Road', [[-0.0980, 51.5505], [-0.1016, 51.5486], [-0.1031, 51.5462]], 1.35),
    line('canonbury-park-south', 'street', 'Canonbury Park South', [[-0.1055, 51.5462], [-0.1017, 51.5460], [-0.0980, 51.5459], [-0.0942, 51.5457]], 1.8),
    line('canonbury-lane', 'street', 'Canonbury Lane', [[-0.1018, 51.5459], [-0.0992, 51.5439], [-0.0962, 51.5426]], 2.05),
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
    line('cross-street', 'street', 'Cross Street', [[-0.1085, 51.5415], [-0.1048, 51.5416], [-0.1012, 51.5416]], 2.1),
    line('islington-park-street', 'street', 'Islington Park Street', [[-0.1086, 51.5430], [-0.1060, 51.5426], [-0.1036, 51.5421]], 2.05),
    line('barnsbury-street', 'street', 'Barnsbury Street', [[-0.1115, 51.5442], [-0.1090, 51.5418], [-0.1075, 51.5397]], 2.25),
    line('pentonville-road', 'major-road', 'Pentonville Road', [[-0.1160, 51.5318], [-0.1100, 51.5324], [-0.1058, 51.5327], [-0.0980, 51.5326]], 1.45),
    line('islington-high-street', 'major-road', 'Islington High Street', [[-0.1060, 51.5350], [-0.1058, 51.5327], [-0.1053, 51.5312]], 1.65),
    line('chapel-market', 'street', 'Chapel Market', [[-0.1087, 51.5357], [-0.1062, 51.5354], [-0.1036, 51.5350]], 2.1),
  ],
  labels: [
    label('label-stadium', 'place', 'Emirates Stadium', -0.1086, 51.5552),
    label('label-arsenal-station', 'station', 'Arsenal', -0.1059, 51.5586, 1.2),
    label('label-holloway-road-station', 'station', 'Holloway Road', -0.1127, 51.5527, 1.25),
    label('label-caledonian-road-station', 'station', 'Caledonian Road', -0.1188, 51.5481, 1.35),
    label('label-drayton', 'station', 'Drayton Park', -0.1055, 51.5534),
    label('label-highbury-fields-n', 'pinpoint', 'Highbury Fields north edge', -0.1024, 51.5478, 1.7),
    label('label-highbury-fields-s', 'pinpoint', 'Highbury Fields south edge', -0.1027, 51.5450, 2.2),
    label('label-highbury-station', 'station', 'Highbury & Islington', -0.1032, 51.5461, 1.15),
    label('label-highbury-corner', 'place', 'Highbury Corner', -0.1032, 51.5461, 1.35),
    label('label-union-chapel', 'place', 'Union Chapel', -0.1029, 51.5447, 1.75),
    label('label-upper-street', 'road', 'Upper Street', -0.1042, 51.5404, 1.7),
    label('label-town-hall', 'place', 'Town Hall', -0.1026, 51.5421, 1.45),
    label('label-almeida', 'place', 'Almeida Theatre', -0.1022, 51.5432, 2.2),
    label('label-islington-green', 'place', 'Islington Green', -0.1052, 51.5380, 1.7),
    label('label-camden-passage', 'pinpoint', 'Camden Passage', -0.1037, 51.5386, 2.15),
    label('label-chapel-market', 'pinpoint', 'Chapel Market', -0.1061, 51.5354, 2.0),
    label('label-angel', 'station', 'Angel', -0.1058, 51.5327, 1.3),
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
  'watford-vicarage': WATFORD_DETAILS,
};

export function offlineMapDetailsFor(pack: RoutePack): OfflineMapDetails {
  const title = pack.event.title.toLowerCase();
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
