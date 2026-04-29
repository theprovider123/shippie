/**
 * Smoke test — confirms the App export resolves and is a callable.
 * Generated showcases ship this file so `bun test` always finds at
 * least one entry. Replace or augment as the showcase grows.
 */
import { describe, expect, test } from 'bun:test';
import { App } from './App.tsx';

describe('App', () => {
  test('exports a callable React component', () => {
    expect(typeof App).toBe('function');
  });
});
