import { describe, expect, test } from 'bun:test';
import { generateServiceWorker } from './generate-sw.ts';

describe('generateServiceWorker', () => {
  test('embeds slug and version in cache name', () => {
    const sw = generateServiceWorker('my-app', 7);
    expect(sw.includes("'my-app-v7'")).toBe(true);
  });

  test('contains install/activate/fetch handlers', () => {
    const sw = generateServiceWorker('x', 1);
    expect(sw.includes("addEventListener('install'")).toBe(true);
    expect(sw.includes("addEventListener('activate'")).toBe(true);
    expect(sw.includes("addEventListener('fetch'")).toBe(true);
  });

  test('contains periodicsync handler with shippie-ambient tag guard', () => {
    const sw = generateServiceWorker('x', 1);
    expect(sw.includes("addEventListener('periodicsync'")).toBe(true);
    expect(sw.includes("event.tag !== 'shippie-ambient'")).toBe(true);
  });

  test('periodicsync handler opens scheduler IndexedDB and writes sweep marker', () => {
    const sw = generateServiceWorker('x', 1);
    expect(sw.includes("indexedDB.open('shippie-ambient-scheduler', 1)")).toBe(true);
    expect(sw.includes("'sweep-markers'")).toBe(true);
    expect(
      sw.includes("createObjectStore('sweep-markers', { autoIncrement: true })"),
    ).toBe(true);
    expect(sw.includes("transaction('sweep-markers', 'readwrite')")).toBe(true);
  });

  test('periodicsync handler swallows errors so PBS is not cancelled', () => {
    const sw = generateServiceWorker('x', 1);
    // The body should contain a try/catch wrapping the IDB work.
    expect(sw.includes('} catch {')).toBe(true);
  });
});
