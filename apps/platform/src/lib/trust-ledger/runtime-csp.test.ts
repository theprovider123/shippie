import { describe, expect, it } from 'vitest';
import { buildShippieRuntimeCsp, parseDirectives, withShippieRuntimeCsp } from './runtime-csp';

describe('buildShippieRuntimeCsp', () => {
  it('emits stable directive order and content', () => {
    const csp = buildShippieRuntimeCsp();
    const map = parseDirectives(csp);
    expect(map.get('default-src')).toBe("'self'");
    expect(map.get('object-src')).toBe("'none'");
    expect(map.get('base-uri')).toBe("'none'");
  });

  it('restricts connect-src to bridge-mediated and signal paths only', () => {
    const map = parseDirectives(buildShippieRuntimeCsp());
    const connectSrc = map.get('connect-src')!;
    // 'self' covers /__shippie/proxy, /__esm/*, /__shippie/signal
    expect(connectSrc).toContain("'self'");
    expect(connectSrc).toContain('wss://shippie.app');
    expect(connectSrc).toContain('wss://*.shippie.app');
    // Must NOT allow arbitrary external https hosts.
    expect(connectSrc).not.toContain('https://*');
    expect(connectSrc.includes(' https:')).toBe(false);
  });

  it('frame-ancestors lets the container shell embed showcase iframes', () => {
    const map = parseDirectives(buildShippieRuntimeCsp());
    expect(map.get('frame-ancestors')).toContain('shippie.app');
  });

  it('forbids object embedding entirely', () => {
    const map = parseDirectives(buildShippieRuntimeCsp());
    expect(map.get('object-src')).toBe("'none'");
  });
});

describe('withShippieRuntimeCsp', () => {
  it('attaches the CSP header to a successful response without re-encoding the body', async () => {
    const original = new Response('hello', {
      status: 200,
      headers: { 'content-type': 'text/html', 'cache-control': 'max-age=60' },
    });
    const wrapped = withShippieRuntimeCsp(original);
    expect(wrapped.headers.get('content-security-policy')).toBe(buildShippieRuntimeCsp());
    expect(wrapped.headers.get('cache-control')).toBe('max-age=60');
    expect(wrapped.headers.get('content-type')).toBe('text/html');
    expect(await wrapped.text()).toBe('hello');
  });

  it('does not override an existing CSP header (defence-in-depth for arcade)', () => {
    const original = new Response('hello', {
      status: 200,
      headers: { 'content-security-policy': "default-src 'none'" },
    });
    const wrapped = withShippieRuntimeCsp(original);
    expect(wrapped.headers.get('content-security-policy')).toBe("default-src 'none'");
  });

  it('passes through error responses unchanged', () => {
    const original = new Response('not found', { status: 404 });
    const wrapped = withShippieRuntimeCsp(original);
    expect(wrapped.headers.get('content-security-policy')).toBeNull();
  });
});
