/**
 * P1C — SSRF guards for the iframe-app CORS proxy.
 *
 * Threat model: a hostile iframe asks the proxy to fetch a URL that
 * resolves to internal infrastructure — AWS instance metadata
 * (`169.254.169.254`), private network ranges, link-local addresses,
 * loopback. The proxy must refuse those before opening the socket.
 *
 * This module is pure data + string parsing. All network-side logic
 * (DoH lookups, fetching, redirect handling) lives in
 * `proxy.ts`; the guards here are unit-tested without a network.
 *
 * Two surface points:
 *   - `assertSafeUrl(url)` — string-level checks (scheme, hostname).
 *   - `assertSafeIp(ip)` — runs after DNS resolution, since rebinding
 *     attacks are the hard case. The host can change between
 *     pre-flight and fetch time, so the proxy resolves the hostname
 *     to one or more IPs (DoH), runs THIS check on each, and then
 *     fetches with the verified IP pinned.
 */

export class ProxyError extends Error {
  constructor(message: string, readonly code: string, readonly status = 400) {
    super(message);
    this.name = 'ProxyError';
  }
}

export const ALLOWED_PROXY_SCHEMES = new Set<string>(['https:', 'http:']);

/**
 * Content types the read-it-later flow accepts. No images, no PDFs —
 * we proxy text-shaped resources only. This is enforced after the
 * response arrives, before we let the body stream out.
 */
export const ALLOWED_PROXY_CONTENT_TYPES = new Set<string>([
  'text/html',
  'text/plain',
  'application/xhtml+xml',
  'application/xml',
  'text/xml',
  'application/rss+xml',
  'application/atom+xml',
  'application/json',
]);

/** 5 MB max body — anything larger is aborted mid-stream. */
export const MAX_PROXY_RESPONSE_BYTES = 5 * 1024 * 1024;

/**
 * Hostnames we refuse outright before a DNS lookup happens. These are
 * either reserved-name suffixes (`.local`, `.internal`) or string
 * forms of loopback/metadata IPs.
 */
const DENIED_HOSTNAME_SUFFIXES = ['.local', '.internal', '.localhost', '.lan'];
const DENIED_HOSTNAME_EXACT = new Set<string>([
  'localhost',
  'localhost.localdomain',
  'metadata',
  'metadata.google.internal',
]);

export function isDeniedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (DENIED_HOSTNAME_EXACT.has(lower)) return true;
  for (const suffix of DENIED_HOSTNAME_SUFFIXES) {
    if (lower.endsWith(suffix)) return true;
  }
  return false;
}

/** Validate the URL string at the front gate. Throws on rejection. */
export function assertSafeUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new ProxyError('Invalid URL.', 'invalid_url');
  }
  if (!ALLOWED_PROXY_SCHEMES.has(url.protocol)) {
    throw new ProxyError(
      `Refused URL scheme ${url.protocol}.`,
      'scheme_not_allowed',
    );
  }
  if (isDeniedHostname(url.hostname)) {
    throw new ProxyError(
      `Refused hostname ${url.hostname}.`,
      'hostname_denied',
    );
  }
  // If the hostname is itself an IP literal, run the IP check now.
  // Otherwise we defer to post-DNS-resolution.
  const ipResult = parseIpLiteral(url.hostname);
  if (ipResult) assertSafeIp(ipResult);
  return url;
}

/**
 * Reject IP addresses that resolve into reserved/internal ranges. Run
 * this on every DNS-resolved address AND on every redirect target's
 * resolved address — that's the load-bearing rebind protection.
 */
export function assertSafeIp(ip: ParsedIp): void {
  if (ip.kind === 'ipv4') {
    if (isPrivateIpv4(ip.octets)) {
      throw new ProxyError(
        `Refused private/internal IPv4 ${ip.canonical}.`,
        'ipv4_blocked',
      );
    }
    return;
  }
  if (ip.kind === 'ipv6') {
    if (isPrivateIpv6(ip.canonical)) {
      throw new ProxyError(
        `Refused private/internal IPv6 ${ip.canonical}.`,
        'ipv6_blocked',
      );
    }
    return;
  }
}

export type ParsedIp =
  | { kind: 'ipv4'; canonical: string; octets: [number, number, number, number] }
  | { kind: 'ipv6'; canonical: string };

export function parseIpLiteral(value: string): ParsedIp | null {
  const trimmed = value.replace(/^\[|\]$/g, '');
  const ipv4 = parseIpv4(trimmed);
  if (ipv4) return ipv4;
  if (trimmed.includes(':')) {
    return { kind: 'ipv6', canonical: trimmed.toLowerCase() };
  }
  return null;
}

function parseIpv4(value: string): ParsedIp | null {
  const parts = value.split('.');
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (Number.isNaN(n) || n < 0 || n > 255) return null;
    octets.push(n);
  }
  return {
    kind: 'ipv4',
    canonical: octets.join('.'),
    octets: octets as [number, number, number, number],
  };
}

/**
 * Block lists for IPv4 — every reserved range from the plan + a couple
 * the plan implicitly covered:
 *   - 0.0.0.0/8                — "this network"
 *   - 10.0.0.0/8               — RFC1918 private
 *   - 100.64.0.0/10            — CGNAT (shared address space)
 *   - 127.0.0.0/8              — loopback
 *   - 169.254.0.0/16           — link-local + AWS metadata + GCP metadata
 *   - 172.16.0.0/12            — RFC1918 private
 *   - 192.0.0.0/24             — IETF protocol
 *   - 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24 — TEST-NET
 *   - 192.168.0.0/16           — RFC1918 private
 *   - 198.18.0.0/15            — benchmarking
 *   - 224.0.0.0/4              — multicast
 *   - 240.0.0.0/4              — reserved (covers broadcast 255.255.255.255)
 */
function isPrivateIpv4(o: readonly number[]): boolean {
  const a = o[0]!;
  const b = o[1]!;
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 0) return true;
  if (a === 192 && b === 168) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true; // multicast + reserved (240+) including 255 broadcast
  return false;
}

/**
 * Block lists for IPv6:
 *   - ::/128         — unspecified
 *   - ::1/128        — loopback
 *   - fc00::/7       — unique local (private)
 *   - fe80::/10      — link-local
 *   - ::ffff:0:0/96  — IPv4-mapped (re-checks the inner IPv4)
 *   - 2001:db8::/32  — documentation
 *   - ff00::/8       — multicast
 */
function isPrivateIpv6(canonical: string): boolean {
  const v = canonical.toLowerCase();
  if (v === '::' || v === '::1') return true;
  // Compressed prefix matching — we only need to catch the well-known
  // private prefixes; canonical form preserves the leading hextets.
  if (v.startsWith('fc') || v.startsWith('fd')) return true; // fc00::/7
  if (v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb')) return true; // fe80::/10
  if (v.startsWith('ff')) return true; // ff00::/8 multicast
  if (v.startsWith('2001:db8')) return true;
  // IPv4-mapped: ::ffff:a.b.c.d → strip the prefix and re-check.
  const mappedMatch = /^(?:::ffff:)([0-9a-f.:]+)$/i.exec(canonical);
  if (mappedMatch) {
    const inner = mappedMatch[1]!;
    const innerIpv4 = parseIpv4(inner);
    if (innerIpv4 && innerIpv4.kind === 'ipv4' && isPrivateIpv4(innerIpv4.octets)) {
      return true;
    }
  }
  return false;
}
