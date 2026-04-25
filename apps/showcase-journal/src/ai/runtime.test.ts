import { describe, expect, it } from 'bun:test';
import { embedDeterministic, getLocalAi } from './runtime.ts';

describe('embedDeterministic', () => {
  it('returns a normalized vector of the requested size', () => {
    const v = embedDeterministic('hello world hello', 32);
    expect(v.length).toBe(32);
    let mag = 0;
    for (let i = 0; i < v.length; i++) mag += v[i]! * v[i]!;
    expect(Math.sqrt(mag)).toBeCloseTo(1, 5);
  });

  it('is deterministic — same input, same output', () => {
    const a = embedDeterministic('the quick brown fox', 64);
    const b = embedDeterministic('the quick brown fox', 64);
    for (let i = 0; i < a.length; i++) expect(a[i]).toBeCloseTo(b[i]!, 6);
  });

  it('produces different vectors for different inputs', () => {
    const a = embedDeterministic('cats are nice', 64);
    const b = embedDeterministic('quantum mechanics is hard', 64);
    let dot = 0;
    for (let i = 0; i < a.length; i++) dot += a[i]! * b[i]!;
    expect(Math.abs(dot)).toBeLessThan(0.95);
  });
});

describe('fallback ai sentiment', () => {
  it('detects positive language', async () => {
    const ai = getLocalAi();
    const result = await ai.sentiment('Today was wonderful and I felt grateful and happy.');
    expect(result.sentiment).toBe('positive');
    expect(result.score).toBeGreaterThan(0);
  });

  it('detects negative language', async () => {
    const ai = getLocalAi();
    const result = await ai.sentiment('I felt anxious and overwhelmed and stressed all afternoon.');
    expect(result.sentiment).toBe('negative');
    expect(result.score).toBeLessThan(0);
  });

  it('returns neutral when no signal', async () => {
    const ai = getLocalAi();
    const result = await ai.sentiment('I bought eggs at the store on the corner.');
    expect(result.sentiment).toBe('neutral');
  });
});

describe('fallback ai classify', () => {
  it('classifies work text into work topic', async () => {
    const ai = getLocalAi();
    const result = await ai.classify('I have a meeting with my manager about the project deadline.', {
      labels: ['work', 'relationships', 'health', 'hobbies'],
    });
    expect(result.label).toBe('work');
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('classifies hobby text into hobbies topic', async () => {
    const ai = getLocalAi();
    const result = await ai.classify('Spent an hour on guitar and read a book.', {
      labels: ['work', 'relationships', 'health', 'hobbies'],
    });
    expect(result.label).toBe('hobbies');
  });
});
