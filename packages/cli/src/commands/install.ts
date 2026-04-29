/**
 * `shippie install <package.shippie>` — verify and mirror a portable package.
 *
 * This is the first thin CLI surface for the Hub install path. The heavy work
 * lives in @shippie/core so MCP, CLI, and Hub code can share the same verifier.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createMirrorCollection,
  normalizeInstallTarget,
  preparePackageInstall,
  type PreparedPackageInstall,
} from '@shippie/core';
import type { AppCollectionEntry, AppCollectionManifest } from '@shippie/app-package-contract';

interface InstallOptions {
  target?: string;
  dryRun?: boolean;
  origin?: string;
}

export async function installCommand(packagePath: string | undefined, opts: InstallOptions): Promise<void> {
  if (!packagePath) {
    console.error('Usage: shippie install <package.shippie> [--target hub.local|./mirror]');
    process.exit(1);
  }

  const archivePath = resolve(packagePath);
  if (!existsSync(archivePath)) {
    console.error(`Package not found: ${archivePath}`);
    process.exit(1);
  }

  const prepared = await preparePackageInstall({
    archiveBytes: new Uint8Array(readFileSync(archivePath)),
    source: opts.target ? 'hub' : 'package',
  });
  const target = normalizeInstallTarget(opts.target ?? './shippie-mirror');

  console.log(`Verified ${prepared.package.manifest.name}`);
  console.log(`  hash: ${prepared.package.packageHash}`);
  console.log(`  kind: ${prepared.package.manifest.kind}`);
  console.log(`  entry: ${prepared.package.manifest.entry}`);

  if (opts.dryRun) {
    console.log('');
    console.log(`Dry run: would install to ${formatTarget(target)}`);
    return;
  }

  if (target.kind === 'hub') {
    await postToHub(target.url, prepared);
    console.log('');
    console.log(`Installed on ${target.url}`);
    return;
  }

  writeLocalMirror(target.path, prepared, opts.origin ?? 'http://hub.local');
  console.log('');
  console.log(`Mirrored to ${resolve(target.path)}`);
  console.log(`  package: packages/${prepared.package.packageHash}.shippie`);
  console.log('  collection: collections/local-mirror.json');
}

async function postToHub(url: string, prepared: PreparedPackageInstall): Promise<void> {
  const res = await fetch(`${url}/api/packages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/vnd.shippie.package+json',
      'x-shippie-package-hash': prepared.package.packageHash,
    },
    body: prepared.archiveBytes,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Hub install failed: ${res.status} ${body}`.trim());
  }
}

function writeLocalMirror(targetPath: string, prepared: PreparedPackageInstall, origin: string): void {
  const root = resolve(targetPath);
  const packagesDir = resolve(root, 'packages');
  const collectionsDir = resolve(root, 'collections');
  const receiptsDir = resolve(root, 'receipts');
  mkdirSync(packagesDir, { recursive: true });
  mkdirSync(collectionsDir, { recursive: true });
  mkdirSync(receiptsDir, { recursive: true });

  writeFileSync(resolve(packagesDir, `${prepared.package.packageHash}.shippie`), prepared.archiveBytes);
  writeFileSync(
    resolve(receiptsDir, `${prepared.package.manifest.slug}.json`),
    `${JSON.stringify(prepared.receipt, null, 2)}\n`,
    { flag: 'w' },
  );
  const collectionPath = resolve(collectionsDir, 'local-mirror.json');
  const prior = readCollection(collectionPath);
  const entries = upsertEntry(prior?.packages ?? [], prepared.entry);
  const collection = createMirrorCollection({
    origin,
    entries,
    now: new Date().toISOString(),
  });
  writeFileSync(collectionPath, `${JSON.stringify(collection, null, 2)}\n`);
}

function readCollection(path: string): AppCollectionManifest | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as AppCollectionManifest;
  } catch {
    return null;
  }
}

function upsertEntry(entries: AppCollectionEntry[], next: AppCollectionEntry): AppCollectionEntry[] {
  return [...entries.filter((entry) => entry.packageHash !== next.packageHash), next];
}

function formatTarget(target: ReturnType<typeof normalizeInstallTarget>): string {
  return target.kind === 'hub' ? target.url : resolve(target.path);
}
