import { describe, expect, test } from 'bun:test';
import { App } from './App.tsx';
import { EVENTS, VENDORS } from './data.ts';

describe('Highbury Market Guide', () => {
  test('exports a callable React component', () => {
    expect(typeof App).toBe('function');
  });

  test('ships the requested market demo content', () => {
    expect(VENDORS).toHaveLength(20);
    expect(EVENTS.map((event) => event.time)).toEqual([
      '10:30 AM',
      '11:00 AM',
      '12:00 PM',
      '12:30 PM',
    ]);
  });
});
