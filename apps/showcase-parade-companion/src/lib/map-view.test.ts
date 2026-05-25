import { describe, expect, test } from 'bun:test';
import { centerMapOnWorldPoint, fitMapBounds, zoomMapAt } from './map-view';

describe('map-view', () => {
  test('zoomMapAt keeps the focal point anchored', () => {
    const view = { scale: 1, offset: { x: 0, y: 0 } };
    const next = zoomMapAt(view, 2, { x: 100, y: 80 }, { width: 400, height: 300 });
    expect(next.scale).toBe(2);
    expect(next.offset).toEqual({ x: -100, y: -80 });
  });

  test('zoomMapAt clamps offset inside the frame', () => {
    const view = { scale: 1, offset: { x: 0, y: 0 } };
    const next = zoomMapAt(view, 4, { x: 400, y: 300 }, { width: 400, height: 300 });
    expect(next.offset.x).toBeGreaterThanOrEqual(-1200);
    expect(next.offset.y).toBeGreaterThanOrEqual(-900);
    expect(next.offset.x).toBeLessThanOrEqual(0);
    expect(next.offset.y).toBeLessThanOrEqual(0);
  });

  test('centerMapOnWorldPoint centres a target at the requested zoom', () => {
    const next = centerMapOnWorldPoint({ x: 150, y: 100 }, 2, { width: 400, height: 300 });
    expect(next).toEqual({
      scale: 2,
      offset: { x: -100, y: -50 },
    });
  });

  test('fitMapBounds fills a small route instead of leaving it tiny', () => {
    const next = fitMapBounds({ minX: 150, maxX: 250, minY: 80, maxY: 180 }, { width: 400, height: 300 }, 40);
    expect(next.scale).toBeGreaterThan(2);
    expect(next.offset.x).toBeLessThan(0);
    expect(next.offset.y).toBeLessThan(0);
  });
});

