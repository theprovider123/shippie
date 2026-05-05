/**
 * Unit tests for the esm.sh body rewriter and the proxy entry point.
 *
 * The rewriter is the load-bearing piece: if absolute imports leak
 * through unrewritten, the runtime escapes our zone on first parse and
 * the whole self-host story collapses. The fetch wrapper is exercised
 * with a stub fetcher so we never hit the network.
 */
import { describe, expect, test } from 'vitest';
import { proxyEsmRequest, rewriteEsmBody } from './esm-proxy';

describe('rewriteEsmBody', () => {
  test('rewrites `from "/path"` static imports', () => {
    const before = 'export * from "/@huggingface/transformers@3.0.0/es2022/transformers.mjs";';
    const after = rewriteEsmBody(before);
    expect(after).toBe(
      'export * from "/__esm/@huggingface/transformers@3.0.0/es2022/transformers.mjs";',
    );
  });

  test('rewrites side-effect imports without a `from` clause', () => {
    const before = 'import "/node/buffer.mjs"; import "/node/process.mjs";';
    const after = rewriteEsmBody(before);
    expect(after).toBe('import "/__esm/node/buffer.mjs"; import "/__esm/node/process.mjs";');
  });

  test('rewrites dynamic imports with absolute paths', () => {
    const before = 'const m = await import("/v135/onnxruntime-web@1.20.0/wasm/ort.wasm");';
    const after = rewriteEsmBody(before);
    expect(after).toBe(
      'const m = await import("/__esm/v135/onnxruntime-web@1.20.0/wasm/ort.wasm");',
    );
  });

  test('does not double-prefix paths already under /__esm/', () => {
    const before = 'import "/__esm/already/wrapped.mjs";';
    expect(rewriteEsmBody(before)).toBe(before);
  });

  test('leaves relative imports untouched', () => {
    const before = 'import "./relative.mjs"; import "../sibling.mjs";';
    expect(rewriteEsmBody(before)).toBe(before);
  });

  test('handles single quotes', () => {
    const before = "from '/x/y.mjs'";
    expect(rewriteEsmBody(before)).toBe("from '/__esm/x/y.mjs'");
  });

  test('handles import with whitespace inside parens', () => {
    const before = 'await import( "/dyn/path.mjs" )';
    expect(rewriteEsmBody(before)).toBe('await import( "/__esm/dyn/path.mjs" )');
  });
});

describe('proxyEsmRequest', () => {
  test('proxies a JS body with rewritten imports and immutable cache headers', async () => {
    const upstreamJs = 'import "/node/buffer.mjs";\nexport * from "/@huggingface/transformers@3.0.0/es2022/transformers.mjs";';
    const fetcher = (async (input: unknown) => {
      expect(String(input)).toBe('https://esm.sh/@huggingface/transformers@3.0.0');
      return new Response(upstreamJs, {
        status: 200,
        headers: { 'content-type': 'application/javascript; charset=utf-8' },
      });
    }) as typeof fetch;
    const res = await proxyEsmRequest('@huggingface/transformers@3.0.0', '', { fetcher });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    const body = await res.text();
    expect(body).toContain('"/__esm/node/buffer.mjs"');
    expect(body).toContain('"/__esm/@huggingface/transformers@3.0.0/es2022/transformers.mjs"');
  });

  test('streams non-JS bodies through unmodified', async () => {
    const wasmBytes = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
    const fetcher = (async () =>
      new Response(wasmBytes, {
        status: 200,
        headers: { 'content-type': 'application/wasm' },
      })) as typeof fetch;
    const res = await proxyEsmRequest('v135/onnxruntime-web@1.20.0/wasm/ort.wasm', '', { fetcher });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/wasm');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(wasmBytes);
  });

  test('passes through upstream non-200 responses', async () => {
    const fetcher = (async () => new Response('not found', { status: 404 })) as typeof fetch;
    const res = await proxyEsmRequest('does/not/exist', '', { fetcher });
    expect(res.status).toBe(404);
  });

  test('returns 502 when the upstream fetch throws', async () => {
    const fetcher = (async () => {
      throw new Error('network down');
    }) as typeof fetch;
    const res = await proxyEsmRequest('@huggingface/transformers@3.0.0', '', { fetcher });
    expect(res.status).toBe(502);
  });

  test('preserves query strings on the upstream URL', async () => {
    let seenUrl = '';
    const fetcher = (async (input: unknown) => {
      seenUrl = String(input);
      return new Response('export {};', {
        status: 200,
        headers: { 'content-type': 'application/javascript' },
      });
    }) as typeof fetch;
    await proxyEsmRequest('@huggingface/transformers@3.0.0', '?bundle&deps=onnxruntime-web@1.20.0', {
      fetcher,
    });
    expect(seenUrl).toBe(
      'https://esm.sh/@huggingface/transformers@3.0.0?bundle&deps=onnxruntime-web@1.20.0',
    );
  });
});
