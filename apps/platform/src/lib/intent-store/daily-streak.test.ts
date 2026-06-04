import { describe, expect, test } from 'vitest';
import { DAILY_SET_GAMES, dailySetFor, summariseDailyStreak } from './daily-streak';
import type { IntentEvent } from './store';

function completed(game: string, date: string, ts = Date.parse(`${date}T12:00:00Z`)): IntentEvent {
  return {
    appId: `app_${game.replaceAll('-', '_')}`,
    intent: 'game.completed',
    ts,
    row: {
      kind: 'game.completed',
      game,
      result: 'won',
      puzzleId: `${game}-${date}-r1-c1`,
      at: new Date(ts).toISOString(),
    },
  };
}

describe('dailySetFor', () => {
  test('uses the shared Shippie Daily contract', () => {
    expect(dailySetFor('2026-06-04')).toEqual({
      dailySetId: 'shippie-daily',
      setVersion: 1,
      setDate: '2026-06-04',
      memberGameIds: [...DAILY_SET_GAMES],
      requiredCount: 3,
    });
  });
});

describe('summariseDailyStreak', () => {
  test('counts only daily game.completed rows with puzzle ids', () => {
    const s = summariseDailyStreak(
      [
        completed('sudoku', '2026-06-04'),
        {
          appId: 'app_sudoku',
          intent: 'game.completed',
          ts: Date.parse('2026-06-04T13:00:00Z'),
          row: { game: 'sudoku' },
        },
        {
          appId: 'app_sudoku',
          intent: 'mood-logged',
          ts: Date.parse('2026-06-04T14:00:00Z'),
          row: { puzzleId: 'sudoku-2026-06-04-r1-c1' },
        },
        completed('stack', '2026-06-04'),
      ],
      '2026-06-04',
    );

    expect(s.todayGames).toEqual(['sudoku']);
    expect(s.today).toMatchObject({ done: 1, required: 3, total: 5, complete: false });
  });

  test('parses hyphenated game ids without slicing the date incorrectly', () => {
    const s = summariseDailyStreak(
      [
        completed('five-letter', '2026-06-04'),
        completed('block-drop', '2026-06-04'),
        completed('daily-puzzle', '2026-06-04'),
      ],
      '2026-06-04',
    );

    expect(s.todayGames).toEqual(['block-drop', 'daily-puzzle', 'five-letter']);
    expect(s.today.complete).toBe(true);
    expect(s.completedDates).toEqual(['2026-06-04']);
  });

  test('rolls a cross-game streak from completed daily sets', () => {
    const events = [
      completed('sudoku', '2026-06-02'),
      completed('five-letter', '2026-06-02'),
      completed('block-drop', '2026-06-02'),
      completed('sudoku', '2026-06-03'),
      completed('five-letter', '2026-06-03'),
      completed('quartet', '2026-06-03'),
      completed('sudoku', '2026-06-04'),
      completed('daily-puzzle', '2026-06-04'),
      completed('block-drop', '2026-06-04'),
    ];

    const s = summariseDailyStreak(events, '2026-06-04');
    expect(s.current).toBe(3);
    expect(s.best).toBe(3);
    expect(s.today).toMatchObject({ done: 3, complete: true });
  });

  test('keeps yesterday streak alive before today is complete', () => {
    const events = [
      completed('sudoku', '2026-06-03'),
      completed('five-letter', '2026-06-03'),
      completed('quartet', '2026-06-03'),
      completed('sudoku', '2026-06-04'),
    ];

    const s = summariseDailyStreak(events, '2026-06-04');
    expect(s.current).toBe(1);
    expect(s.best).toBe(1);
    expect(s.today.complete).toBe(false);
  });

  test('falls back to row.game and event UTC date for malformed puzzle ids', () => {
    const s = summariseDailyStreak(
      [
        {
          appId: 'app_block_drop',
          intent: 'game.completed',
          ts: Date.parse('2026-06-04T23:10:00Z'),
          row: {
            kind: 'game.completed',
            game: 'block-drop',
            result: 100,
            puzzleId: 'legacy-daily',
            at: '2026-06-04T23:10:00Z',
          },
        },
      ],
      '2026-06-04',
    );

    expect(s.todayGames).toEqual(['block-drop']);
    expect(s.today.done).toBe(1);
  });
});
