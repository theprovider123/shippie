import { describe, expect, it } from 'vitest';
import { stageStyleFor, MOBILE_STAGE_MAX } from './app-stage';

describe('stageStyleFor', () => {
  it('responsive / immersive / desktopPreferred / undefined → full stage (no constraint)', () => {
    expect(stageStyleFor('responsive')).toBe('');
    expect(stageStyleFor('immersive')).toBe('');
    expect(stageStyleFor('desktopPreferred')).toBe('');
    expect(stageStyleFor(undefined)).toBe('');
    expect(stageStyleFor(null)).toBe('');
  });

  it('mobilePreferred → centered phone-width column', () => {
    expect(stageStyleFor('mobilePreferred')).toBe(`max-width: ${MOBILE_STAGE_MAX}px; margin-inline: auto;`);
  });

  it('fixedAspect with a ratio → letterboxed', () => {
    expect(stageStyleFor('fixedAspect', '16/9')).toBe('aspect-ratio: 16/9; max-width: 100%; max-height: 100%; margin: auto;');
  });

  it('fixedAspect without a ratio → no constraint (degrades to full)', () => {
    expect(stageStyleFor('fixedAspect')).toBe('');
    expect(stageStyleFor('fixedAspect', null)).toBe('');
  });
});
