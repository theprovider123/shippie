import { describe, expect, test } from 'bun:test';
import { templateConfig } from './room-template.ts';

describe('room templates', () => {
  test('keeps family safe and pub energetic', () => {
    expect(templateConfig('family').tone).toBe('family');
    expect(templateConfig('pub').defaultPolls).toContain('VAR verdict');
  });
});
