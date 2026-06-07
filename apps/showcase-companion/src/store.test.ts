import { describe, expect, it } from 'bun:test';
import { defaultState, normalizePresence } from './store.ts';

describe('companion store migration', () => {
  it('defaults to simple presence for new users', () => {
    expect(defaultState().prep.presenceLevel).toBe('simple');
  });

  it('maps old kaleidoscope state into vivid presence', () => {
    expect(normalizePresence(undefined, 'kaleidoscope')).toBe('vivid');
  });

  it('keeps explicit minimal presence when stored', () => {
    expect(normalizePresence('minimal', 'kaleidoscope')).toBe('minimal');
  });

  it('falls back safely for unknown stored values', () => {
    expect(normalizePresence('loud')).toBe('simple');
  });
});
