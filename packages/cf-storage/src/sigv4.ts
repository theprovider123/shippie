/**
 * Minimal AWS Signature V4 signer for Cloudflare R2's S3-compatible API.
 *
 * Enough of SigV4 to cover PUT / GET / HEAD / DELETE / LIST / multipart
 * upload requests against R2. Keeps us off `@aws-sdk/client-s3` (not
 * present in the repo) while staying interoperable with the CF docs.
 *
 * Region is fixed to "auto" for R2 (per CF guidance); service is "s3".
 */
import { createHash, createHmac } from 'node:crypto';

export interface SigV4Params {
  method: string;
  url: URL;
  headers: Record<string, string>;
  body: Uint8Array | string;
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
  service?: string;
  /** Injected clock for tests. */
  now?: Date;
}

function hex(buf: Buffer): string {
  return buf.toString('hex');
}

function sha256Hex(data: Uint8Array | string): string {
  return createHash('sha256').update(data).digest('hex');
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

/**
 * Canonical-URI path encoding per SigV4: each segment is URI-encoded
 * with `/` kept literal. Matches the path the client sends, so object
 * keys containing spaces / unicode hash correctly.
 */
function encodePath(pathname: string): string {
  return pathname
    .split('/')
    .map((seg) => encodeURIComponent(seg).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()))
    .join('/');
}

function encodeQuery(search: string): string {
  if (!search || search === '?') return '';
  const q = search.startsWith('?') ? search.slice(1) : search;
  if (!q) return '';
  const pairs: Array<[string, string]> = [];
  for (const kv of q.split('&')) {
    const idx = kv.indexOf('=');
    const k = idx === -1 ? kv : kv.slice(0, idx);
    const v = idx === -1 ? '' : kv.slice(idx + 1);
    pairs.push([decodeURIComponent(k), decodeURIComponent(v)]);
  }
  pairs.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return pairs
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

/**
 * Sign the given request in place and return the full headers map
 * the caller should send. Adds Host, X-Amz-Date, X-Amz-Content-Sha256,
 * and Authorization headers.
 */
export function signRequest(params: SigV4Params): Record<string, string> {
  const region = params.region ?? 'auto';
  const service = params.service ?? 's3';
  const now = params.now ?? new Date();

  const amzDate = toAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const bodyHash = sha256Hex(params.body);

  const headers: Record<string, string> = {
    ...params.headers,
    host: params.url.host,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': bodyHash,
  };

  // Canonical request
  const canonicalHeaderNames = Object.keys(headers)
    .map((h) => h.toLowerCase())
    .sort();
  const headerMap = new Map<string, string>();
  for (const k of Object.keys(headers)) {
    headerMap.set(k.toLowerCase(), String(headers[k]).trim().replace(/\s+/g, ' '));
  }
  const canonicalHeaders = canonicalHeaderNames
    .map((n) => `${n}:${headerMap.get(n)}\n`)
    .join('');
  const signedHeaders = canonicalHeaderNames.join(';');

  const canonicalRequest = [
    params.method.toUpperCase(),
    encodePath(params.url.pathname || '/'),
    encodeQuery(params.url.search),
    canonicalHeaders,
    signedHeaders,
    bodyHash,
  ].join('\n');

  // String to sign
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  // Signing key
  const kDate = hmac(`AWS4${params.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = hex(hmac(kSigning, stringToSign));

  headers['authorization'] =
    `AWS4-HMAC-SHA256 Credential=${params.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return headers;
}

function toAmzDate(d: Date): string {
  const pad = (n: number): string => n.toString().padStart(2, '0');
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  );
}
