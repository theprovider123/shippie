import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, resolve } from 'node:path';
import { createMirrorCollection, preparePackageInstall } from '@shippie/core';
import type { AppCollectionEntry, AppCollectionManifest, PackageSpaces } from '@shippie/app-package-contract';

export interface IngestedPackage {
  slug: string;
  name: string;
  version: string;
  packageHash: string;
  appUrl: string;
  collectionPath: string;
}

export interface HubToolRegistryEntry {
  slug: string;
  name: string;
  version: string;
  packageHash: string;
  packageUrl: string;
  appUrl: string;
  spaces?: PackageSpaces;
  group?: string;
  deployedAt: string;
  deployedBy?: string;
}

export interface HubToolRegistry {
  schema: 'shippie.hub.tools.v1';
  updatedAt: string;
  tools: HubToolRegistryEntry[];
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
  const packageUrl = `${input.origin.replace(/\/+$/, '')}/packages/${prepared.package.packageHash}.shippie`;

  await writeSafeFile(packageFile, prepared.archiveBytes);
  await writeSafeFile(receiptFile, new TextEncoder().encode(`${JSON.stringify(prepared.receipt, null, 2)}\n`));
  await unpackAppFiles(input.cacheRoot, manifest.slug, version, prepared.package.files);

  const prior = await readCollection(collectionFile);
  const entry = {
    ...prepared.entry,
    packageUrl,
  };
  const collection = createMirrorCollection({
    origin: input.origin,
    entries: upsertEntry(prior?.packages ?? [], entry),
    now: new Date().toISOString(),
  });
  await writeSafeFile(collectionFile, new TextEncoder().encode(`${JSON.stringify(collection, null, 2)}\n`));
  await writeHubToolRegistry(input.cacheRoot, {
    slug: manifest.slug,
    name: manifest.name,
    version,
    packageHash: prepared.package.packageHash,
    packageUrl,
    appUrl: `http://${manifest.slug}.hub.local/`,
    spaces: manifest.spaces,
    deployedAt: new Date().toISOString(),
  });

  return {
    slug: manifest.slug,
    name: manifest.name,
    version,
    packageHash: prepared.package.packageHash,
    appUrl: `http://${manifest.slug}.hub.local/`,
    collectionPath: '/collections/local-mirror.json',
  };
}

export async function readHubToolRegistry(cacheRoot: string): Promise<HubToolRegistry> {
  const path = join(cacheRoot, 'tools.json');
  if (!existsSync(path)) {
    return { schema: 'shippie.hub.tools.v1', updatedAt: new Date(0).toISOString(), tools: [] };
  }
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as Partial<HubToolRegistry>;
    return {
      schema: 'shippie.hub.tools.v1',
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date(0).toISOString(),
      tools: Array.isArray(parsed.tools) ? parsed.tools.filter(isHubToolRegistryEntry) : [],
    };
  } catch {
    return { schema: 'shippie.hub.tools.v1', updatedAt: new Date(0).toISOString(), tools: [] };
  }
}

export async function updateHubToolGroup(
  cacheRoot: string,
  slug: string,
  group: string,
): Promise<HubToolRegistryEntry | null> {
  const prior = await readHubToolRegistry(cacheRoot);
  const index = prior.tools.findIndex((tool) => tool.slug === slug);
  if (index === -1) return null;
  const nextTools = [...prior.tools];
  nextTools[index] = { ...nextTools[index]!, group: group.trim() || undefined };
  const next: HubToolRegistry = {
    schema: 'shippie.hub.tools.v1',
    updatedAt: new Date().toISOString(),
    tools: nextTools,
  };
  await writeSafeFile(join(cacheRoot, 'tools.json'), new TextEncoder().encode(`${JSON.stringify(next, null, 2)}\n`));
  return nextTools[index]!;
}

async function writeHubToolRegistry(
  cacheRoot: string,
  entry: HubToolRegistryEntry,
): Promise<void> {
  const prior = await readHubToolRegistry(cacheRoot);
  const updatedAt = new Date().toISOString();
  const next: HubToolRegistry = {
    schema: 'shippie.hub.tools.v1',
    updatedAt,
    tools: [
      ...prior.tools.filter((tool) => tool.slug !== entry.slug),
      {
        ...entry,
        group: entry.group ?? prior.tools.find((tool) => tool.slug === entry.slug)?.group,
        spaces: entry.spaces ?? prior.tools.find((tool) => tool.slug === entry.slug)?.spaces,
      },
    ].sort((a, b) => a.name.localeCompare(b.name)),
  };
  await writeSafeFile(join(cacheRoot, 'tools.json'), new TextEncoder().encode(`${JSON.stringify(next, null, 2)}\n`));
}

function isHubToolRegistryEntry(value: unknown): value is HubToolRegistryEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<HubToolRegistryEntry>;
  return (
    typeof entry.slug === 'string' &&
    typeof entry.name === 'string' &&
    typeof entry.version === 'string' &&
    typeof entry.packageHash === 'string' &&
    typeof entry.packageUrl === 'string' &&
    typeof entry.appUrl === 'string' &&
    typeof entry.deployedAt === 'string' &&
    (entry.spaces === undefined || isPackageSpaces(entry.spaces))
  );
}

function isPackageSpaces(value: unknown): value is PackageSpaces {
  if (!value || typeof value !== 'object') return false;
  const spaces = value as Partial<PackageSpaces>;
  return (
    typeof spaces.enabled === 'boolean' &&
    Array.isArray(spaces.roles) &&
    spaces.roles.every((role) =>
      Boolean(role) &&
      typeof role === 'object' &&
      typeof (role as { id?: unknown }).id === 'string' &&
      Array.isArray((role as { permissions?: unknown }).permissions) &&
      ((role as { permissions: unknown[] }).permissions).every((permission) => typeof permission === 'string'),
    ) &&
    (spaces.syncMode === 'gossip' || spaces.syncMode === 'sealed-cloud' || spaces.syncMode === 'hub' || spaces.syncMode === 'inherited') &&
    typeof spaces.archivable === 'boolean'
  );
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
