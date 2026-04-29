/**
 * P1C — SSRF guard invariants for the proxy.
 *
 * The plan's threat model: an iframe asks the proxy to fetch
 * `http://169.254.169.254/latest/meta-data/` (AWS metadata) or
 * `http://10.0.0.1/admin` (RFC1918 private), tries DNS rebinding
 * (`evil.com` resolves first to a public IP, then to a private IP on
 * the second lookup), or feeds the proxy a `gopher://` URL.
 *
 * Every block-list entry from the plan is exercised here, plus the
 * "deceptive hostname" surface (`localhost.localdomain`, `metadata`,
 * `*.local`) that's well-known to be the rebind angle of attack.
 */
import { describe, expect, test } from 'vitest';
import {
  assertSafeIp,
  assertSafeUrl,
  isDeniedHostname,
  parseIpLiteral,
  ProxyError,
} from './ssrf-guards';

function expectProxyError(fn: () => unknown, code: string): void {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(ProxyError);
    expect((err as ProxyError).code).toBe(code);
    return;
  }
  throw new Error(`expected ProxyError(${code}) but no error was thrown`);
}

describe('assertSafeUrl — scheme + hostname checks', () => {
  test('accepts plain https public hostnames', () => {
    expect(() => assertSafeUrl('https://example.com/article')).not.toThrow();
    expect(() => assertSafeUrl('https://news.ycombinator.com/item?id=1')).not.toThrow();
  });

  test('rejects non-http(s) schemes outright', () => {
    expect(() => assertSafeUrl('file:///etc/passwd')).toThrow(ProxyError);
    expect(() => assertSafeUrl('gopher://x.example.com/')).toThrow(ProxyError);
    expect(() => assertSafeUrl('javascript:alert(1)')).toThrow(ProxyError);
    expect(() => assertSafeUrl('data:text/html,...')).toThrow(ProxyError);
  });

  test('rejects malformed URLs', () => {
    expect(() => assertSafeUrl('not a url')).toThrow(ProxyError);
    expect(() => assertSafeUrl('')).toThrow(ProxyError);
  });

  test('rejects deceptive hostnames before any DNS lookup', () => {
    expectProxyError(() => assertSafeUrl('http://localhost/'), 'hostname_denied');
    expectProxyError(() => assertSafeUrl('http://localhost.localdomain/'), 'hostname_denied');
    expectProxyError(() => assertSafeUrl('http://router.local/'), 'hostname_denied');
    expectProxyError(() => assertSafeUrl('http://printer.lan/'), 'hostname_denied');
    expectProxyError(() => assertSafeUrl('http://service.internal/'), 'hostname_denied');
    expectProxyError(() => assertSafeUrl('http://metadata/'), 'hostname_denied');
    expectProxyError(() => assertSafeUrl('http://metadata.google.internal/'), 'hostname_denied');
  });

  test('rejects IPv4 literals that decode to AWS metadata', () => {
    // 169.254.169.254 is THE AWS metadata IP and the canonical SSRF
    // sentinel; it's link-local so 169.254.0.0/16 catches the entire
    // family of metadata abuses.
    expectProxyError(
      () => assertSafeUrl('http://169.254.169.254/latest/meta-data/'),
      'ipv4_blocked',
    );
  });

  test('rejects IPv4 literals in every reserved range from the plan', () => {
    const blocked = [
      '0.0.0.0',
      '10.0.0.1',
      '127.0.0.1',
      '127.42.42.42', // anywhere in 127/8
      '169.254.0.1',
      '169.254.169.254',
      '172.16.0.1',
      '172.31.255.255',
      '192.0.0.1',
      '192.168.1.1',
      '198.18.0.1',
      '198.19.255.255',
      '224.0.0.1', // multicast
      '240.0.0.1', // reserved
      '255.255.255.255', // broadcast
      '100.64.0.1', // CGNAT
    ];
    for (const ip of blocked) {
      expectProxyError(() => assertSafeUrl(`http://${ip}/`), 'ipv4_blocked');
    }
  });

  test('accepts IPv4 literals on public ranges', () => {
    // 1.1.1.1 (Cloudflare) and 8.8.8.8 (Google DNS) — public, not blocked.
    expect(() => assertSafeUrl('https://1.1.1.1/')).not.toThrow();
    expect(() => assertSafeUrl('https://8.8.8.8/')).not.toThrow();
  });

  test('rejects IPv6 literals in reserved ranges', () => {
    const blocked = [
      '::1', // loopback
      'fc00::1', // ULA
      'fd12:3456:789a::1', // ULA
      'fe80::1', // link-local
      '2001:db8::1', // documentation
      'ff02::1', // multicast
    ];
    for (const ip of blocked) {
      try {
        assertSafeUrl(`http://[${ip}]/`);
        throw new Error(`expected refusal for ${ip}`);
      } catch (err) {
        expect(err).toBeInstanceOf(ProxyError);
        expect((err as ProxyError).code).toMatch(/^(ipv4|ipv6)_blocked$/);
      }
    }
  });

  test('IPv4-mapped IPv6 addresses are blocked at the assertSafeIp gate', () => {
    // URL parsers normalise `[::ffff:127.0.0.1]` so URL-level testing
    // can't reach this path reliably across runtimes; the proxy runs
    // assertSafeIp on every DoH-resolved IP, which is where the
    // mapped-form attack would actually surface.
    expectProxyError(() => assertSafeIp(parseIpLiteral('::ffff:127.0.0.1')!), 'ipv6_blocked');
    expectProxyError(
      () => assertSafeIp(parseIpLiteral('::ffff:169.254.169.254')!),
      'ipv6_blocked',
    );
  });
});

describe('assertSafeIp — used per resolved IP for rebind protection', () => {
  test('catches a private IP returned at fetch-time even if hostname looked clean', () => {
    // Simulates what the proxy does after DoH: takes the resolved IP
    // and checks it before calling fetch with the IP pinned.
    expectProxyError(() => assertSafeIp(parseIpLiteral('10.0.0.1')!), 'ipv4_blocked');
    expectProxyError(() => assertSafeIp(parseIpLiteral('169.254.169.254')!), 'ipv4_blocked');
    expectProxyError(() => assertSafeIp(parseIpLiteral('::1')!), 'ipv6_blocked');
  });

  test('lets public IPs through', () => {
    expect(() => assertSafeIp(parseIpLiteral('1.1.1.1')!)).not.toThrow();
    expect(() => assertSafeIp(parseIpLiteral('2606:4700:4700::1111')!)).not.toThrow();
  });
});

describe('parseIpLiteral — distinguishes IPs from hostnames', () => {
  test('parses dotted-quad IPv4', () => {
    expect(parseIpLiteral('192.168.1.1')).toEqual({
      kind: 'ipv4',
      canonical: '192.168.1.1',
      octets: [192, 168, 1, 1],
    });
  });

  test('rejects malformed IPv4 octets', () => {
    expect(parseIpLiteral('999.0.0.0')).toBeNull();
    expect(parseIpLiteral('1.2.3')).toBeNull();
    expect(parseIpLiteral('1.2.3.4.5')).toBeNull();
    expect(parseIpLiteral('not.an.ip.really')).toBeNull();
  });

  test('parses IPv6 literals (with bracket stripping)', () => {
    const v = parseIpLiteral('[::1]');
    expect(v?.kind).toBe('ipv6');
    expect(v?.canonical).toBe('::1');
  });

  test('returns null for plain hostnames', () => {
    expect(parseIpLiteral('example.com')).toBeNull();
    expect(parseIpLiteral('news.ycombinator.com')).toBeNull();
  });
});

describe('isDeniedHostname — string-level deny list', () => {
  test('matches exact denylist entries', () => {
    expect(isDeniedHostname('localhost')).toBe(true);
    expect(isDeniedHostname('metadata')).toBe(true);
  });

  test('matches deny suffixes case-insensitively', () => {
    expect(isDeniedHostname('PRINTER.LOCAL')).toBe(true);
    expect(isDeniedHostname('foo.internal')).toBe(true);
  });

  test('lets plain public hostnames through', () => {
    expect(isDeniedHostname('example.com')).toBe(false);
    expect(isDeniedHostname('a.b.c.example.com')).toBe(false);
  });
});
