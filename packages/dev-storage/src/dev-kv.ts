/**
 * Filesystem-backed KV for local dev.
 *
 * Each key becomes a file under <dataDir>/<sanitized-key>. Values are
 * plain strings; JSON helpers serialize through the caller. TTL is
 * tracked via a sidecar .meta.json.
 *
 * Usable from any Node/Bun process. Both the worker dev server and the
 * platform's Next.js deploy handler instantiate one pointing at the
 * same `.shippie-dev-state/kv/app-config/` directory.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { KvStore } from './types.ts';

function sanitize(key: string): string {
  return key.replace(/:/g, '__').replace(/\//g, '--');
}

function unsanitize(name: string): string {
  return name.replace(/__/g, ':').replace(/--/g, '/');
}

export class DevKv implements KvStore {
  constructor(private dataDir: string) {
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }
  }

  private path(key: string): string {
    return join(this.dataDir, sanitize(key));
  }

  private metaPath(key: string): string {
    return `${this.path(key)}.meta.json`;
  }

  async get(key: string): Promise<string | null> {
    const filePath = this.path(key);
    const metaFilePath = this.metaPath(key);
    if (!existsSync(filePath)) return null;

    if (existsSync(metaFilePath)) {
      try {
        const meta = JSON.parse(readFileSync(metaFilePath, 'utf8')) as { expiresAt?: number };
        if (meta.expiresAt != null && Date.now() > meta.expiresAt) {
          unlinkSync(filePath);
          unlinkSync(metaFilePath);
          return null;
        }
      } catch {
        // Ignore corrupt meta
      }
    }

    return readFileSync(filePath, 'utf8');
  }

  async getJson<T = unknown>(key: string): Promise<T | null> {
    const raw = await this.get(key);
    if (raw == null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async put(
    key: string,
    value: string,
    opts?: { expirationTtl?: number },
  ): Promise<void> {
    const filePath = this.path(key);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, value, 'utf8');
    if (opts?.expirationTtl) {
      const meta = { expiresAt: Date.now() + opts.expirationTtl * 1000 };
      writeFileSync(this.metaPath(key), JSON.stringify(meta), 'utf8');
    }
  }

  async putJson<T = unknown>(
    key: string,
    value: T,
    opts?: { expirationTtl?: number },
  ): Promise<void> {
    await this.put(key, JSON.stringify(value), opts);
  }

  async delete(key: string): Promise<void> {
    const filePath = this.path(key);
    if (existsSync(filePath)) unlinkSync(filePath);
    const metaFilePath = this.metaPath(key);
    if (existsSync(metaFilePath)) unlinkSync(metaFilePath);
  }

  async list(prefix: string): Promise<string[]> {
    if (!existsSync(this.dataDir)) return [];
    const sanitizedPrefix = sanitize(prefix);
    return readdirSync(this.dataDir)
      .filter((name) => !name.endsWith('.meta.json'))
      .filter((name) => name.startsWith(sanitizedPrefix))
      .map(unsanitize);
  }
}
