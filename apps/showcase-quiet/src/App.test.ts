import { describe, expect, test } from 'bun:test';
import { App } from './App.tsx';
import { summarizeQuiet } from './quiet.ts';

describe('Quiet', () => {
  test('exports a callable React component', () => {
    expect(typeof App).toBe('function');
  });

  test('summarizes ritual rows by kind', () => {
    expect(
      summarizeQuiet([
        { id: '1', kind: 'breath', createdAt: 1, durationSeconds: 180 },
        { id: '2', kind: 'focus', createdAt: 2, durationSeconds: 1500 },
        { id: '3', kind: 'mood', createdAt: 3, score: 4 },
      ]),
    ).toEqual({ breath: 1, focus: 1, mood: 1, totalSeconds: 1680, averageMood: 4 });
  });
});
