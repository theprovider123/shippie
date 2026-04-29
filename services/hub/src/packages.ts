import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, resolve } from 'node:path';
import { createMirrorCollection, preparePackageInstall } from '@shippie/core';
import type { AppCollectionEntry, AppCollectionManifest } from '@shippie/app-package-contract';

export interface IngestedPackage {
  slug: string;
  name: string;
  version: string;
  packageHash: string;
  appUrl: string;
  collectionPath: string;
}

export async function ingestPackageArchive(input: {
  cacheRoot: string;
  archiveBytes: Uint8Array;
  origin: string;
  expectedPackageHash?: string | null;
}): Promise<IngestedPackage> {
  const prepared = await preparePackageInstall({
    archiveBytes: input.archiveBytes,
    source: 'hub',
  });
  if (input.expectedPackageHash && input.expectedPackageHash !== prepared.package.packageHash) {
    throw new Error('package_hash_mismatch');
  }
  const manifest = prepared.package.manifest;
  const version = `v${prepared.receipt.version.replace(/[^a-zA-Z0-9._-]/g, '-')}`;
  const packageFile = join(input.cacheRoot, 'packages', `${prepared.package.packageHash}.shippie`);
  const receiptFile = join(input.cacheRoot, 'receipts', `${manifest.slug}.json`);
  const collectionFile = join(input.cacheRoot, 'collections', 'local-mirror.json');

  await writeSafeFile(packageFile, prepared.archiveBytes);
  await writeSafeFile(receiptFile, new TextEncoder().encode(`${JSON.stringify(prepared.receipt, null, 2)}\n`));
  await unpackAppFiles(input.cacheRoot, manifest.slug, version, prepared.package.files);

  const prior = await readCollection(collectionFile);
  const entry = {
    ...prepared.entry,
    packageUrl: `${input.origin.replace(/\/+$/, '')}/packages/${prepared.package.packageHash}.shippie`,
  };
  const collection = createMirrorCollection({
    origin: input.origin,
    entries: upsertEntry(prior?.packages ?? [], entry),
    now: new Date().toISOString(),
  });
  await writeSafeFile(collectionFile, new TextEncoder().encode(`${JSON.stringify(collection, null, 2)}\n`));

  return {
    slug: manifest.slug,
    name: manifest.name,
    version,
    packageHash: prepared.package.packageHash,
    appUrl: `http://${manifest.slug}.hub.local/`,
    collectionPath: '/collections/local-mirror.json',
  };
}

export async function servePackageArchive(cacheRoot: string, fileName: string): Promise<Response> {
  if (!/^sha256:[a-f0-9]{64}\.shippie$/i.test(fileName)) {
    return withCors(new Response('bad package path', { status: 400 }));
  }
  const path = join(cacheRoot, 'packages', fileName);
  if (!existsSync(path)) return withCors(new Response('package not found', { status: 404 }));
  return withCors(new Response(await readFile(path), {
    headers: {
      'content-type': 'application/vnd.shippie.package+json',
      'cache-control': 'public, max-age=31536000, immutable',
    },
  }));
}

export async function serveLocalCollection(cacheRoot: string, origin: string): Promise<Response> {
  const path = join(cacheRoot, 'collections', 'local-mirror.json');
  if (!existsSync(path)) {
    const empty = createMirrorCollection({ origin, entries: [] });
    return withCors(Response.json(empty));
  }
  return withCors(new Response(await readFile(path), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  }));
}

export function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('access-control-allow-origin', '*');
  headers.set('access-control-allow-methods', 'GET, POST, OPTIONS');
  headers.set('access-control-allow-headers', 'content-type, x-shippie-package-hash');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function unpackAppFiles(
  cacheRoot: string,
  slug: string,
  version: string,
  files: ReadonlyMap<string, Uint8Array>,
): Promise<void> {
  for (const [path, bytes] of files) {
    if (!path.startsWith('app/')) continue;
    const relative = path.slice('app/'.length) || 'index.html';
    const safe = safeRelativePath(relative);
    if (!safe) continue;
    await writeSafeFile(join(cacheRoot, 'apps', slug, version, safe), bytes);
  }
}

async function readCollection(path: string): Promise<AppCollectionManifest | null> {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(await readFile(path, 'utf8')) as AppCollectionManifest;
  } catch {
    return null;
  }
}

function upsertEntry(entries: AppCollectionEntry[], next: AppCollectionEntry): AppCollectionEntry[] {
  return [...entries.filter((entry) => entry.packageHash !== next.packageHash), next];
}

async function writeSafeFile(path: string, bytes: Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
}

function safeRelativePath(path: string): string | null {
  if (/(^|\/)\.\.(\/|$)/.test(path)) return null;
  const cleaned = normalize('/' + path).replace(/^\/+/, '');
  if (!cleaned || cleaned.includes('..')) return null;
  const resolved = resolve('/', cleaned);
  return resolved.startsWith('/') ? cleaned : null;
}
