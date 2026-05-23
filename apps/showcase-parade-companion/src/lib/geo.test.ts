import { describe, expect, test } from 'bun:test';
import { CORRIDOR_EXTENT } from '../data/parade-2026';
import { bearingDeg, haversineMeters, lngLatToPixel, pixelToLngLat } from './geo';

describe('geo', () => {
  test('projects the corridor centre into the raster centre', () => {
    const centre = {
      lng: (CORRIDOR_EXTENT.west + CORRIDOR_EXTENT.east) / 2,
      lat: (CORRIDOR_EXTENT.north + CORRIDOR_EXTENT.south) / 2,
    };
    const pixel = lngLatToPixel(centre);
    expect(pixel.x).toBeGreaterThan(820);
    expect(pixel.x).toBeLessThan(980);
    expect(pixel.y).toBeGreaterThan(820);
    expect(pixel.y).toBeLessThan(990);
  });

  test('round-trips pixels to longitude and latitude', () => {
    const point = { lng: -0.1031, lat: 51.546 };
    const roundTrip = pixelToLngLat(lngLatToPixel(point));
    expect(roundTrip.lng).toBeCloseTo(point.lng, 5);
    expect(roundTrip.lat).toBeCloseTo(point.lat, 5);
  });

  test('computes known rough London distances', () => {
    const stadium = { lng: -0.1086, lat: 51.5549 };
    const townHall = { lng: -0.1026, lat: 51.5421 };
    expect(haversineMeters(stadium, townHall)).toBeGreaterThan(1400);
    expect(haversineMeters(stadium, townHall)).toBeLessThan(1600);
  });

  test('north bearing is near zero', () => {
    expect(bearingDeg({ lng: -0.1, lat: 51.54 }, { lng: -0.1, lat: 51.55 })).toBeCloseTo(0, 1);
  });
});
