import { describe, expect, test } from 'bun:test';
import { scanHtml } from './html-scanner.ts';

const enc = (s: string) => new TextEncoder().encode(s);

describe('scanHtml', () => {
  test('counts buttons across multiple files', () => {
    const files = new Map<string, Uint8Array>();
    files.set('index.html', enc(`<html><body><button>a</button><button>b</button></body></html>`));
    files.set('about.html', enc(`<html><body><button>c</button></body></html>`));
    const result = scanHtml(files);
    expect(result.elements.buttons).toBe(3);
  });

  test('counts inputs and captures their names', () => {
    const files = new Map([['x.html', enc(`
      <input type="text" name="email" />
      <input type="text" name="password" />
      <input type="file" accept="image/*" />
    `)]]);
    const result = scanHtml(files);
    expect(result.elements.textInputs.count).toBe(2);
    expect(result.elements.textInputs.names).toEqual(['email', 'password']);
    expect(result.elements.fileInputs.count).toBe(1);
    expect(result.elements.fileInputs.accepts).toEqual(['image/*']);
  });

  test('extracts <title> as inferredName', () => {
    const files = new Map([['index.html', enc(`<html><head><title>Recipe Saver</title></head></html>`)]]);
    const result = scanHtml(files);
    expect(result.inferredName).toBe('Recipe Saver');
  });

  test('falls back to largest h1 when no title', () => {
    const files = new Map([['index.html', enc(`<h1>My Big App</h1><h1>x</h1>`)]]);
    const result = scanHtml(files);
    expect(result.inferredName).toBe('My Big App');
  });

  test('collects icon hrefs from link tags', () => {
    const files = new Map([['index.html', enc(`
      <link rel="icon" href="/favicon.ico">
      <link rel="apple-touch-icon" href="/apple.png">
    `)]]);
    const result = scanHtml(files);
    expect(result.iconHrefs).toEqual(['/favicon.ico', '/apple.png']);
  });

  test('detects existing manifest link', () => {
    const files = new Map([['index.html', enc(`<link rel="manifest" href="/manifest.json">`)]]);
    const result = scanHtml(files);
    expect(result.hasOwnManifest).toBe(true);
  });

  test('counts list items per <ul>/<ol>', () => {
    const files = new Map([['x.html', enc(`<ul><li>1</li><li>2</li><li>3</li></ul><ol><li>a</li></ol>`)]]);
    const result = scanHtml(files);
    expect(result.elements.lists.count).toBe(2);
    expect(result.elements.lists.itemCounts).toEqual([3, 1]);
  });
});
