import { describe, expect, test } from 'bun:test';
import { escapeHtml, renderMarkdown } from './markdown.ts';

describe('escapeHtml', () => {
  test('escapes the five XSS-relevant chars', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
    );
    expect(escapeHtml("a'b")).toBe('a&#39;b');
    expect(escapeHtml('a&b')).toBe('a&amp;b');
  });
});

describe('renderMarkdown · headings', () => {
  test('renders h1, h2, h3', () => {
    expect(renderMarkdown('# Title')).toContain('<h1>Title</h1>');
    expect(renderMarkdown('## Sub')).toContain('<h2>Sub</h2>');
    expect(renderMarkdown('### Subsub')).toContain('<h3>Subsub</h3>');
  });
});

describe('renderMarkdown · paragraphs and lists', () => {
  test('renders paragraphs', () => {
    expect(renderMarkdown('Hello world')).toBe('<p>Hello world</p>');
  });

  test('renders bullet lists', () => {
    const out = renderMarkdown('- one\n- two\n- three');
    expect(out).toContain('<ul>');
    expect(out).toContain('<li>one</li>');
    expect(out).toContain('<li>three</li>');
  });

  test('renders numbered lists', () => {
    const out = renderMarkdown('1. first\n2. second');
    expect(out).toContain('<ol>');
    expect(out).toContain('<li>first</li>');
    expect(out).toContain('<li>second</li>');
  });

  test('multi-paragraph separated by blank line', () => {
    const out = renderMarkdown('First.\n\nSecond.');
    expect(out).toMatch(/<p>First\.<\/p>\s*<p>Second\.<\/p>/);
  });
});

describe('renderMarkdown · inline formatting', () => {
  test('bold and italic', () => {
    expect(renderMarkdown('**bold**')).toContain('<strong>bold</strong>');
    expect(renderMarkdown('a *em* b')).toContain('<em>em</em>');
  });

  test('inline code', () => {
    expect(renderMarkdown('use `npm install`')).toContain('<code>npm install</code>');
  });

  test('safe http links', () => {
    const out = renderMarkdown('see [docs](https://example.com)');
    expect(out).toContain('<a href="https://example.com">docs</a>');
  });
});

describe('renderMarkdown · XSS hardening', () => {
  test('strips javascript: links', () => {
    const out = renderMarkdown('[click](javascript:alert(1))');
    expect(out).not.toContain('javascript:');
    expect(out).not.toContain('<a href');
    // The text should still appear verbatim.
    expect(out).toContain('click');
  });

  test('escapes raw script tags in body', () => {
    const out = renderMarkdown('<script>evil()</script>');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
  });

  test('escapes script tags inside heading text', () => {
    const out = renderMarkdown('# <img src=x onerror=alert(1)>');
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img');
  });

  test('empty input returns empty string', () => {
    expect(renderMarkdown('')).toBe('');
    expect(renderMarkdown('   ')).toBe('');
  });
});
