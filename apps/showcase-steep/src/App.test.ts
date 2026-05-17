/**
 * Smoke test — confirms the App export resolves and is callable.
 * Mirrors the showcase convention so `bun test` always finds at least
 * one entry while Track 2 fills in real component tests.
 */
import { describe, expect, test } from 'bun:test';
import { App } from './App.tsx';

describe('App', () => {
  test('exports a callable React component', () => {
    expect(typeof App).toBe('function');
  });
});
