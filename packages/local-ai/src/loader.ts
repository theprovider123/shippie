import type { LocalAiFeature } from '@shippie/local-runtime-contract';
import {
  parseLocalAiManifest,
  resolveModel,
  type LocalAiManifest,
  type ResolvedModelEntry,
} from './manifest.ts';

export interface LocalAiModelLoaderOptions {
  manifestUrl?: string;
  cacheName?: string;
  fetch?: typeof fetch;
  cacheStorage?: CacheStorage;
  verifyIntegrity?: boolean;
}

export interface CachedLocalAiModel {
  model: ResolvedModelEntry;
  cachedBytes: number;
  downloadedBytes: number;
}

export function createLocalAiModelLoader(opts: LocalAiModelLoaderOptions = {}) {
  const manifestUrl = opts.manifestUrl ?? 'https://models.shippie.app/v1/manifest.json';
  const cacheName = opts.cacheName ?? 'shippie-local-ai-models-v1';
  const fetchImpl = opts.fetch ?? globalThis.fetch;
  const cacheStorage = opts.cacheStorage ?? globalThis.caches;
  const verifyIntegrity = opts.verifyIntegrity ?? true;

  if (!fetchImpl) throw new Error('local AI model loading requires fetch');
  if (!cacheStorage) throw new Error('local AI model loading requires Cache API');

  return {
    async manifest(): Promise<LocalAiManifest> {
      const res = await fetchImpl(manifestUrl, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`Failed to fetch local AI manifest: ${res.status}`);
      return parseLocalAiManifest(await res.json());
    },

    async ensure(feature: LocalAiFeature): Promise<CachedLocalAiModel> {
      const manifest = await this.manifest();
      const model = resolveModel(manifest, feature);
      if (!model) throw new Error(`No local AI model provides ${feature}`);
      const cache = await cacheStorage.open(cacheName);
      let cachedBytes = 0;
      let downloadedBytes = 0;

      for (const chunk of model.chunks) {
        const cached = await cache.match(chunk.url);
        if (cached) {
          cachedBytes += chunk.bytes;
          continue;
        }
        const res = await fetchImpl(chunk.url, { cache: 'force-cache', mode: 'cors' });
        if (!res.ok) throw new Error(`Failed to fetch local AI model chunk ${chunk.path}: ${res.status}`);
        const bytes = await res.arrayBuffer();
        if (bytes.byteLength !== chunk.bytes) {
          throw new Error(`Model chunk ${chunk.path} byte length mismatch`);
        }
        if (verifyIntegrity) await assertIntegrity(bytes, chunk.integrity, chunk.path);
        await cache.put(chunk.url, new Response(bytes, { headers: res.headers }));
        downloadedBytes += chunk.bytes;
      }

      return { model, cachedBytes, downloadedBytes };
    },
  };
}

async function assertIntegrity(bytes: ArrayBuffer, integrity: string, path: string): Promise<void> {
  if (!globalThis.crypto?.subtle) return;
  const [algorithm, expected] = integrity.split('-', 2);
  const digestName = algorithmToDigest(algorithm);
  const actual = base64(new Uint8Array(await crypto.subtle.digest(digestName, bytes)));
  if (stripPadding(actual) !== stripPadding(expected ?? '')) {
    throw new Error(`Model chunk ${path} failed integrity check`);
  }
}

function algorithmToDigest(algorithm: string | undefined): AlgorithmIdentifier {
  if (algorithm === 'sha256') return 'SHA-256';
  if (algorithm === 'sha384') return 'SHA-384';
  if (algorithm === 'sha512') return 'SHA-512';
  throw new Error(`Unsupported integrity algorithm: ${algorithm ?? 'unknown'}`);
}

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function stripPadding(value: string): string {
  return value.replace(/=+$/, '');
}
