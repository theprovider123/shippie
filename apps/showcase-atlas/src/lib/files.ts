/**
 * Resolve a `ShippieFiles`-shaped OPFS handle.
 *
 * In production the Shippie runtime exposes one at
 * `window.shippie.local.files`. In dev/standalone we stand up our own
 * via `navigator.storage.getDirectory()`. If neither exists (e.g.
 * SSR / tests in node), we hand back an in-memory shim so callers
 * don't have to branch.
 */
import type { ShippieLocalFiles } from '@shippie/local-runtime-contract';
import type { ShippieFiles } from './tiles.ts';

interface ShippieGlobal {
  local?: { files?: ShippieLocalFiles };
}

let memo: ShippieFiles | null = null;

export async function resolveFiles(): Promise<ShippieFiles> {
  if (memo) return memo;
  if (typeof window !== 'undefined') {
    const shippie = (window as unknown as { shippie?: ShippieGlobal }).shippie;
    if (shippie?.local?.files) {
      const f = shippie.local.files;
      memo = {
        write: (path, value) => f.write(path, value),
        read: (path) => f.read(path),
        delete: (path) => f.delete(path),
      };
      return memo;
    }
  }
  if (
    typeof navigator !== 'undefined'
    && typeof navigator.storage?.getDirectory === 'function'
  ) {
    const root = await navigator.storage.getDirectory();
    memo = makeOpfsAdapter(root);
    return memo;
  }
  // Memory fallback for SSR / tests.
  const mem = new Map<string, Blob>();
  memo = {
    async write(path, value) {
      const blob = value instanceof Blob ? value : new Blob([value as ArrayBuffer]);
      mem.set(path, blob);
    },
    async read(path) {
      const b = mem.get(path);
      if (!b) throw new Error(`OPFS miss: ${path}`);
      return b;
    },
    async delete(path) {
      mem.delete(path);
    },
  };
  return memo;
}

function makeOpfsAdapter(root: FileSystemDirectoryHandle): ShippieFiles {
  return {
    async write(path, value) {
      const { dir, name } = await ensureDirs(root, path, true);
      const handle = await dir.getFileHandle(name, { create: true });
      const writable = await handle.createWritable();
      try {
        if (value instanceof Blob) {
          await writable.write(value);
        } else if (typeof value === 'string') {
          await writable.write(new Blob([value]));
        } else {
          await writable.write(new Blob([value]));
        }
      } finally {
        await writable.close();
      }
    },
    async read(path) {
      const { dir, name } = await ensureDirs(root, path, false);
      const handle = await dir.getFileHandle(name);
      return handle.getFile();
    },
    async delete(path) {
      const { dir, name } = await ensureDirs(root, path, false);
      await dir.removeEntry(name);
    },
  };
}

async function ensureDirs(
  root: FileSystemDirectoryHandle,
  path: string,
  create: boolean,
): Promise<{ dir: FileSystemDirectoryHandle; name: string }> {
  const parts = path.split('/').filter(Boolean);
  const name = parts.pop();
  if (!name) throw new Error(`bad path: ${path}`);
  let dir = root;
  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part, { create });
  }
  return { dir, name };
}

export function photoPath(photoId: string): string {
  return `atlas/photos/${photoId}`;
}
