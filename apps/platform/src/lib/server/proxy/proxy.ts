/**
 * P1C — proxy fetch pipeline.
 *
 * The endpoint at `/__shippie/proxy` thinly wraps `executeProxyFetch`.
 * Logic split out for unit testing without a SvelteKit server context.
 *
 * Pipeline:
 *   1. Validate the URL string (`assertSafeUrl`) — scheme, hostname.
 *   2. Resolve the hostname via DoH to one or more IPs.
 *   3. Run `assertSafeIp` on every resolved IP — this is the
 *      rebind guard. If any resolution lands inside a private range
 *      we refuse the fetch entirely.
 *   4. Fetch with manual redirect handling. Each redirect target
 *      goes through steps 1-3 again. Cap at 5 hops total.
 *   5. Refuse the response if its declared `content-type` isn't in
 *      the allow-list, or if the body exceeds 5 MB.
 *   6. Strip Set-Cookie / authorization-shaped headers and pipe the
 *      sanitised response back to the iframe.
 */

import {
  ALLOWED_PROXY_CONTENT_TYPES,
  MAX_PROXY_RESPONSE_BYTES,
  ProxyError,
  assertSafeIp,
  assertSafeUrl,
  parseIpLiteral,
} from './ssrf-guards';

const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 10_000;

/**
 * Headers we strip from the upstream response before piping back.
 * Kept conservative — anything carrying credentials or upstream-
 * authentication state is dropped.
 */
const STRIPPED_RESPONSE_HEADERS = new Set<string>([
  'set-cookie',
  'set-cookie2',
  'authorization',
  'proxy-authorization',
  'www-authenticate',
  'proxy-authenticate',
]);

export interface ProxyFetchOptions {
  /**
   * DNS resolver. Production uses DoH at 1.1.1.1; tests inject a stub.
   * Returns one or more IP literals (string form).
   */
  resolveHostname?: (hostname: string) => Promise<string[]>;
  /**
   * Network fetcher. Default: `globalThis.fetch`. Tests inject a stub
   * that records the call AND returns a controlled Response.
   */
  fetcher?: (url: string, init: RequestInit) => Promise<Response>;
  /**
   * Wall-clock supplier. Used only for the timeout. Tests inject 0.
   */
  now?: () => number;
}

/**
 * Default DoH resolver. Hits Cloudflare's 1.1.1.1 endpoint and parses
 * the JSON answer. Returns A + AAAA records.
 */
export async function resolveViaDoh(hostname: string): Promise<string[]> {
  const types = ['A', 'AAAA'] as const;
  const results: string[] = [];
  for (const t of types) {
    const url = `https://1.1.1.1/dns-query?name=${encodeURIComponent(hostname)}&type=${t}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/dns-json' },
      // DoH itself must NOT be cached by the proxy — every lookup is
      // independent, otherwise we lose rebind protection.
      cf: { cacheTtl: 0 } as unknown as RequestInit['cf'],
    });
    if (!res.ok) continue;
    const body = (await res.json()) as { Answer?: Array<{ data?: string; type?: number }> };
    if (!body.Answer) continue;
    for (const a of body.Answer) {
      if (typeof a.data === 'string') results.push(a.data);
    }
  }
  if (results.length === 0) {
    throw new ProxyError(`Could not resolve hostname ${hostname}.`, 'dns_no_answer', 502);
  }
  return results;
}

export interface ProxyFetchResult {
  status: number;
  headers: Headers;
  body: ReadableStream<Uint8Array> | null;
}

/**
 * Run the full safety + redirect pipeline. Either resolves with a
 * sanitised Response-shaped object the endpoint can pipe back, or
 * throws ProxyError for the endpoint to convert into a status code.
 */
export async function executeProxyFetch(
  rawUrl: string,
  options: ProxyFetchOptions = {},
): Promise<ProxyFetchResult> {
  const resolve = options.resolveHostname ?? resolveViaDoh;
  const fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);

  let url = assertSafeUrl(rawUrl);
  let response: Response | null = null;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    // Hostname IP literals are handled in assertSafeUrl; for real
    // hostnames we DoH-resolve and re-check each address.
    if (!parseIpLiteral(url.hostname)) {
      const resolved = await resolve(url.hostname);
      for (const ip of resolved) {
        const parsed = parseIpLiteral(ip);
        if (!parsed) continue;
        assertSafeIp(parsed);
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      response = await fetcher(url.toString(), {
        method: 'GET',
        // Manual redirect — we want to validate every hop ourselves.
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          // Identify our user agent so origins can refuse politely.
          'User-Agent': 'ShippieProxy/1.0 (+https://shippie.app)',
        },
      });
    } finally {
      clearTimeout(timer);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        throw new ProxyError(
          `Redirect (${response.status}) without Location.`,
          'redirect_no_location',
          502,
        );
      }
      const next = new URL(location, url);
      url = assertSafeUrl(next.toString());
      continue;
    }
    break;
  }

  if (!response) {
    throw new ProxyError('Upstream returned no response.', 'no_response', 502);
  }

  if (response.status >= 300 && response.status < 400) {
    throw new ProxyError(
      `Too many redirects (${MAX_REDIRECTS}).`,
      'too_many_redirects',
      502,
    );
  }

  const contentType = (response.headers.get('content-type') ?? '')
    .split(';')[0]!
    .trim()
    .toLowerCase();
  if (contentType && !ALLOWED_PROXY_CONTENT_TYPES.has(contentType)) {
    throw new ProxyError(
      `Refused content-type ${contentType}.`,
      'content_type_not_allowed',
      415,
    );
  }

  const declaredLength = Number(response.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_PROXY_RESPONSE_BYTES) {
    throw new ProxyError(
      `Body too large (${declaredLength} > ${MAX_PROXY_RESPONSE_BYTES}).`,
      'body_too_large',
      413,
    );
  }

  // Strip credential-shaped headers and surface the rest.
  const safeHeaders = new Headers();
  for (const [name, value] of response.headers.entries()) {
    if (STRIPPED_RESPONSE_HEADERS.has(name.toLowerCase())) continue;
    safeHeaders.set(name, value);
  }

  return {
    status: response.status,
    headers: safeHeaders,
    body: response.body
      ? streamWithSizeCap(response.body, MAX_PROXY_RESPONSE_BYTES)
      : null,
  };
}

/**
 * Wrap a body stream with a hard size cap. As soon as cumulative bytes
 * cross the limit we close the stream — this catches origins that
 * stream more than `content-length` advertised, or omit it entirely.
 */
function streamWithSizeCap(
  source: ReadableStream<Uint8Array>,
  cap: number,
): ReadableStream<Uint8Array> {
  let total = 0;
  const reader = source.getReader();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      if (value) {
        total += value.byteLength;
        if (total > cap) {
          controller.error(
            new ProxyError(`Body exceeded size cap of ${cap} bytes.`, 'body_size_exceeded', 502),
          );
          return;
        }
        controller.enqueue(value);
      }
    },
    cancel(reason) {
      reader.cancel(reason).catch(() => {});
    },
  });
}
