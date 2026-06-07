import { describe, expect, it } from 'bun:test';
import { PRESENCE_LEVELS, nextPresenceLevel, presenceLabel } from './presence.ts';

describe('presence levels', () => {
  it('offers the three planned presence levels', () => {
    expect(PRESENCE_LEVELS.map((level) => level.id)).toEqual(['minimal', 'simple', 'vivid']);
  });

  it('uses vivid instead of kaleidoscope in user-facing labels', () => {
    const labels = PRESENCE_LEVELS.map((level) => `${level.label} ${level.short} ${level.description}`).join(' ');

    expect(labels).toContain('Vivid');
    expect(labels).toContain('Psychedelic visuals');
    expect(labels.toLowerCase()).not.toContain('kaleidoscope');
    expect(presenceLabel('vivid')).toBe('Vivid');
  });

  it('cycles presence levels for the in-trip text toggle', () => {
    expect(nextPresenceLevel('minimal')).toBe('simple');
    expect(nextPresenceLevel('simple')).toBe('vivid');
    expect(nextPresenceLevel('vivid')).toBe('minimal');
  });
});
