import { describe, expect, test } from 'bun:test';
import { App } from './App.tsx';
import { COUPLE, TIMELINE, TABLES, GUESTS } from './wedding-data.ts';

describe('Wedding guide demo', () => {
  test('exports a callable React component', () => {
    expect(typeof App).toBe('function');
  });

  test('ships wedding demo content', () => {
    expect(COUPLE).toBeTruthy();
    expect(Array.isArray(TIMELINE)).toBe(true);
    expect(TIMELINE.length).toBeGreaterThan(0);
    expect(TABLES.length).toBeGreaterThan(0);
    expect(GUESTS.length).toBeGreaterThan(0);
  });
});
