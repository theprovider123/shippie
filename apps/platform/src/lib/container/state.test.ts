import { describe, expect, test } from 'vitest';
import {
  STORAGE_KEY,
  createPackageFileCache,
  loadContainerState,
} from './state';

describe('container package file cache', () => {
  test('creates text and binary cache records', () => {
    const html = createPackageFileCache('app/index.html', new TextEncoder().encode('<h1>Hello</h1>'));
    const png = createPackageFileCache('app/logo.png', new Uint8Array([0, 1, 2, 3]));

    expect(html.mimeType).toBe('text/html; charset=utf-8');
    expect(html.text).toBe('<h1>Hello</h1>');
    expect(html.dataUrl).toContain('data:text/html; charset=utf-8;base64,');

    expect(png.mimeType).toBe('image/png');
    expect(png.text).toBeUndefined();
    expect(png.dataUrl).toBe('data:image/png;base64,AAECAw==');
  });

  test('loadContainerState migrates the old string file cache shape', () => {
    const storage = memoryStorage();
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        openAppIds: ['app_notes'],
        importedApps: [],
        packageFilesByApp: {
          app_notes: {
            'app/index.html': '<h1>Old cache</h1>',
          },
        },
        receiptsByApp: {},
        rowsByApp: {},
      }),
    );

    const state = loadContainerState(storage);
    const entry = state?.packageFilesByApp?.app_notes?.['app/index.html'];

    expect(entry?.text).toBe('<h1>Old cache</h1>');
    expect(entry?.mimeType).toBe('text/html; charset=utf-8');
    expect(entry?.dataUrl).toContain('base64,');
  });
});

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => map.delete(key),
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}
