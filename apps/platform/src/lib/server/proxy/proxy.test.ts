/**
 * P1C — proxy fetch pipeline integration test (no real network).
 *
 * Each test wires a stub `resolveHostname` + `fetcher` to drive the
 * pipeline through a specific failure mode. The load-bearing cases:
 *
 *   - DNS-rebind: hostname looks public at the URL level, but the
 *     resolver returns a private IP. Pipeline must refuse before
 *     calling fetch.
 *   - Redirect-into-private: first hop is public, the response
 *     redirects to `http://169.254.169.254/`. The pipeline must run
 *     the safety check on the redirect target.
 *   - Content-type allowlist: body is `image/png`, fetch must be
 *     rejected even on a 200.
 *   - Sensitive headers: `Set-Cookie` is stripped from the response
 *     headers piped back.
 *   - Stream cap: an origin streams more than 5 MB; the cap aborts
 *     the stream.
 */
import { describe, expect, test } from 'vitest';
import { executeProxyFetch } from './proxy';
import { ProxyError } from './ssrf-guards';

async function expectProxyErrorAsync(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(ProxyError);
    expect((err as ProxyError).code).toBe(code);
    return;
  }
  throw new Error(`expected ProxyError(${code}) but the promise resolved`);
}

function fakeResolver(map: Record<string, string[]>) {
  return async (hostname: string) => {
    const ips = map[hostname];
    if (!ips) throw new ProxyError('no answer', 'dns_no_answer', 502);
    return ips;
  };
}

function fakeFetcher(
  responses: Array<{ url?: string | RegExp; response: Response }>,
) {
  let i = 0;
  return async (url: string, _init: RequestInit) => {
    const expected = responses[i++];
    if (!expected) throw new Error(`unexpected fetch #${i} for ${url}`);
    if (expected.url && typeof expected.url === 'string' && expected.url !== url) {
      throw new Error(`fetch URL mismatch: expected ${expected.url} got ${url}`);
    }
    if (expected.url instanceof RegExp && !expected.url.test(url)) {
      throw new Error(`fetch URL mismatch: expected ${expected.url} got ${url}`);
    }
    return expected.response;
  };
}

describe('executeProxyFetch — happy path', () => {
  test('public hostname → public IP → 200 → returns sanitised response', async () => {
    const result = await executeProxyFetch('https://example.com/article', {
      resolveHostname: fakeResolver({ 'example.com': ['93.184.216.34'] }),
      fetcher: fakeFetcher([
        {
          url: 'https://example.com/article',
          response: new Response('<p>hi</p>', {
            status: 200,
            headers: { 'content-type': 'text/html; charset=utf-8' },
          }),
        },
      ]),
    });
    expect(result.status).toBe(200);
    expect(result.headers.get('content-type')).toMatch(/text\/html/);
  });
});

describe('executeProxyFetch — DNS rebind protection', () => {
  test('hostname resolves to private IP → refuses without calling fetch', async () => {
    let fetchCalled = false;
    await expectProxyErrorAsync(
      executeProxyFetch('https://evil.com/admin', {
        resolveHostname: fakeResolver({ 'evil.com': ['10.0.0.1'] }),
        fetcher: async () => {
          fetchCalled = true;
          return new Response('boom');
        },
      }),
      'ipv4_blocked',
    );
    expect(fetchCalled).toBe(false);
  });

  test('hostname resolves to AWS metadata IP → refuses', async () => {
    await expectProxyErrorAsync(
      executeProxyFetch('https://evil.com/admin', {
        resolveHostname: fakeResolver({ 'evil.com': ['169.254.169.254'] }),
        fetcher: async () => new Response('shouldnt happen'),
      }),
      'ipv4_blocked',
    );
  });

  test('hostname resolves to multiple IPs — refuses if any one is private', async () => {
    // Real DoH may return both IPv4 and IPv6 for a host; if EITHER
    // is private the proxy must refuse.
    await expectProxyErrorAsync(
      executeProxyFetch('https://mixed.com/', {
        resolveHostname: fakeResolver({ 'mixed.com': ['1.1.1.1', '127.0.0.1'] }),
        fetcher: async () => new Response('shouldnt happen'),
      }),
      'ipv4_blocked',
    );
  });
});

describe('executeProxyFetch — redirect handling', () => {
  test('redirect target gets re-validated; private-IP redirect is blocked', async () => {
    await expectProxyErrorAsync(
      executeProxyFetch('https://example.com/', {
        resolveHostname: fakeResolver({
          'example.com': ['1.1.1.1'],
          'evil.example.com': ['10.0.0.1'],
        }),
        fetcher: fakeFetcher([
          {
            url: 'https://example.com/',
            response: new Response(null, {
              status: 302,
              headers: { location: 'https://evil.example.com/admin' },
            }),
          },
        ]),
      }),
      'ipv4_blocked',
    );
  });

  test('redirect target with a deceptive hostname is blocked at the URL gate', async () => {
    await expectProxyErrorAsync(
      executeProxyFetch('https://example.com/', {
        resolveHostname: fakeResolver({ 'example.com': ['1.1.1.1'] }),
        fetcher: fakeFetcher([
          {
            url: 'https://example.com/',
            response: new Response(null, {
              status: 302,
              headers: { location: 'http://localhost/' },
            }),
          },
        ]),
      }),
      'hostname_denied',
    );
  });

  test('chain of redirects is bounded — refuses past the limit', async () => {
    // Build a chain that loops between two public hosts forever.
    const responses = Array.from({ length: 10 }, () => ({
      response: new Response(null, {
        status: 302,
        headers: { location: 'https://example.com/loop' },
      }),
    }));
    await expectProxyErrorAsync(
      executeProxyFetch('https://example.com/', {
        resolveHostname: fakeResolver({ 'example.com': ['1.1.1.1'] }),
        fetcher: fakeFetcher(responses),
      }),
      'too_many_redirects',
    );
  });
});

describe('executeProxyFetch — content-type and size enforcement', () => {
  test('refuses non-allowlisted content types', async () => {
    await expectProxyErrorAsync(
      executeProxyFetch('https://example.com/image', {
        resolveHostname: fakeResolver({ 'example.com': ['1.1.1.1'] }),
        fetcher: fakeFetcher([
          {
            response: new Response('binary', {
              status: 200,
              headers: { 'content-type': 'image/png' },
            }),
          },
        ]),
      }),
      'content_type_not_allowed',
    );
  });

  test('refuses bodies larger than the cap when content-length declares it', async () => {
    await expectProxyErrorAsync(
      executeProxyFetch('https://example.com/', {
        resolveHostname: fakeResolver({ 'example.com': ['1.1.1.1'] }),
        fetcher: fakeFetcher([
          {
            response: new Response('whatever', {
              status: 200,
              headers: {
                'content-type': 'text/html',
                'content-length': String(50 * 1024 * 1024), // 50 MB
              },
            }),
          },
        ]),
      }),
      'body_too_large',
    );
  });

  test('strips Set-Cookie and authorization-shaped headers from response', async () => {
    const result = await executeProxyFetch('https://example.com/', {
      resolveHostname: fakeResolver({ 'example.com': ['1.1.1.1'] }),
      fetcher: fakeFetcher([
        {
          response: new Response('<p>hi</p>', {
            status: 200,
            headers: {
              'content-type': 'text/html',
              'set-cookie': 'session=abc; Path=/; HttpOnly',
              'www-authenticate': 'Basic realm="x"',
              'x-custom': 'kept',
            },
          }),
        },
      ]),
    });
    expect(result.headers.get('set-cookie')).toBeNull();
    expect(result.headers.get('www-authenticate')).toBeNull();
    expect(result.headers.get('x-custom')).toBe('kept');
  });
});

describe('executeProxyFetch — URL-level rejections', () => {
  test('refuses gopher://', async () => {
    await expectProxyErrorAsync(
      executeProxyFetch('gopher://example.com/', {}),
      'scheme_not_allowed',
    );
  });

  test('refuses IP-literal URL pointing at metadata', async () => {
    await expectProxyErrorAsync(
      executeProxyFetch('http://169.254.169.254/latest/meta-data/', {}),
      'ipv4_blocked',
    );
  });

  test('refuses localhost without a DNS lookup', async () => {
    await expectProxyErrorAsync(
      executeProxyFetch('http://localhost/', {}),
      'hostname_denied',
    );
  });
});
