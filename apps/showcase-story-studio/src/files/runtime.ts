/**
 * Page asset storage (drawings + audio).
 *
 * Production: @shippie/local-files writes to OPFS at
 * `stories/<storyId>/<pageId>.svg` and `stories/<storyId>/<pageId>.webm`.
 * Drawings are stored as text/svg+xml; audio as the codec the
 * MediaRecorder produced (webm/opus on Chrome, mp4 on Safari).
 *
 * Test + standalone fallback: a Map<path, Blob>. The contract is the
 * same — `write/read/delete/list` — so the rest of the app doesn't
 * need to know which engine is live.
 *
 * Soft budget: 100 MB across all pages. Surfaced in ParentHome from
 * `usage()`; the app does not auto-prune (the parent decides what to
 * keep — the kid's stuff is the kid's stuff).
 */
import { createLocalFiles } from '@shippie/local-files';
import type { LocalFileEntry, ShippieLocalFiles } from '@shippie/local-runtime-contract';

interface MemoryRecord {
  blob: Blob;
}

class MemoryLocalFiles implements ShippieLocalFiles {
  private readonly entries = new Map<string, MemoryRecord>();

  async write(path: string, value: Blob | ArrayBuffer | string): Promise<void> {
    const blob =
      value instanceof Blob
        ? value
        : value instanceof ArrayBuffer
          ? new Blob([value])
          : new Blob([value], { type: 'text/plain' });
    this.entries.set(path, { blob });
  }

  async read(path: string): Promise<Blob> {
    const r = this.entries.get(path);
    if (!r) throw new Error(`No such file: ${path}`);
    return r.blob;
  }

  async list(prefix = ''): Promise<LocalFileEntry[]> {
    const keys = [...this.entries.keys()].filter((k) => k.startsWith(prefix));
    keys.sort();
    return keys.map((path) => {
      const file = this.entries.get(path)!;
      return {
        path,
        kind: 'file',
        size: file.blob.size,
        type: file.blob.type,
        modifiedAt: new Date().toISOString(),
      } as LocalFileEntry;
    });
  }

  async delete(path: string): Promise<void> {
    // Treat path as a prefix-or-exact match so callers can wipe a
    // story's whole directory in one call.
    if (this.entries.has(path)) this.entries.delete(path);
    for (const k of [...this.entries.keys()]) {
      if (k.startsWith(`${path}/`)) this.entries.delete(k);
    }
  }

  async usage(): Promise<{ usedBytes: number; quotaBytes?: number }> {
    let used = 0;
    for (const r of this.entries.values()) used += r.blob.size;
    return { usedBytes: used };
  }

  async thumbnail(): Promise<Blob> {
    throw new Error('thumbnail not supported in memory fallback');
  }
}

let resolved: ShippieLocalFiles | null = null;
let resolving: Promise<ShippieLocalFiles> | null = null;

export async function resolveLocalFiles(): Promise<ShippieLocalFiles> {
  if (resolved) return resolved;
  if (resolving) return resolving;
  resolving = (async () => {
    if (
      typeof navigator !== 'undefined' &&
      typeof navigator.storage?.getDirectory === 'function'
    ) {
      try {
        const real = await createLocalFiles();
        resolved = real;
        return real;
      } catch {
        // fall through to memory
      }
    }
    const mem = new MemoryLocalFiles();
    resolved = mem;
    return mem;
  })();
  return resolving;
}

/** Reset the resolved files instance — used by tests. */
export function __resetLocalFiles(): void {
  resolved = null;
  resolving = null;
}

export function pageSvgPath(storyId: string, pageId: string): string {
  return `stories/${storyId}/${pageId}.svg`;
}

export function pageAudioPath(storyId: string, pageId: string, ext = 'webm'): string {
  return `stories/${storyId}/${pageId}.${ext}`;
}

export function storyDir(storyId: string): string {
  return `stories/${storyId}`;
}
