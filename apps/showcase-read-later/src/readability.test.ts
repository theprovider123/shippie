/**
 * Readability extraction invariants — happy-dom-driven so we exercise
 * the real DOMParser path. The strip + density-pick logic is pure
 * over the parsed Document.
 */
import { describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { extractReadable } from './readability.ts';

function parse(html: string): Document {
  const window = new Window();
  window.document.write(html);
  return window.document as unknown as Document;
}

describe('extractReadable', () => {
  test('extracts the title from <title>', () => {
    const doc = parse('<html><head><title>Hello</title></head><body><p>x</p></body></html>');
    expect(extractReadable('', doc).title).toBe('Hello');
  });

  test('falls back to the first H1 when title is empty', () => {
    const doc = parse('<html><head></head><body><h1>Big Headline</h1><p>x</p></body></html>');
    expect(extractReadable('', doc).title).toBe('Big Headline');
  });

  test('prefers <article> over a candidate div', () => {
    const html = `
      <html><body>
        <article>hello article ${'x'.repeat(300)}</article>
        <div>candidate ${'y'.repeat(400)}</div>
      </body></html>
    `;
    expect(extractReadable('', parse(html)).contentHtml).toContain('hello article');
  });

  test('strips nav, footer, aside, script, style', () => {
    const html = `
      <html><body>
        <nav>menu link</nav>
        <article>real content ${'x'.repeat(300)}</article>
        <footer>copyright</footer>
        <script>console.log("hi")</script>
      </body></html>
    `;
    const result = extractReadable('', parse(html));
    expect(result.contentHtml).toContain('real content');
    expect(result.contentHtml).not.toContain('menu link');
    expect(result.contentHtml).not.toContain('copyright');
    expect(result.contentHtml).not.toContain('console.log');
  });

  test('readMinutes rounds based on a 220-words-per-minute baseline', () => {
    const words = Array.from({ length: 660 }, (_, i) => `word${i}`).join(' ');
    const html = `<html><body><article>${words}</article></body></html>`;
    expect(extractReadable('', parse(html)).readMinutes).toBe(3);
  });
});
