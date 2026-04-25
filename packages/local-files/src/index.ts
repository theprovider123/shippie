import type { LocalFileEntry, LocalFileThumbnailOptions, ShippieLocalFiles } from '@shippie/local-runtime-contract';
import { UnsupportedError } from '@shippie/local-runtime-contract';
import { normalizeLocalPath, splitLocalPath } from './path.ts';

export { normalizeLocalPath, splitLocalPath } from './path.ts';

type DirectoryHandle = FileSystemDirectoryHandle;

export async function createLocalFiles(): Promise<ShippieLocalFiles> {
  const root = await getRootDirectory();
  return new OpfsLocalFiles(root);
}

class OpfsLocalFiles implements ShippieLocalFiles {
  constructor(private readonly root: DirectoryHandle) {}

  async write(path: string, value: Blob | ArrayBuffer | string): Promise<void> {
    const { dirs, name } = splitLocalPath(path);
    const dir = await ensureDirectory(this.root, dirs);
    const handle = await dir.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    await writable.write(value);
    await writable.close();
  }

  async read(path: string): Promise<Blob> {
    const handle = await getFileHandle(this.root, path);
    return handle.getFile();
  }

  async list(path = ''): Promise<LocalFileEntry[]> {
    const dir = path ? await getDirectoryHandle(this.root, normalizeLocalPath(path)) : this.root;
    const entries: LocalFileEntry[] = [];
    const iterable = dir as DirectoryHandle & {
      entries(): AsyncIterable<[string, FileSystemFileHandle | FileSystemDirectoryHandle]>;
    };
    for await (const [name, handle] of iterable.entries()) {
      if (handle.kind === 'file') {
        const file = await handle.getFile();
        entries.push({
          path: path ? `${normalizeLocalPath(path)}/${name}` : name,
          kind: 'file',
          size: file.size,
          type: file.type,
          modifiedAt: new Date(file.lastModified).toISOString(),
        });
      } else {
        entries.push({
          path: path ? `${normalizeLocalPath(path)}/${name}` : name,
          kind: 'directory',
        });
      }
    }
    return entries.sort((a, b) => a.path.localeCompare(b.path));
  }

  async delete(path: string): Promise<void> {
    const { dirs, name } = splitLocalPath(path);
    const dir = await getDirectoryFromParts(this.root, dirs);
    await dir.removeEntry(name, { recursive: true });
  }

  async usage(): Promise<{ usedBytes: number; quotaBytes?: number }> {
    const estimate = await navigator.storage.estimate();
    return {
      usedBytes: estimate.usage ?? 0,
      quotaBytes: estimate.quota,
    };
  }

  async thumbnail(path: string, opts: LocalFileThumbnailOptions): Promise<Blob> {
    const source = await this.read(path);
    if (typeof createImageBitmap !== 'function') {
      throw new UnsupportedError('Image thumbnail generation requires createImageBitmap');
    }
    if (typeof OffscreenCanvas === 'undefined') {
      throw new UnsupportedError('Image thumbnail generation requires OffscreenCanvas');
    }
    const bitmap = await createImageBitmap(source);
    const canvas = new OffscreenCanvas(opts.width, opts.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new UnsupportedError('2D canvas context is unavailable');
    ctx.drawImage(bitmap, 0, 0, opts.width, opts.height);
    return canvas.convertToBlob({
      type: opts.type ?? 'image/png',
      quality: opts.quality,
    });
  }
}

async function getRootDirectory(): Promise<DirectoryHandle> {
  if (typeof navigator === 'undefined' || typeof navigator.storage?.getDirectory !== 'function') {
    throw new UnsupportedError('OPFS is not available in this browser');
  }
  return navigator.storage.getDirectory();
}

async function ensureDirectory(root: DirectoryHandle, parts: string[]): Promise<DirectoryHandle> {
  let dir = root;
  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part, { create: true });
  }
  return dir;
}

async function getDirectoryFromParts(root: DirectoryHandle, parts: string[]): Promise<DirectoryHandle> {
  let dir = root;
  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part);
  }
  return dir;
}

async function getDirectoryHandle(root: DirectoryHandle, path: string): Promise<DirectoryHandle> {
  return getDirectoryFromParts(root, normalizeLocalPath(path).split('/'));
}

async function getFileHandle(root: DirectoryHandle, path: string): Promise<FileSystemFileHandle> {
  const { dirs, name } = splitLocalPath(path);
  const dir = await getDirectoryFromParts(root, dirs);
  return dir.getFileHandle(name);
}
