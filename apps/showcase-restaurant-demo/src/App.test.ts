import { describe, expect, test } from 'bun:test';
import { App } from './App.tsx';
import { RESTAURANT, MENU_SECTIONS, FILTERS, formatPrice } from './menu-data.ts';

describe('Locanda Soho menu demo', () => {
  test('exports a callable React component', () => {
    expect(typeof App).toBe('function');
  });

  test('ships restaurant demo content', () => {
    expect(RESTAURANT).toBeTruthy();
    expect(Array.isArray(MENU_SECTIONS)).toBe(true);
    expect(MENU_SECTIONS.length).toBeGreaterThan(0);
    expect(FILTERS.length).toBeGreaterThan(0);
    expect(typeof formatPrice).toBe('function');
  });
});
