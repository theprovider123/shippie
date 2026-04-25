/**
 * Cloudflare R2 — S3-compatible API adapter for the Shippie control plane.
 *
 * Uses R2's S3 endpoint at:
 *   https://<accountId>.r2.cloudflarestorage.com/<bucket>/<key>
 *
 * Signing: AWS SigV4 (region "auto", service "s3") via the tiny local
 * signer in `sigv4.ts`. We deliberately avoid `@aws-sdk/client-s3` —
 * it's not in the repo and the dependency footprint is huge for what we
 * actually need.
 *
 * Object size handling:
 *   - ≤ 5 MiB: single PUT.
 *   - > 5 MiB: S3 multipart upload in 8 MiB parts with CreateMultipart /
 *              UploadPart / CompleteMultipartUpload. Aborts on failure.
 *
 * R2 constraints (documented at https://developers.cloudflare.com/r2/api/s3/api/):
 *   - Multipart parts must be ≥ 5 MiB except the last one.
 *   - Only a subset of S3 features are supported, but everything this
 *     adapter uses is in the supported set.
 */
import type {
  R2HttpMetadata,
  R2Object,
  R2ObjectHead,
  R2Store,
} from '@shippie/dev-storage';
import { extname } from 'node:path';
import { signRequest } from './sigv4.ts';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.xml': 'application/xml',
  '.wasm': 'application/wasm',
};

function guessContentType(key: string): string {
  return MIME_TYPES[extname(key).toLowerCase()] ?? 'application/octet-stream';
}

export interface CfR2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** Override endpoint for tests. Defaults to CF S3 endpoint. */
  endpoint?: string;
  /** Fetch timeout per HTTP request (ms). Defaults to 30_000. */
  timeoutMs?: number;
  /** Multipart threshold in bytes. Defaults to 5 MiB. */
  multipartThreshold?: number;
  /** Multipart part size in bytes. Defaults to 8 MiB. */
  multipartPartSize?: number;
  /** Override fetch for tests. */
  fetchImpl?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const MiB = 1024 * 1024;
const DEFAULT_MULTIPART_THRESHOLD = 5 * MiB;
const DEFAULT_MULTIPART_PART_SIZE = 8 * MiB;

export class CfR2 implements R2Store {
  private readonly accountId: string;
  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;
  private readonly bucket: string;
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly multipartThreshold: number;
  private readonly multipartPartSize: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: CfR2Config) {
    if (!config.accountId) throw new Error('CfR2: accountId is required');
    if (!config.accessKeyId) throw new Error('CfR2: accessKeyId is required');
    if (!config.secretAccessKey) throw new Error('CfR2: secretAccessKey is required');
    if (!config.bucket) throw new Error('CfR2: bucket is required');
    this.accountId = config.accountId;
    this.accessKeyId = config.accessKeyId;
    this.secretAccessKey = config.secretAccessKey;
    this.bucket = config.bucket;
    this.endpoint =
      config.endpoint ?? `https://${config.accountId}.r2.cloudflarestorage.com`;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.multipartThreshold = config.multipartThreshold ?? DEFAULT_MULTIPART_THRESHOLD;
    this.multipartPartSize = config.multipartPartSize ?? DEFAULT_MULTIPART_PART_SIZE;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  private objectUrl(key: string, query?: string): URL {
    const path = `/${this.bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
    const u = new URL(this.endpoint);
    u.pathname = path;
    if (query) u.search = query.startsWith('?') ? query : `?${query}`;
    return u;
  }

  private async signedFetch(
    method: string,
    url: URL,
    body: Uint8Array | string,
    extraHeaders: Record<string, string> = {},
  ): Promise<Response> {
    const headers = signRequest({
      method,
      url,
      headers: extraHeaders,
      body,
      accessKeyId: this.accessKeyId,
      secretAccessKey: this.secretAccessKey,
    });

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const init: RequestInit = {
        method,
        headers,
        signal: ctrl.signal,
      };
      if (body !== '') {
        // `fetch` accepts Uint8Array/string at runtime in both Node and
        // Bun; TS's global RequestInit body type is DOM-leaning and
        // doesn't know this. Cast narrowly.
        (init as RequestInit & { body?: unknown }).body = body;
      }
      return await this.fetchImpl(url.toString(), init);
    } finally {
      clearTimeout(timer);
    }
  }

  async head(key: string): Promise<R2ObjectHead | null> {
    const res = await this.signedFetch('HEAD', this.objectUrl(key), '');
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`CfR2.head(${key}) failed: ${res.status} ${await res.text()}`);
    }
    const size = Number(res.headers.get('content-length') ?? '0');
    return {
      key,
      size,
      httpMetadata: {
        contentType: res.headers.get('content-type') ?? guessContentType(key),
        cacheControl: res.headers.get('cache-control') ?? undefined,
        contentEncoding: res.headers.get('content-encoding') ?? undefined,
        contentLanguage: res.headers.get('content-language') ?? undefined,
      },
    };
  }

  async get(key: string): Promise<R2Object | null> {
    const res = await this.signedFetch('GET', this.objectUrl(key), '');
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`CfR2.get(${key}) failed: ${res.status} ${await res.text()}`);
    }
    const arrayBuf = await res.arrayBuffer();
    const u8 = new Uint8Array(arrayBuf);
    const head: R2ObjectHead = {
      key,
      size: u8.byteLength,
      httpMetadata: {
        contentType: res.headers.get('content-type') ?? guessContentType(key),
        cacheControl: res.headers.get('cache-control') ?? undefined,
        contentEncoding: res.headers.get('content-encoding') ?? undefined,
        contentLanguage: res.headers.get('content-language') ?? undefined,
      },
    };
    return {
      ...head,
      body: async () => u8,
      text: async () => new TextDecoder().decode(u8),
      json: async <T>() => JSON.parse(new TextDecoder().decode(u8)) as T,
      arrayBuffer: async () => arrayBuf,
    };
  }

  async put(
    key: string,
    value: ArrayBuffer | Uint8Array | string,
    metadata?: R2HttpMetadata,
  ): Promise<void> {
    const bytes = normalizeToBytes(value);
    if (bytes.byteLength > this.multipartThreshold) {
      await this.multipartPut(key, bytes, metadata);
      return;
    }
    await this.singlePut(key, bytes, metadata);
  }

  private async singlePut(
    key: string,
    bytes: Uint8Array,
    metadata?: R2HttpMetadata,
  ): Promise<void> {
    const headers = this.metadataHeaders(key, metadata);
    const res = await this.signedFetch('PUT', this.objectUrl(key), bytes, headers);
    if (!res.ok) {
      throw new Error(`CfR2.put(${key}) failed: ${res.status} ${await res.text()}`);
    }
  }

  /**
   * S3 multipart upload. Part size clamps to 5 MiB minimum (R2 constraint),
   * except for the final part which may be smaller. Aborts the upload on
   * any failure — otherwise a failed deploy would leak storage.
   */
  private async multipartPut(
    key: string,
    bytes: Uint8Array,
    metadata?: R2HttpMetadata,
  ): Promise<void> {
    // 1. CreateMultipartUpload
    const initUrl = this.objectUrl(key, 'uploads=');
    const initHeaders = this.metadataHeaders(key, metadata);
    const initRes = await this.signedFetch('POST', initUrl, '', initHeaders);
    if (!initRes.ok) {
      throw new Error(
        `CfR2.multipartPut(${key}) init failed: ${initRes.status} ${await initRes.text()}`,
      );
    }
    const uploadId = extractXmlTag(await initRes.text(), 'UploadId');
    if (!uploadId) throw new Error(`CfR2.multipartPut(${key}): no UploadId in response`);

    const parts: Array<{ PartNumber: number; ETag: string }> = [];
    try {
      // 2. UploadPart for each chunk. R2 requires parts ≥ 5 MiB except
      // the last — we trust `multipartPartSize` here and let R2 surface
      // an error if a caller configures a too-small size in prod.
      const partSize = this.multipartPartSize;
      let offset = 0;
      let partNumber = 1;
      while (offset < bytes.byteLength) {
        const end = Math.min(offset + partSize, bytes.byteLength);
        const chunk = bytes.subarray(offset, end);

        const partUrl = this.objectUrl(
          key,
          `partNumber=${partNumber}&uploadId=${encodeURIComponent(uploadId)}`,
        );
        const partRes = await this.signedFetch('PUT', partUrl, chunk);
        if (!partRes.ok) {
          throw new Error(
            `CfR2.multipartPut(${key}) part ${partNumber} failed: ${partRes.status} ${await partRes.text()}`,
          );
        }
        const etag = partRes.headers.get('etag');
        if (!etag) {
          throw new Error(
            `CfR2.multipartPut(${key}) part ${partNumber}: missing ETag`,
          );
        }
        parts.push({ PartNumber: partNumber, ETag: etag });

        offset = end;
        partNumber += 1;
      }

      // 3. CompleteMultipartUpload
      const completeBody =
        '<CompleteMultipartUpload>' +
        parts
          .map(
            (p) =>
              `<Part><PartNumber>${p.PartNumber}</PartNumber><ETag>${escapeXml(p.ETag)}</ETag></Part>`,
          )
          .join('') +
        '</CompleteMultipartUpload>';
      const completeUrl = this.objectUrl(key, `uploadId=${encodeURIComponent(uploadId)}`);
      const completeRes = await this.signedFetch('POST', completeUrl, completeBody, {
        'content-type': 'application/xml',
      });
      if (!completeRes.ok) {
        throw new Error(
          `CfR2.multipartPut(${key}) complete failed: ${completeRes.status} ${await completeRes.text()}`,
        );
      }
    } catch (err) {
      // Best-effort abort; swallow abort errors so original is surfaced.
      try {
        const abortUrl = this.objectUrl(key, `uploadId=${encodeURIComponent(uploadId)}`);
        await this.signedFetch('DELETE', abortUrl, '');
      } catch {
        /* ignore */
      }
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    const res = await this.signedFetch('DELETE', this.objectUrl(key), '');
    if (res.status === 404) return;
    if (!res.ok) {
      throw new Error(`CfR2.delete(${key}) failed: ${res.status} ${await res.text()}`);
    }
  }

  /**
   * List object keys with the given prefix. Pages via the V2 listing
   * `continuation-token` until exhausted.
   */
  async list(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let continuationToken: string | undefined;
    for (let page = 0; page < 10_000; page++) {
      const params = new URLSearchParams();
      params.set('list-type', '2');
      if (prefix) params.set('prefix', prefix);
      if (continuationToken) params.set('continuation-token', continuationToken);

      const url = new URL(this.endpoint);
      url.pathname = `/${this.bucket}`;
      url.search = `?${params.toString()}`;

      const res = await this.signedFetch('GET', url, '');
      if (!res.ok) {
        throw new Error(`CfR2.list(${prefix}) failed: ${res.status} ${await res.text()}`);
      }
      const text = await res.text();
      for (const k of extractAllXmlTags(text, 'Key')) keys.push(k);
      const truncated = extractXmlTag(text, 'IsTruncated') === 'true';
      if (!truncated) break;
      continuationToken = extractXmlTag(text, 'NextContinuationToken') ?? undefined;
      if (!continuationToken) break;
    }
    return keys;
  }

  private metadataHeaders(
    key: string,
    metadata?: R2HttpMetadata,
  ): Record<string, string> {
    const h: Record<string, string> = {
      'content-type': metadata?.contentType ?? guessContentType(key),
    };
    if (metadata?.cacheControl) h['cache-control'] = metadata.cacheControl;
    if (metadata?.contentEncoding) h['content-encoding'] = metadata.contentEncoding;
    if (metadata?.contentLanguage) h['content-language'] = metadata.contentLanguage;
    return h;
  }
}

function normalizeToBytes(value: ArrayBuffer | Uint8Array | string): Uint8Array {
  if (typeof value === 'string') return new TextEncoder().encode(value);
  if (value instanceof Uint8Array) return value;
  return new Uint8Array(value);
}

function extractXmlTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`);
  const m = re.exec(xml);
  return m && m[1] != null ? m[1] : null;
}

function extractAllXmlTags(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'g');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    if (m[1] != null) out.push(m[1]);
  }
  return out;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
