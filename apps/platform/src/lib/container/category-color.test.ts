import { describe, expect, it } from 'vitest';
import { categoryColorFamily } from './category-color';

describe('categoryColorFamily', () => {
  it('maps the generated cooking + health + games + personal + utilities vocab', () => {
    expect(categoryColorFamily('food-drink')).toBe('var(--sunset)');
    expect(categoryColorFamily('health-fitness')).toBe('var(--sage-leaf)');
    expect(categoryColorFamily('games')).toBe('var(--marigold)');
    expect(categoryColorFamily('arcade-cabinet')).toBe('var(--marigold)');
    expect(categoryColorFamily('daily-brain')).toBe('var(--accent-violet)');
    expect(categoryColorFamily('tools')).toBe('var(--info)');
  });

  it('maps the raw curatedAppSpecs vocab to the same families', () => {
    expect(categoryColorFamily('cooking')).toBe('var(--sunset)');
    expect(categoryColorFamily('wellness')).toBe('var(--sage-leaf)');
    expect(categoryColorFamily('creativity')).toBe('var(--marigold)');
    expect(categoryColorFamily('journal')).toBe('var(--accent-violet)');
    expect(categoryColorFamily('productivity')).toBe('var(--info)');
  });

  it('is case-insensitive', () => {
    expect(categoryColorFamily('Food-Drink')).toBe('var(--sunset)');
    expect(categoryColorFamily('GAMES')).toBe('var(--marigold)');
  });

  it('falls back to the neutral family for unknown / missing categories', () => {
    expect(categoryColorFamily('quux')).toBe('var(--text-light)');
    expect(categoryColorFamily(undefined)).toBe('var(--text-light)');
    expect(categoryColorFamily('')).toBe('var(--text-light)');
  });
});
