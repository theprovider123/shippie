export const OFFLINE_CAPSULE_PROTOCOL_VERSION = 1 as const;
export const OFFLINE_CAPSULE_DB = 'shippie.offline-capsules.v1';
export const OFFLINE_CAPSULE_POINTER_STORE = 'pointers';
export const OFFLINE_CAPSULE_REPAIR_HEADER = 'X-Shippie-Repair';
export const OFFLINE_CAPSULE_REPAIR_EVENT = 'OFFLINE_CAPSULE_INCOMPLETE';
export const OFFLINE_CAPSULE_REPAIR_STATUS = 503;
export const OFFLINE_CAPSULE_REPAIR_STATUS_TEXT = 'Offline Capsule Incomplete';

export type OfflineCapsuleStage =
  | 'requested'
  | 'downloading'
  | 'verifying'
  | 'sealed'
  | 'partial'
  | 'evicted'
  | 'error';

export interface OfflineCapsuleAsset {
  url: string;
  size?: number;
  sha256?: string;
}

export interface OfflineCapsuleManifest {
  protocolVersion: typeof OFFLINE_CAPSULE_PROTOCOL_VERSION;
  slug: string;
  version: string;
  buildId?: string;
  entryUrl: string;
  assets: OfflineCapsuleAsset[];
  totalBytes: number;
  generatedAt?: string;
  manifestHash: string;
}

export interface OfflineCapsulePointer {
  slug: string;
  manifestHash: string;
  cacheName: string;
  entryUrl: string;
  state: OfflineCapsuleStage;
  totalBytes: number;
  sealedAt?: string;
  updatedAt: string;
  error?: string;
}

export interface NormalizeManifestOptions {
  origin?: string;
  generatedAt?: string;
}

interface LegacyManifest {
  slug?: unknown;
  version?: unknown;
  buildId?: unknown;
  entryUrl?: unknown;
  totalBytes?: unknown;
  generatedAt?: unknown;
  generated_at?: unknown;
  assets?: unknown;
  entries?: unknown;
  manifestHash?: unknown;
}

export function capsuleCacheName(slug: string, manifestHash: string): string {
  return `capsule:${slug}:${manifestHash}`;
}

export function canonicalAssetUrl(value: string, origin = 'https://shippie.app'): string {
  const url = new URL(value, origin);
  if (url.origin !== origin) return url.href;
  return `${url.pathname}${url.search}`;
}

export function normalizeCapsuleManifest(
  raw: unknown,
  options: NormalizeManifestOptions = {},
): Omit<OfflineCapsuleManifest, 'manifestHash'> & { manifestHash?: string } {
  if (!raw || typeof raw !== 'object') {
    throw new Error('capsule_manifest_invalid');
  }
  const input = raw as LegacyManifest;
  const slug = typeof input.slug === 'string' && input.slug.length > 0 ? input.slug : '';
  if (!slug) throw new Error('capsule_manifest_slug_missing');

  const origin = options.origin ?? 'https://shippie.app';
  const rawAssets = Array.isArray(input.entries)
    ? input.entries
    : Array.isArray(input.assets)
      ? input.assets
      : [];
  const seen = new Set<string>();
  const assets: OfflineCapsuleAsset[] = [];

  for (const item of rawAssets) {
    let asset: OfflineCapsuleAsset | null = null;
    if (typeof item === 'string') {
      asset = { url: canonicalAssetUrl(item, origin) };
    } else if (item && typeof item === 'object') {
      const obj = item as { url?: unknown; href?: unknown; size?: unknown; sha256?: unknown };
      const rawUrl = typeof obj.url === 'string' ? obj.url : typeof obj.href === 'string' ? obj.href : '';
      if (rawUrl) {
        asset = {
          url: canonicalAssetUrl(rawUrl, origin),
          ...(typeof obj.size === 'number' && Number.isFinite(obj.size) && obj.size >= 0
            ? { size: obj.size }
            : {}),
          ...(typeof obj.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(obj.sha256)
            ? { sha256: obj.sha256.toLowerCase() }
            : {}),
        };
      }
    }
    if (!asset || seen.has(asset.url)) continue;
    seen.add(asset.url);
    assets.push(asset);
  }

  if (assets.length === 0) throw new Error('capsule_manifest_empty');

  const entryUrl =
    typeof input.entryUrl === 'string' && input.entryUrl.length > 0
      ? canonicalAssetUrl(input.entryUrl, origin)
      : assets.find((asset) => /(?:^|\/)(?:index\.html)?(?:\?shippie_embed=1)?$/.test(asset.url))?.url ??
        `/__shippie-run/${encodeURIComponent(slug)}/?shippie_embed=1`;

  if (!assets.some((asset) => asset.url === entryUrl)) {
    assets.unshift({ url: entryUrl });
  }

  const totalBytes =
    typeof input.totalBytes === 'number' && Number.isFinite(input.totalBytes) && input.totalBytes >= 0
      ? input.totalBytes
      : assets.reduce((sum, asset) => sum + (asset.size ?? 0), 0);

  return {
    protocolVersion: OFFLINE_CAPSULE_PROTOCOL_VERSION,
    slug,
    version:
      typeof input.version === 'string' && input.version.length > 0
        ? input.version
        : typeof input.buildId === 'string' && input.buildId.length > 0
          ? input.buildId
          : '0',
    ...(typeof input.buildId === 'string' && input.buildId.length > 0 ? { buildId: input.buildId } : {}),
    entryUrl,
    assets,
    totalBytes,
    generatedAt:
      typeof input.generatedAt === 'string'
        ? input.generatedAt
        : typeof input.generated_at === 'string'
          ? input.generated_at
          : options.generatedAt,
    ...(typeof input.manifestHash === 'string' && /^[a-f0-9]{64}$/i.test(input.manifestHash)
      ? { manifestHash: input.manifestHash.toLowerCase() }
      : {}),
  };
}

export async function sealCapsuleManifest(
  raw: unknown,
  options: NormalizeManifestOptions = {},
): Promise<OfflineCapsuleManifest> {
  const manifest = normalizeCapsuleManifest(raw, options);
  const manifestHash = manifest.manifestHash ?? (await hashCapsuleManifest(manifest));
  return { ...manifest, manifestHash };
}

export async function hashCapsuleManifest(
  manifest: Omit<OfflineCapsuleManifest, 'manifestHash'> | OfflineCapsuleManifest,
): Promise<string> {
  const { manifestHash: _manifestHash, ...hashable } = manifest as OfflineCapsuleManifest;
  return sha256Hex(stableStringify(hashable));
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((key) => obj[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`)
    .join(',')}}`;
}

export async function sha256Hex(input: string | ArrayBuffer | Uint8Array): Promise<string> {
  const bytes =
    typeof input === 'string'
      ? new TextEncoder().encode(input)
      : input instanceof Uint8Array
        ? input
        : new Uint8Array(input);
  if (!globalThis.crypto?.subtle) throw new Error('crypto_subtle_unavailable');
  const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export interface RequestMetadata {
  mode?: string;
  destination?: string;
  headers?: Headers | Record<string, string | undefined | null> | null;
}

export function headerValue(
  headers: Headers | Record<string, string | undefined | null> | null | undefined,
  name: string,
): string {
  if (!headers) return '';
  if (typeof (headers as Headers).get === 'function') return (headers as Headers).get(name) ?? '';
  const lower = name.toLowerCase();
  const record = headers as Record<string, string | undefined | null>;
  return record[name] ?? record[lower] ?? '';
}

export function isDocumentRequestMetadata(request: RequestMetadata): boolean {
  const destination = request.destination ?? '';
  if (destination && destination !== 'document' && destination !== 'iframe') return false;
  if (request.mode === 'navigate') return true;
  const secFetchDest = headerValue(request.headers, 'sec-fetch-dest').toLowerCase();
  if (secFetchDest === 'document' || secFetchDest === 'iframe') return true;
  if (secFetchDest && secFetchDest !== 'empty') return false;
  return headerValue(request.headers, 'accept').toLowerCase().includes('text/html');
}

export function repairResponseInit(slug: string): ResponseInit {
  return {
    status: OFFLINE_CAPSULE_REPAIR_STATUS,
    statusText: OFFLINE_CAPSULE_REPAIR_STATUS_TEXT,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      [OFFLINE_CAPSULE_REPAIR_HEADER]: slug,
    },
  };
}

export function extractSyntheticBootUrls(html: string, entryUrl: string, origin = 'https://shippie.app'): string[] {
  const baseUrl = new URL(entryUrl, origin);
  const urls = new Set<string>();
  const attrPattern = /\s(?:src|href|poster)\s*=\s*(["'])(.*?)\1/gi;
  const srcsetPattern = /\s(?:srcset)\s*=\s*(["'])(.*?)\1/gi;
  const cssUrlPattern = /url\(\s*(["']?)(.*?)\1\s*\)/gi;

  function add(raw: string) {
    const trimmed = raw.trim();
    if (
      !trimmed ||
      trimmed.startsWith('#') ||
      /^(?:data|blob|mailto|tel|javascript):/i.test(trimmed)
    ) {
      return;
    }
    const url = new URL(trimmed, baseUrl);
    if (url.origin !== baseUrl.origin) {
      urls.add(url.href);
      return;
    }
    urls.add(`${url.pathname}${url.search}`);
  }

  for (const match of html.matchAll(attrPattern)) add(match[2] ?? '');
  for (const match of html.matchAll(srcsetPattern)) {
    for (const candidate of (match[2] ?? '').split(',')) {
      add(candidate.trim().split(/\s+/)[0] ?? '');
    }
  }
  for (const match of html.matchAll(cssUrlPattern)) add(match[2] ?? '');

  urls.delete(canonicalAssetUrl(entryUrl, origin));
  return [...urls].sort();
}

export const OFFLINE_CAPSULE_SW_HELPERS = String.raw`
const ShippieOfflineCapsule = (() => {
  const PROTOCOL_VERSION = 1;
  const DB = 'shippie.offline-capsules.v1';
  const POINTER_STORE = 'pointers';
  const REPAIR_HEADER = 'X-Shippie-Repair';
  const REPAIR_EVENT = 'OFFLINE_CAPSULE_INCOMPLETE';
  const REPAIR_STATUS = 503;
  const REPAIR_STATUS_TEXT = 'Offline Capsule Incomplete';

  function cacheName(slug, manifestHash) {
    return 'capsule:' + slug + ':' + manifestHash;
  }

  function canonicalAssetUrl(value, origin) {
    const url = new URL(value, origin || self.location.origin);
    if (url.origin !== (origin || self.location.origin)) return url.href;
    return url.pathname + url.search;
  }

  function stableStringify(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
    return '{' + Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => JSON.stringify(key) + ':' + stableStringify(value[key]))
      .join(',') + '}';
  }

  async function sha256Hex(input) {
    const bytes = typeof input === 'string'
      ? new TextEncoder().encode(input)
      : input instanceof Uint8Array
        ? input
        : new Uint8Array(input);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  async function responseSha256Hex(response) {
    return sha256Hex(await response.clone().arrayBuffer());
  }

  function normalizeManifest(raw, origin) {
    if (!raw || typeof raw !== 'object') throw new Error('capsule_manifest_invalid');
    const slug = typeof raw.slug === 'string' && raw.slug ? raw.slug : '';
    if (!slug) throw new Error('capsule_manifest_slug_missing');
    const sourceAssets = Array.isArray(raw.entries)
      ? raw.entries
      : Array.isArray(raw.assets)
        ? raw.assets
        : [];
    const seen = new Set();
    const assets = [];
    for (const item of sourceAssets) {
      let asset = null;
      if (typeof item === 'string') {
        asset = { url: canonicalAssetUrl(item, origin) };
      } else if (item && typeof item === 'object') {
        const rawUrl = typeof item.url === 'string' ? item.url : typeof item.href === 'string' ? item.href : '';
        if (rawUrl) {
          asset = { url: canonicalAssetUrl(rawUrl, origin) };
          if (typeof item.size === 'number' && Number.isFinite(item.size) && item.size >= 0) asset.size = item.size;
          if (typeof item.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(item.sha256)) asset.sha256 = item.sha256.toLowerCase();
        }
      }
      if (!asset || seen.has(asset.url)) continue;
      seen.add(asset.url);
      assets.push(asset);
    }
    if (assets.length === 0) throw new Error('capsule_manifest_empty');
    const entryUrl = typeof raw.entryUrl === 'string' && raw.entryUrl
      ? canonicalAssetUrl(raw.entryUrl, origin)
      : (assets.find((asset) => /(?:^|\/)(?:index\.html)?(?:\?shippie_embed=1)?$/.test(asset.url)) || {}).url ||
        '/__shippie-run/' + encodeURIComponent(slug) + '/?shippie_embed=1';
    if (!assets.some((asset) => asset.url === entryUrl)) assets.unshift({ url: entryUrl });
    const totalBytes = typeof raw.totalBytes === 'number' && Number.isFinite(raw.totalBytes) && raw.totalBytes >= 0
      ? raw.totalBytes
      : assets.reduce((sum, asset) => sum + (asset.size || 0), 0);
    const manifest = {
      protocolVersion: PROTOCOL_VERSION,
      slug,
      version: typeof raw.version === 'string' && raw.version ? raw.version : typeof raw.buildId === 'string' && raw.buildId ? raw.buildId : '0',
      entryUrl,
      assets,
      totalBytes,
    };
    if (typeof raw.buildId === 'string' && raw.buildId) manifest.buildId = raw.buildId;
    if (typeof raw.generatedAt === 'string') manifest.generatedAt = raw.generatedAt;
    else if (typeof raw.generated_at === 'string') manifest.generatedAt = raw.generated_at;
    if (typeof raw.manifestHash === 'string' && /^[a-f0-9]{64}$/i.test(raw.manifestHash)) manifest.manifestHash = raw.manifestHash.toLowerCase();
    return manifest;
  }

  async function sealManifest(raw, origin) {
    const manifest = normalizeManifest(raw, origin);
    if (!manifest.manifestHash) {
      const hashable = Object.assign({}, manifest);
      delete hashable.manifestHash;
      manifest.manifestHash = await sha256Hex(stableStringify(hashable));
    }
    return manifest;
  }

  function expectedResponse(req, res) {
    if (!res || !res.ok) return false;
    const url = new URL(req.url || req, self.location.origin);
    const type = (res.headers.get('content-type') || '').toLowerCase();
    const isEntry =
      url.pathname.endsWith('/') ||
      url.pathname.endsWith('/index.html') ||
      url.searchParams.get('shippie_embed') === '1';
    if (isEntry || url.pathname.endsWith('.html')) return type.includes('text/html');
    if (url.pathname.endsWith('.js') || url.pathname.endsWith('.mjs')) return type.includes('javascript') || type.includes('ecmascript');
    if (url.pathname.endsWith('.css')) return type.includes('text/css');
    if (url.pathname.endsWith('.wasm')) return type.includes('application/wasm');
    if (url.pathname.endsWith('.json')) return type.includes('json');
    if (url.pathname.endsWith('.svg')) return type.includes('image/svg');
    if (url.pathname.endsWith('.png') || url.pathname.endsWith('.jpg') || url.pathname.endsWith('.jpeg') || url.pathname.endsWith('.webp') || url.pathname.endsWith('.gif') || url.pathname.endsWith('.ico')) return type.startsWith('image/');
    if (url.pathname.endsWith('.woff') || url.pathname.endsWith('.woff2') || url.pathname.endsWith('.ttf') || url.pathname.endsWith('.otf')) return type.includes('font') || type.includes('octet-stream');
    return !type.includes('text/html');
  }

  function isDocumentRequest(req) {
    const destination = req.destination || '';
    if (destination && destination !== 'document' && destination !== 'iframe') return false;
    if (req.mode === 'navigate') return true;
    const secFetchDest = (req.headers.get('sec-fetch-dest') || '').toLowerCase();
    if (secFetchDest === 'document' || secFetchDest === 'iframe') return true;
    if (secFetchDest && secFetchDest !== 'empty') return false;
    return (req.headers.get('accept') || '').toLowerCase().includes('text/html');
  }

  function extractBootUrls(html, entryUrl, origin) {
    const baseUrl = new URL(entryUrl, origin || self.location.origin);
    const urls = new Set();
    const attrPattern = /\s(?:src|href|poster)\s*=\s*(["'])(.*?)\1/gi;
    const srcsetPattern = /\s(?:srcset)\s*=\s*(["'])(.*?)\1/gi;
    const cssUrlPattern = /url\(\s*(["']?)(.*?)\1\s*\)/gi;
    function add(raw) {
      const trimmed = String(raw || '').trim();
      if (!trimmed || trimmed.startsWith('#') || /^(?:data|blob|mailto|tel|javascript):/i.test(trimmed)) return;
      const url = new URL(trimmed, baseUrl);
      urls.add(url.origin === baseUrl.origin ? url.pathname + url.search : url.href);
    }
    for (const match of html.matchAll(attrPattern)) add(match[2] || '');
    for (const match of html.matchAll(srcsetPattern)) {
      for (const candidate of String(match[2] || '').split(',')) add((candidate.trim().split(/\s+/)[0]) || '');
    }
    for (const match of html.matchAll(cssUrlPattern)) add(match[2] || '');
    urls.delete(canonicalAssetUrl(entryUrl, origin || self.location.origin));
    return Array.from(urls).sort();
  }

  async function verifyCacheEntries(cache, manifest) {
    let done = 0;
    const failed = [];
    for (const asset of manifest.assets) {
      const hit = await cache.match(asset.url);
      if (!hit) {
        failed.push(asset.url);
        continue;
      }
      if (typeof asset.size === 'number') {
        const bytes = await hit.clone().arrayBuffer();
        if (bytes.byteLength !== asset.size) {
          failed.push(asset.url);
          continue;
        }
      }
      if (asset.sha256) {
        const hash = await responseSha256Hex(hit);
        if (hash !== asset.sha256) {
          failed.push(asset.url);
          continue;
        }
      }
      done += 1;
    }
    return { complete: failed.length === 0, done, total: manifest.assets.length, failed };
  }

  async function syntheticBoot(cache, manifest) {
    const entry = await cache.match(manifest.entryUrl);
    if (!entry || !expectedResponse(new Request(manifest.entryUrl, { headers: { accept: 'text/html' } }), entry)) {
      return { ok: false, missing: [manifest.entryUrl], external: [] };
    }
    const html = await entry.clone().text();
    const refs = extractBootUrls(html, manifest.entryUrl, self.location.origin);
    const missing = [];
    const external = [];
    for (const ref of refs) {
      if (/^https?:\/\//i.test(ref) && !ref.startsWith(self.location.origin + '/')) {
        external.push(ref);
        continue;
      }
      const key = ref.startsWith(self.location.origin + '/') ? new URL(ref).pathname + new URL(ref).search : ref;
      if (!(await cache.match(key))) missing.push(key);
    }
    return { ok: missing.length === 0 && external.length === 0, missing, external };
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(POINTER_STORE)) db.createObjectStore(POINTER_STORE, { keyPath: 'slug' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('idb_open_failed'));
    });
  }

  async function withStore(mode, run) {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(POINTER_STORE, mode);
        const store = tx.objectStore(POINTER_STORE);
        let settled = false;
        Promise.resolve(run(store)).then((value) => {
          settled = true;
          tx.oncomplete = () => resolve(value);
        }, reject);
        tx.onerror = () => reject(tx.error || new Error('idb_tx_failed'));
        tx.onabort = () => reject(tx.error || new Error('idb_tx_aborted'));
        tx.oncomplete = () => {
          if (!settled) resolve(undefined);
        };
      });
    } finally {
      db.close();
    }
  }

  function requestResult(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('idb_request_failed'));
    });
  }

  function nowIso() {
    return new Date().toISOString();
  }

  async function getPointer(slug) {
    return withStore('readonly', (store) => requestResult(store.get(slug)));
  }

  async function putPointer(pointer) {
    return withStore('readwrite', (store) => requestResult(store.put(Object.assign({ updatedAt: nowIso() }, pointer))));
  }

  async function deletePointer(slug) {
    return withStore('readwrite', (store) => requestResult(store.delete(slug)));
  }

  async function listPointers() {
    return withStore('readonly', (store) => requestResult(store.getAll()));
  }

  function repairResponse(slug, url) {
    notifyRepair(slug, url).catch(() => {});
    return new Response('Offline capsule incomplete: ' + slug + '\n', {
      status: REPAIR_STATUS,
      statusText: REPAIR_STATUS_TEXT,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
        [REPAIR_HEADER]: slug,
      },
    });
  }

  async function notifyRepair(slug, url) {
    if (!self.clients || !self.clients.matchAll) return;
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clients) client.postMessage({ type: REPAIR_EVENT, slug, url });
  }

  return {
    DB,
    POINTER_STORE,
    REPAIR_HEADER,
    REPAIR_EVENT,
    REPAIR_STATUS,
    REPAIR_STATUS_TEXT,
    cacheName,
    canonicalAssetUrl,
    sealManifest,
    normalizeManifest,
    sha256Hex,
    stableStringify,
    expectedResponse,
    isDocumentRequest,
    extractBootUrls,
    verifyCacheEntries,
    syntheticBoot,
    getPointer,
    putPointer,
    deletePointer,
    listPointers,
    repairResponse,
  };
})();
`;
