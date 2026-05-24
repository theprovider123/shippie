import { describe, expect, test } from 'bun:test';
import { paradeGridCode } from './parade-grid';

describe('parade grid code', () => {
  test('creates stable short codes for offline pinpointing', () => {
    expect(paradeGridCode({ lng: -0.1048, lat: 51.5487 })).toMatch(/^[A-Z]+-\d{3}$/);
    expect(paradeGridCode({ lng: -0.1048, lat: 51.5487 })).toBe(paradeGridCode({ lng: -0.1048, lat: 51.5487 }));
  });
});
