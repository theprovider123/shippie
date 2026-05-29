import { describe, expect, it, vi } from 'vitest';
import {
  ingestIcon,
  ingestedIconPath,
  isIngestableIconUrl,
  validateIconResponse,
  MAX_ICON_BYTES,
} from './ingest';

describe('isIngestableIconUrl', () => {
  it('accepts https URLs', () => {
    expect(isIngestableIconUrl('https://cdn.example.com/a.png')).toBe(true);
  });
  it('rejects http (mixed content / tracking beacon)', () => {
    expect(isIngestableIconUrl('http://example.com/a.png')).toBe(false);
  });
  it('rejects already-ingested same-origin paths', () => {
    expect(isIngestableIconUrl('/__shippie/app-icons/a1/icon.png')).toBe(false);
  });
  it('rejects junk', () => {
    expect(isIngestableIconUrl('not a url')).toBe(false);
    expect(isIngestableIconUrl(null)).toBe(false);
  });
});

describe('validateIconResponse', () => {
  it('accepts png/webp/jpeg', () => {
    expect(validateIconResponse('image/png', 1000)).toEqual({ ok: true, ext: 'png', contentType: 'image/png' });
    expect(validateIconResponse('image/webp', 1000)).toMatchObject({ ok: true, ext: 'webp' });
    expect(validateIconResponse('image/jpeg; charset=binary', 1000)).toMatchObject({ ok: true, ext: 'jpg' });
  });
  it('defers SVG', () => {
    expect(validateIconResponse('image/svg+xml', 100)).toEqual({ ok: false, reason: 'svg_not_supported' });
  });
  it('rejects other types, empty, and oversized', () => {
    expect(validateIconResponse('image/gif', 100)).toEqual({ ok: false, reason: 'unsupported_type' });
    expect(validateIconResponse('image/png', 0)).toEqual({ ok: false, reason: 'empty' });
    expect(validateIconResponse('image/png', MAX_ICON_BYTES + 1)).toEqual({ ok: false, reason: 'too_large' });
  });
});

describe('ingestIcon', () => {
  function fakeR2() {
    const puts: Array<{ key: string; opts: unknown }> = [];
    return {
      r2: {
        put: vi.fn(async (key: string, _body: unknown, opts: unknown) => {
          puts.push({ key, opts });
        }),
      } as never,
      puts,
    };
  }

  it('rejects non-https before fetching', async () => {
    const { r2 } = fakeR2();
    const fetchImpl = vi.fn();
    const result = await ingestIcon({ r2, appId: 'a1', url: 'http://x/a.png', fetchImpl: fetchImpl as never });
    expect(result).toEqual({ ok: false, reason: 'must_be_https' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fetches, validates, stores in R2, returns a same-origin URL', async () => {
    const { r2, puts } = fakeR2();
    const fetchImpl = vi.fn(
      async () => new Response(new Uint8Array([1, 2, 3, 4]), { status: 200, headers: { 'content-type': 'image/png' } }),
    );
    const result = await ingestIcon({ r2, appId: 'a1', url: 'https://cdn.example.com/logo.png', fetchImpl: fetchImpl as never });
    expect(result).toMatchObject({ ok: true, url: ingestedIconPath('a1', 'png'), contentType: 'image/png' });
    expect(puts).toHaveLength(1);
    expect(puts[0].key).toBe('app-icons/a1/icon.png');
  });

  it('rejects an SVG response (deferred) without storing', async () => {
    const { r2, puts } = fakeR2();
    const fetchImpl = vi.fn(
      async () => new Response('<svg/>', { status: 200, headers: { 'content-type': 'image/svg+xml' } }),
    );
    const result = await ingestIcon({ r2, appId: 'a1', url: 'https://x/a.svg', fetchImpl: fetchImpl as never });
    expect(result).toEqual({ ok: false, reason: 'svg_not_supported' });
    expect(puts).toHaveLength(0);
  });
});
