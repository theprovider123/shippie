import { describe, expect, test } from 'bun:test';
import { formatDeployStreamLine } from './format-stream.ts';

describe('formatDeployStreamLine', () => {
  test('formats route mode events', () => {
    expect(
      formatDeployStreamLine('route_mode_detected', {
        elapsedMs: 1200,
        mode: 'spa',
        confidence: 0.91,
      }),
    ).toContain('route_mode       SPA (91%)');
  });

  test('formats asset recovery events', () => {
    expect(
      formatDeployStreamLine('asset_fixed', {
        elapsedMs: 80,
        before: '/images/hero.png',
        after: '/assets/hero.png',
        file: 'index.html',
      }),
    ).toContain('/images/hero.png -> /assets/hero.png');
  });

  test('formats bytes in deploy received events', () => {
    expect(
      formatDeployStreamLine('deploy_received', {
        elapsedMs: 0,
        slug: 'recipe',
        version: 3,
        files: 12,
        bytes: 1536,
      }),
    ).toContain('1.5KB');
  });
});
