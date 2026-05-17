import { describe, expect, test } from 'bun:test';
import { App } from './App.tsx';

describe('App', () => {
  test('exports a callable React component', () => {
    expect(typeof App).toBe('function');
  });
});
