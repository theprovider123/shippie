/**
 * Unit tests for `CfKv` and `CfR2`. We inject a fake `fetch` that
 * captures every request and returns deterministic responses, so the
 * tests are fully hermetic — no Cloudflare credentials required.
 */
import { describe, expect, test } from 'bun:test';
import { CfKv } from './cf-kv.ts';
import { CfR2 } from './cf-r2.ts';

interface CapturedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

function makeFetch(
  responder: (req: CapturedRequest) => { status?: number; body?: string; headers?: Record<string, string> },
): { fetch: typeof fetch; calls: CapturedRequest[] } {
  const calls: CapturedRequest[] = [];
  const fn = (async (input: URL | string | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    const headers: Record<string, string> = {};
    const h = init?.headers ?? {};
    if (h instanceof Headers) {
      h.forEach((v, k) => {
        headers[k.toLowerCase()] = v;
      });
    } else if (Array.isArray(h)) {
      for (const [k, v] of h) headers[String(k).toLowerCase()] = String(v);
    } else {
      for (const k of Object.keys(h)) headers[k.toLowerCase()] = String((h as Record<string, string>)[k]);
    }
    const body = init?.body;
    let bodyStr = '';
    if (typeof body === 'string') bodyStr = body;
    else if (body instanceof Uint8Array) bodyStr = new TextDecoder().decode(body);
    else if (body && body instanceof ArrayBuffer) bodyStr = new TextDecoder().decode(new Uint8Array(body));
    const cap: CapturedRequest = { url, method, headers, body: bodyStr };
    calls.push(cap);

    const r = responder(cap);
    const respHeaders = new Headers(r.headers ?? {});
    if (!respHeaders.has('content-type')) respHeaders.set('content-type', 'text/plain');
    return new Response(r.body ?? '', { status: r.status ?? 200, headers: respHeaders });
  }) as unknown as typeof fetch;
  return { fetch: fn, calls };
}

describe('CfKv', () => {
  const baseCfg = {
    accountId: 'acct-abc',
    namespaceId: 'ns-xyz',
    apiToken: 'token-123',
  };

  test('get: returns body on 200, null on 404', async () => {
    const { fetch, calls } = makeFetch((req) => {
      if (req.url.endsWith('/values/foo')) return { status: 200, body: 'hello' };
      if (req.url.endsWith('/values/missing')) return { status: 404 };
      return { status: 500 };
    });
    const kv = new CfKv({ ...baseCfg, fetchImpl: fetch });
    expect(await kv.get('foo')).toBe('hello');
    expect(await kv.get('missing')).toBeNull();

    const firstUrl = calls[0]!.url;
    expect(firstUrl).toContain('/accounts/acct-abc/storage/kv/namespaces/ns-xyz/values/foo');
    expect(calls[0]!.headers['authorization']).toBe('Bearer token-123');
  });

  test('put: uses PUT + bearer + forwards TTL', async () => {
    const { fetch, calls } = makeFetch(() => ({ status: 200 }));
    const kv = new CfKv({ ...baseCfg, fetchImpl: fetch });
    await kv.put('k1', 'v1', { expirationTtl: 60 });
    expect(calls[0]!.method).toBe('PUT');
    expect(calls[0]!.url).toContain('/values/k1');
    expect(calls[0]!.url).toContain('expiration_ttl=60');
    expect(calls[0]!.headers['authorization']).toBe('Bearer token-123');
    expect(calls[0]!.body).toBe('v1');
  });

  test('delete: tolerates 404', async () => {
    const { fetch } = makeFetch(() => ({ status: 404 }));
    const kv = new CfKv({ ...baseCfg, fetchImpl: fetch });
    await kv.delete('missing');
  });

  test('put: throws on 4xx with API error surfaced', async () => {
    const { fetch } = makeFetch(() => ({ status: 403, body: 'forbidden' }));
    const kv = new CfKv({ ...baseCfg, fetchImpl: fetch });
    await expect(kv.put('k', 'v')).rejects.toThrow(/403/);
  });

  test('retries once on 5xx then succeeds', async () => {
    let n = 0;
    const { fetch, calls } = makeFetch(() => {
      n += 1;
      if (n === 1) return { status: 500, body: 'boom' };
      return { status: 200, body: 'ok' };
    });
    const kv = new CfKv({ ...baseCfg, fetchImpl: fetch });
    expect(await kv.get('foo')).toBe('ok');
    expect(calls.length).toBe(2);
  });

  test('list: paginates through cursor', async () => {
    let page = 0;
    const { fetch } = makeFetch(() => {
      page += 1;
      if (page === 1) {
        return {
          status: 200,
          body: JSON.stringify({
            success: true,
            result: [{ name: 'a' }, { name: 'b' }],
            result_info: { cursor: 'CUR1' },
          }),
        };
      }
      return {
        status: 200,
        body: JSON.stringify({
          success: true,
          result: [{ name: 'c' }],
          result_info: {},
        }),
      };
    });
    const kv = new CfKv({ ...baseCfg, fetchImpl: fetch });
    expect(await kv.list('apps:')).toEqual(['a', 'b', 'c']);
  });

  test('constructor rejects missing config', () => {
    expect(() => new CfKv({ accountId: '', namespaceId: 'n', apiToken: 't' })).toThrow();
    expect(() => new CfKv({ accountId: 'a', namespaceId: '', apiToken: 't' })).toThrow();
    expect(() => new CfKv({ accountId: 'a', namespaceId: 'n', apiToken: '' })).toThrow();
  });
});

describe('CfR2', () => {
  const baseCfg = {
    accountId: 'acct-abc',
    accessKeyId: 'AKIA_TEST',
    secretAccessKey: 'SECRET_TEST',
    bucket: 'shippie-apps',
  };

  test('put: single PUT for small objects, signed and content-typed', async () => {
    const { fetch, calls } = makeFetch(() => ({ status: 200 }));
    const r2 = new CfR2({ ...baseCfg, fetchImpl: fetch });
    await r2.put('apps/recipes/v1/index.html', new TextEncoder().encode('<html></html>'));
    expect(calls.length).toBe(1);
    expect(calls[0]!.method).toBe('PUT');
    expect(calls[0]!.url).toContain('acct-abc.r2.cloudflarestorage.com/shippie-apps/apps/recipes/v1/index.html');
    expect(calls[0]!.headers['content-type']).toMatch(/text\/html/);
    expect(calls[0]!.headers['authorization']).toMatch(/^AWS4-HMAC-SHA256 /);
    expect(calls[0]!.headers['x-amz-content-sha256']).toMatch(/^[0-9a-f]{64}$/);
    expect(calls[0]!.headers['x-amz-date']).toMatch(/^\d{8}T\d{6}Z$/);
  });

  test('put: multipart path for large objects (>threshold)', async () => {
    const calls: CapturedRequest[] = [];
    const { fetch } = makeFetch((req) => {
      calls.push(req);
      if (req.method === 'POST' && req.url.includes('uploads=') && !req.url.includes('uploadId')) {
        return {
          status: 200,
          body: '<InitiateMultipartUploadResult><UploadId>UP_ID_42</UploadId></InitiateMultipartUploadResult>',
        };
      }
      if (req.method === 'PUT' && req.url.includes('partNumber=')) {
        const m = /partNumber=(\d+)/.exec(req.url);
        return {
          status: 200,
          headers: { etag: `"etag-${m![1]}"` },
        };
      }
      if (req.method === 'POST' && req.url.includes('uploadId=')) {
        return { status: 200, body: '<CompleteMultipartUploadResult/>' };
      }
      return { status: 500, body: 'unexpected' };
    });
    // Small threshold/part-size so the test doesn't need to allocate
    // megabytes of RAM in CI — the control flow is identical.
    const r2 = new CfR2({
      ...baseCfg,
      fetchImpl: fetch,
      multipartThreshold: 10,
      multipartPartSize: 8,
    });
    const data = new Uint8Array(25);
    for (let i = 0; i < data.length; i++) data[i] = i;
    await r2.put('big.bin', data);

    // init + 4 parts (8+8+8+1) + complete
    expect(calls.length).toBe(6);
    expect(calls[0]!.url).toContain('uploads=');
    // Each UploadPart URL threads the upload id through.
    expect(calls[1]!.url).toContain('uploadId=UP_ID_42');
    expect(calls[1]!.url).toContain('partNumber=1');
    // CompleteMultipartUpload body lists parts in order with their ETags.
    expect(calls[5]!.method).toBe('POST');
    expect(calls[5]!.url).toContain('uploadId=UP_ID_42');
    expect(calls[5]!.body).toContain('<PartNumber>1</PartNumber>');
    expect(calls[5]!.body).toContain('<PartNumber>4</PartNumber>');
    expect(calls[5]!.body).toContain('etag-1');
    expect(calls[5]!.body).toContain('etag-4');
  });

  test('put: multipart aborts on part failure', async () => {
    const { fetch, calls } = makeFetch((req) => {
      if (req.method === 'POST' && req.url.includes('uploads=') && !req.url.includes('uploadId')) {
        return {
          status: 200,
          body: '<Result><UploadId>U1</UploadId></Result>',
        };
      }
      if (req.method === 'PUT' && req.url.includes('partNumber=1')) {
        return { status: 200, headers: { etag: '"e1"' } };
      }
      if (req.method === 'PUT' && req.url.includes('partNumber=2')) {
        return { status: 500, body: 'nope' };
      }
      if (req.method === 'DELETE' && req.url.includes('uploadId=')) {
        return { status: 204 };
      }
      return { status: 500 };
    });
    const r2 = new CfR2({
      ...baseCfg,
      fetchImpl: fetch,
      multipartThreshold: 5,
      multipartPartSize: 5,
    });
    const data = new Uint8Array(12);
    await expect(r2.put('fail.bin', data)).rejects.toThrow(/part 2/);
    // Must have issued an abort DELETE
    expect(calls.some((c) => c.method === 'DELETE' && c.url.includes('uploadId='))).toBe(true);
  });

  test('get: returns R2Object with body/text/json', async () => {
    const { fetch } = makeFetch(() => ({
      status: 200,
      body: '{"hello":"world"}',
      headers: { 'content-type': 'application/json' },
    }));
    const r2 = new CfR2({ ...baseCfg, fetchImpl: fetch });
    const obj = await r2.get('foo.json');
    expect(obj).not.toBeNull();
    expect(await obj!.text()).toBe('{"hello":"world"}');
    expect(await obj!.json()).toEqual({ hello: 'world' });
    expect(obj!.httpMetadata?.contentType).toBe('application/json');
  });

  test('get: returns null on 404', async () => {
    const { fetch } = makeFetch(() => ({ status: 404 }));
    const r2 = new CfR2({ ...baseCfg, fetchImpl: fetch });
    expect(await r2.get('missing')).toBeNull();
  });

  test('head: returns size + metadata', async () => {
    const { fetch } = makeFetch(() => ({
      status: 200,
      headers: { 'content-length': '42', 'content-type': 'image/png' },
    }));
    const r2 = new CfR2({ ...baseCfg, fetchImpl: fetch });
    const head = await r2.head('icons/foo.png');
    expect(head?.size).toBe(42);
    expect(head?.httpMetadata?.contentType).toBe('image/png');
  });

  test('delete: signs DELETE, tolerates 404', async () => {
    const { fetch, calls } = makeFetch(() => ({ status: 404 }));
    const r2 = new CfR2({ ...baseCfg, fetchImpl: fetch });
    await r2.delete('gone');
    expect(calls[0]!.method).toBe('DELETE');
  });

  test('list: paginates via continuation-token', async () => {
    let page = 0;
    const { fetch } = makeFetch(() => {
      page += 1;
      if (page === 1) {
        return {
          status: 200,
          body:
            '<ListBucketResult>' +
            '<Contents><Key>a</Key></Contents>' +
            '<Contents><Key>b</Key></Contents>' +
            '<IsTruncated>true</IsTruncated>' +
            '<NextContinuationToken>NEXT1</NextContinuationToken>' +
            '</ListBucketResult>',
        };
      }
      return {
        status: 200,
        body:
          '<ListBucketResult>' +
          '<Contents><Key>c</Key></Contents>' +
          '<IsTruncated>false</IsTruncated>' +
          '</ListBucketResult>',
      };
    });
    const r2 = new CfR2({ ...baseCfg, fetchImpl: fetch });
    expect(await r2.list('apps/')).toEqual(['a', 'b', 'c']);
  });
});
