import { describe, expect, test } from 'bun:test';
import { loadBakedRoutePack } from '../lib/route-pack';
import {
  listOfflineMapDetailIds,
  offlineMapDetailsFor,
  validateOfflineMapDetails,
} from './offline-map-details';

describe('offline map detail packs', () => {
  test('ships a vector detail pack for every baked parade pack', () => {
    for (const id of ['arsenal-islington', 'watford-vicarage']) {
      expect(listOfflineMapDetailIds()).toContain(id);
      const pack = loadBakedRoutePack(id);
      const details = offlineMapDetailsFor(pack);
      expect(details.lines.length).toBeGreaterThanOrEqual(8);
      expect(details.labels.length).toBeGreaterThanOrEqual(8);
      expect(validateOfflineMapDetails(details, pack.mapExtent)).toBe(true);
    }
  });

  test('arsenal detail pack includes the route roads users actually recognise', () => {
    const details = offlineMapDetailsFor(loadBakedRoutePack('arsenal-islington'));
    const labels = new Set([
      ...details.lines.map((line) => line.label),
      ...details.labels.map((label) => label.label),
    ]);
    for (const expected of [
      'Holloway Road route',
      'Seven Sisters Road route',
      'Blackstock Road',
      'Green Lanes',
      'Essex Road route',
      'Upper Street route',
      'St Thomas Road',
      'Amber Road',
      'Highbury New Park',
      'Canonbury Street',
      'Grosvenor Avenue',
    ]) {
      expect(labels.has(expected)).toBe(true);
    }
  });
});
