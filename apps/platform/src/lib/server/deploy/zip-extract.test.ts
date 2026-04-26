/**
 * Unit tests for zip-slip protection in extractZipSafe / sanitizeZipEntryPath.
 *
 * Mirrors apps/web/lib/deploy/zip-safety.test.ts in spirit — covers the
 * paths the worker should never accept.
 */
import { describe, it, expect } from 'vitest';
import { sanitizeZipEntryPath } from './zip-extract';

describe('sanitizeZipEntryPath', () => {
  it('accepts simple relative paths', () => {
    expect(sanitizeZipEntryPath('index.html')).toEqual({ ok: true, path: 'index.html' });
    expect(sanitizeZipEntryPath('assets/main.js')).toEqual({ ok: true, path: 'assets/main.js' });
  });

  it('strips leading slashes', () => {
    expect(sanitizeZipEntryPath('/index.html')).toEqual({ ok: true, path: 'index.html' });
    expect(sanitizeZipEntryPath('///foo.js')).toEqual({ ok: true, path: 'foo.js' });
  });

  it('rejects backslashes (Windows separators)', () => {
    expect(sanitizeZipEntryPath('foo\\bar.js')).toEqual({ ok: false });
    expect(sanitizeZipEntryPath('..\\etc\\passwd')).toEqual({ ok: false });
  });

  it('rejects parent-traversal', () => {
    expect(sanitizeZipEntryPath('..')).toEqual({ ok: false });
    expect(sanitizeZipEntryPath('../etc/passwd')).toEqual({ ok: false });
    expect(sanitizeZipEntryPath('foo/../bar')).toEqual({ ok: true, path: 'bar' }); // resolves cleanly
    expect(sanitizeZipEntryPath('foo/../../bar')).toEqual({ ok: false }); // escapes top
  });

  it('rejects empty / pathological inputs', () => {
    expect(sanitizeZipEntryPath('')).toEqual({ ok: false });
    expect(sanitizeZipEntryPath('/')).toEqual({ ok: false });
    expect(sanitizeZipEntryPath('//')).toEqual({ ok: false });
  });

  it('collapses redundant ./ segments', () => {
    expect(sanitizeZipEntryPath('./foo/./bar.js')).toEqual({ ok: true, path: 'foo/bar.js' });
  });
});
