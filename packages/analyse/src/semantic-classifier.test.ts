import { describe, expect, test } from 'bun:test';
import { classifyByText } from './semantic-classifier.ts';

describe('classifyByText', () => {
  test('detects cooking from recipe keywords', () => {
    const result = classifyByText('Save your favourite recipes. Add ingredients, set the oven, cook your meal.');
    expect(result.primary).toBe('cooking');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.signals).toContain('recipe');
    expect(result.signals).toContain('ingredient');
  });

  test('detects fitness from workout keywords', () => {
    const result = classifyByText('Track your workout. Log reps. Watch your strength training pace climb.');
    expect(result.primary).toBe('fitness');
  });

  test('detects journal from mood + reflection', () => {
    const result = classifyByText("Today's entry. Mood: calm. A reflection on what I noticed and how I'm feeling.");
    expect(result.primary).toBe('journal');
  });

  test('detects finance from budget + expense', () => {
    const result = classifyByText('Track your budget. Log every expense. Categorise spending. Aim for savings.');
    expect(result.primary).toBe('finance');
  });

  test('returns unknown when no keywords match', () => {
    const result = classifyByText('Hello world. Welcome to a generic page with nothing distinctive in it.');
    expect(result.primary).toBe('unknown');
  });

  test('returns unknown when input is empty', () => {
    const result = classifyByText('');
    expect(result.primary).toBe('unknown');
    expect(result.confidence).toBe(0);
    expect(result.signals).toEqual([]);
  });

  test('matches plural keyword forms (recipes → recipe)', () => {
    const result = classifyByText('recipes ingredients oven');
    expect(result.primary).toBe('cooking');
    expect(result.signals).toContain('recipe');
    expect(result.signals).toContain('ingredient');
  });

  test('avoids false positives across word boundaries', () => {
    // "preferences" must NOT match "reference" — \b word boundary check.
    const result = classifyByText('preferences settings options');
    expect(result.primary).toBe('unknown');
  });

  test('confidence reflects keyword density', () => {
    const high = classifyByText('recipe ingredient cook kitchen meal oven');
    const low = classifyByText('I have one recipe to share with you all today');
    expect(high.confidence).toBeGreaterThan(low.confidence);
  });
});
