import type { PackageFileCache } from './state';

const ROOT = 'imported-packages';
const FILES_JSON = 'files.json';

export async function saveImportedPackage(
  appId: string,
  files: Record<string, PackageFileCache>,
): Promise<void> {
  const root = await opfsRoot();
  const dir = await ensureDirectory(root, [ROOT, encodeURIComponent(appId)]);
  const handle = await dir.getFileHandle(FILES_JSON, { create: true });
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(files));
  await writable.close();
}

export async function loadImportedPackage(
  appId: string,
): Promise<Record<string, PackageFileCache> | null> {
  try {
    const root = await opfsRoot();
    const dir = await getDirectory(root, [ROOT, encodeURIComponent(appId)]);
    const handle = await dir.getFileHandle(FILES_JSON);
    const parsed = JSON.parse(await (await handle.getFile()).text()) as unknown;
    return normalizePackageFiles(parsed);
  } catch {
    return null;
  }
}

export async function deleteImportedPackage(appId: string): Promise<void> {
  try {
    const root = await opfsRoot();
    const dir = await getDirectory(root, [ROOT]);
    await dir.removeEntry(encodeURIComponent(appId), { recursive: true });
  } catch {
    // OPFS may be unavailable or the package may already be gone.
  }
}

async function opfsRoot(): Promise<FileSystemDirectoryHandle> {
  if (typeof navigator === 'undefined' || typeof navigator.storage?.getDirectory !== 'function') {
    throw new Error('OPFS is not available in this browser');
  }
  return navigator.storage.getDirectory();
}

async function ensureDirectory(
  root: FileSystemDirectoryHandle,
  parts: string[],
): Promise<FileSystemDirectoryHandle> {
  let dir = root;
  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part, { create: true });
  }
  return dir;
}

async function getDirectory(
  root: FileSystemDirectoryHandle,
  parts: string[],
): Promise<FileSystemDirectoryHandle> {
  let dir = root;
  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part);
  }
  return dir;
}

function normalizePackageFiles(input: unknown): Record<string, PackageFileCache> | null {
  if (!input || typeof input !== 'object') return null;
  const files: Record<string, PackageFileCache> = {};
  for (const [path, value] of Object.entries(input as Record<string, unknown>)) {
    if (isPackageFileCache(value)) files[path] = value;
  }
  return Object.keys(files).length > 0 ? files : null;
}

function isPackageFileCache(value: unknown): value is PackageFileCache {
  if (!value || typeof value !== 'object') return false;
  const file = value as Partial<PackageFileCache>;
  return typeof file.mimeType === 'string' && typeof file.dataUrl === 'string';
}
