import { describe, expect, test } from 'bun:test';
import { fmtClock, fmtPace, paceToKph, parseClock } from './db';

describe('pace helpers', () => {
  test('fmtClock formats minutes / hours correctly', () => {
    expect(fmtClock(45)).toBe('0:45');
    expect(fmtClock(60)).toBe('1:00');
    expect(fmtClock(125)).toBe('2:05');
    expect(fmtClock(3725)).toBe('1:02:05');
  });

  test('fmtPace always shows MM:SS', () => {
    expect(fmtPace(360)).toBe('6:00');
    expect(fmtPace(285)).toBe('4:45');
    expect(fmtPace(70)).toBe('1:10');
  });

  test('paceToKph round-trips', () => {
    expect(paceToKph(360)).toBe(10); // 6:00/km = 10km/h
    expect(paceToKph(150)).toBe(24); // 2:30/km = 24km/h
  });

  test('parseClock accepts both forms; rejects garbage', () => {
    expect(parseClock('5:00')).toBe(300);
    expect(parseClock('1:00:00')).toBe(3600);
    expect(parseClock('1:30:30')).toBe(5430);
    expect(parseClock('garbage')).toBeNull();
    expect(parseClock('5')).toBeNull();
    expect(parseClock('-1:00')).toBeNull();
  });
});
