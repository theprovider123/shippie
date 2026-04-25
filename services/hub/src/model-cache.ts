/**
 * Model cache — read-through proxy for `ai.shippie.app/models/*`.
 *
 * The first device on the LAN that requests a model fetches it from
 * the cloud; subsequent devices read it from the Hub's disk. Models
 * are large (hundreds of MB each), so the win in offline / slow-link
 * scenarios is significant.
 *
 * Strictly read-only proxying. We never modify or repackage the bytes,
 * so signatures (when they exist) survive end-to-end.
 *
 * Storage: <cacheRoot>/models/<urlPath>.
 */

import { mkdir, stat, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';

export interface ModelCacheOptions {
  /** Disk root for cached model files. */
  cacheRoot: string;
  /** Upstream base URL. Defaults to https://ai.shippie.app. */
  upstream?: string;
  /** Fetch override for tests. */
  fetchImpl?: typeof fetch;
}

export class ModelCache {
  private cacheRoot: string;
  private upstream: string;
  private fetchImpl: typeof fetch;

  constructor(opts: ModelCacheOptions) {
    this.cacheRoot = opts.cacheRoot;
    this.upstream = (opts.upstream ?? 'https://ai.shippie.app').replace(/\/+$/, '');
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  /**
   * Serve a model path. URL: /models/<rest>. Hits cache; on miss,
   * fetches from upstream, writes to disk, and returns the bytes.
   *
   * Returns null when the path is unsafe (caller should 400).
   */
  async serve(modelPath: string): Promise<Response | null> {
    const safe = sanitizeModelPath(modelPath);
    if (!safe) return null;

    const onDisk = join(this.cacheRoot, 'models', safe);
    try {
      const s = await stat(onDisk);
      if (s.isFile()) {
        const bytes = await readFile(onDisk);
        return new Response(bytes, {
          headers: {
            'content-type': mimeForModel(safe),
            'x-shippie-hub-cache': 'hit',
          },
        });
      }
    } catch {
      // miss → fall through.
    }

    const upstreamUrl = `${this.upstream}/models/${safe}`;
    let res: Response;
    try {
      res = await this.fetchImpl(upstreamUrl);
    } catch (err) {
      return new Response(`upstream unreachable: ${(err as Error).message}`, {
        status: 502,
      });
    }
    if (!res.ok) {
      return new Response(`upstream ${res.status}`, { status: res.status });
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    try {
      await mkdir(dirname(onDisk), { recursive: true });
      await writeFile(onDisk, bytes);
    } catch {
      // Best-effort cache write.
    }
    return new Response(bytes, {
      headers: {
        'content-type': res.headers.get('content-type') ?? mimeForModel(safe),
        'x-shippie-hub-cache': 'miss',
      },
    });
  }
}

export function sanitizeModelPath(p: string): string | null {
  // Drop leading slashes; reject dot-dot or absolute paths.
  const trimmed = p.replace(/^\/+/, '');
  if (!trimmed) return null;
  // Catch dot-dot before normalize() collapses it.
  if (/(^|\/)\.\.(\/|$)/.test(trimmed)) return null;
  const norm = normalize('/' + trimmed).replace(/^\/+/, '');
  if (norm.includes('..')) return null;
  // Allow a-z A-Z 0-9 _ - . / only.
  if (!/^[a-zA-Z0-9._/-]+$/.test(norm)) return null;
  return norm;
}

function mimeForModel(path: string): string {
  if (path.endsWith('.json')) return 'application/json; charset=utf-8';
  if (path.endsWith('.txt')) return 'text/plain; charset=utf-8';
  // Most model files are binary blobs (.onnx, .bin, .safetensors).
  return 'application/octet-stream';
}
