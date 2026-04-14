/**
 * Filesystem-backed R2 for local dev.
 *
 * Directory layout mirrors the R2 bucket exactly:
 *   <dataDir>/apps/recipes/v1/index.html
 *   <dataDir>/icons/recipes/192.png
 *
 * Content-Type is inferred from file extension on read.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import type { R2HttpMetadata, R2Object, R2ObjectHead, R2Store } from './types.ts';

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

export class DevR2 implements R2Store {
  constructor(private dataDir: string) {
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }
  }

  private path(key: string): string {
    return join(this.dataDir, key);
  }

  async head(key: string): Promise<R2ObjectHead | null> {
    const p = this.path(key);
    if (!existsSync(p)) return null;
    const stat = statSync(p);
    if (!stat.isFile()) return null;
    return {
      key,
      size: stat.size,
      httpMetadata: { contentType: guessContentType(key) },
    };
  }

  async get(key: string): Promise<R2Object | null> {
    const head = await this.head(key);
    if (!head) return null;

    const p = this.path(key);
    const buffer = readFileSync(p);

    return {
      ...head,
      body: async () => new Uint8Array(buffer),
      text: async () => buffer.toString('utf8'),
      json: async <T>() => JSON.parse(buffer.toString('utf8')) as T,
      arrayBuffer: async () => {
        const copy = new ArrayBuffer(buffer.byteLength);
        new Uint8Array(copy).set(buffer);
        return copy;
      },
    };
  }

  async put(
    key: string,
    value: ArrayBuffer | Uint8Array | string,
    _metadata?: R2HttpMetadata,
  ): Promise<void> {
    const p = this.path(key);
    mkdirSync(dirname(p), { recursive: true });
    let toWrite: Uint8Array | Buffer | string;
    if (typeof value === 'string') {
      toWrite = value;
    } else if (value instanceof ArrayBuffer) {
      toWrite = new Uint8Array(value);
    } else {
      toWrite = value;
    }
    writeFileSync(p, toWrite as Buffer);
  }

  async delete(key: string): Promise<void> {
    const p = this.path(key);
    if (existsSync(p)) unlinkSync(p);
  }

  async list(prefix: string): Promise<string[]> {
    const results: string[] = [];
    const walk = (dir: string): void => {
      if (!existsSync(dir)) return;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile()) {
          const rel = relative(this.dataDir, full);
          if (rel.startsWith(prefix)) results.push(rel);
        }
      }
    };
    walk(this.dataDir);
    return results.sort();
  }
}
