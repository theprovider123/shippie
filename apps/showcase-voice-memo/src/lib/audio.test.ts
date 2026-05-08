import { describe, expect, test } from 'bun:test';
import {
  clampMaxDurationMs,
  DEFAULT_MAX_RECORDING_MS,
  formatDuration,
  MAX_MAX_RECORDING_MS,
  MIN_MAX_RECORDING_MS,
  pickRecordingMime,
  remainingMs,
} from './audio.ts';

describe('audio · pickRecordingMime', () => {
  test('returns null when MediaRecorder is undefined', () => {
    expect(pickRecordingMime(undefined)).toBeNull();
  });

  test('returns null when isTypeSupported is not a function', () => {
    const fake = {} as unknown as typeof MediaRecorder;
    expect(pickRecordingMime(fake)).toBeNull();
  });

  test('returns webm/opus when supported (Chrome path)', () => {
    const fake = {
      isTypeSupported: (mime: string) => mime === 'audio/webm;codecs=opus',
    } as unknown as typeof MediaRecorder;
    const got = pickRecordingMime(fake);
    expect(got?.mime).toBe('audio/webm;codecs=opus');
    expect(got?.ext).toBe('webm');
  });

  test('falls through to audio/mp4 when only mp4 supported (Safari path)', () => {
    const fake = {
      isTypeSupported: (mime: string) => mime === 'audio/mp4',
    } as unknown as typeof MediaRecorder;
    const got = pickRecordingMime(fake);
    expect(got?.mime).toBe('audio/mp4');
    expect(got?.ext).toBe('mp4');
  });

  test('prefers webm over mp4 when both supported', () => {
    const fake = {
      isTypeSupported: (mime: string) =>
        mime === 'audio/webm' || mime === 'audio/mp4' || mime === 'audio/webm;codecs=opus',
    } as unknown as typeof MediaRecorder;
    const got = pickRecordingMime(fake);
    expect(got?.mime).toBe('audio/webm;codecs=opus');
  });

  test('returns null when no candidate is supported', () => {
    const fake = {
      isTypeSupported: () => false,
    } as unknown as typeof MediaRecorder;
    expect(pickRecordingMime(fake)).toBeNull();
  });
});

describe('audio · clampMaxDurationMs', () => {
  test('returns the value unchanged when within range', () => {
    expect(clampMaxDurationMs(60_000)).toBe(60_000);
    expect(clampMaxDurationMs(120_000)).toBe(120_000);
  });

  test('clamps below minimum', () => {
    expect(clampMaxDurationMs(1_000)).toBe(MIN_MAX_RECORDING_MS);
    expect(clampMaxDurationMs(0)).toBe(MIN_MAX_RECORDING_MS);
  });

  test('clamps above maximum', () => {
    expect(clampMaxDurationMs(999_999)).toBe(MAX_MAX_RECORDING_MS);
  });

  test('returns default when value is not finite', () => {
    expect(clampMaxDurationMs(Number.NaN)).toBe(DEFAULT_MAX_RECORDING_MS);
    expect(clampMaxDurationMs(Number.POSITIVE_INFINITY)).toBe(DEFAULT_MAX_RECORDING_MS);
  });
});

describe('audio · formatDuration', () => {
  test('seconds under 60 render as Xs', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(14)).toBe('14s');
    expect(formatDuration(59)).toBe('59s');
  });

  test('seconds at 60+ render as m:ss', () => {
    expect(formatDuration(60)).toBe('1:00');
    expect(formatDuration(73)).toBe('1:13');
    expect(formatDuration(125)).toBe('2:05');
  });

  test('floors fractional seconds', () => {
    expect(formatDuration(14.9)).toBe('14s');
  });

  test('clamps negatives to 0s', () => {
    expect(formatDuration(-3)).toBe('0s');
  });
});

describe('audio · remainingMs', () => {
  test('returns difference when not exhausted', () => {
    expect(remainingMs(10_000, 60_000)).toBe(50_000);
  });

  test('clamps to zero when elapsed exceeds max', () => {
    expect(remainingMs(70_000, 60_000)).toBe(0);
  });
});
