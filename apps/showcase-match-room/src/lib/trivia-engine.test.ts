import { describe, expect, test } from 'bun:test';
import { dailyTrivia, scoreTrivia } from './trivia-engine.ts';

describe('trivia engine', () => {
  test('builds stable daily quizzes and scores answers', () => {
    const quiz = dailyTrivia(new Date('2026-06-11T12:00:00Z'));
    expect(quiz.length).toBe(5);
    expect(dailyTrivia(new Date('2026-06-11T23:00:00Z')).map((q) => q.id)).toEqual(quiz.map((q) => q.id));
    expect(scoreTrivia(quiz.map((q) => q.answerIndex), quiz)).toBe(5);
  });
});
