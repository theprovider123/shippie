import { describe, expect, test } from 'bun:test';
import { scorePrediction } from './scoring.ts';

describe('prediction scoring', () => {
  test('awards exact, result, and miss points', () => {
    expect(scorePrediction({ predictionHome: 2, predictionAway: 1, actualHome: 2, actualAway: 1 })).toBe(3);
    expect(scorePrediction({ predictionHome: 1, predictionAway: 0, actualHome: 2, actualAway: 1 })).toBe(1);
    expect(scorePrediction({ predictionHome: 0, predictionAway: 1, actualHome: 2, actualAway: 1 })).toBe(0);
  });
});
