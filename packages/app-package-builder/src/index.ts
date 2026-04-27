import { createHash } from 'node:crypto';
import {
  SHIPPIE_PACKAGE_SCHEMA,
  assertValidPackageManifest,
  assertValidPermissions,
  type AppPackageManifest,
  type AppPermissions,
  type AppVersionRecord,
  type SourceMetadata,
  type TrustReport,
} from '@shippie/app-package-contract';

export type PackageFileValue = string | Uint8Array;

export interface PackageAppIdentity {
  id: string;
  slug: string;
  name: string;
  description?: string;
  kind: AppPackageManifest['kind'];
  entry: string;
  createdAt: string;
  maker: AppPackageManifest['maker'];
  domains: AppPackageManifest['domains'];
  runtime: AppPackageManifest['runtime'];
}

export interface BuildShippiePackageInput {
  app: PackageAppIdentity;
  appFiles: ReadonlyMap<string, PackageFileValue> | Record<string, PackageFileValue>;
  version: AppVersionRecord;
  permissions: AppPermissions;
  source: SourceMetadata;
  trustReport: TrustReport;
  changelog?: unknown;
  deployReport?: unknown;
  migrations?: unknown;
  license?: unknown;
  collections?: unknown;
}

export interface BuiltShippiePackage {
  manifest: AppPackageManifest;
  packageHash: string;
  files: ReadonlyMap<string, Uint8Array>;
}

const PLACEHOLDER_HASH = `sha256:${'0'.repeat(64)}`;

const encoder = new TextEncoder();

export function buildShippiePackage(input: BuildShippiePackageInput): BuiltShippiePackage {
  assertValidPermissions(input.permissions);

  const appFiles = normalizeAppFiles(input.appFiles);
  const files = new Map<string, Uint8Array>();

  for (const [path, bytes] of appFiles) {
    files.set(`app/${path}`, bytes);
  }

  const manifestWithoutHash: AppPackageManifest = {
    schema: SHIPPIE_PACKAGE_SCHEMA,
    id: input.app.id,
    slug: input.app.slug,
    name: input.app.name,
    description: input.app.description,
    kind: input.app.kind,
    entry: input.app.entry,
    packageHash: PLACEHOLDER_HASH,
    createdAt: input.app.createdAt,
    maker: input.app.maker,
    domains: input.app.domains,
    runtime: input.app.runtime,
  };

  writeJson(files, 'version.json', input.version);
  writeJson(files, 'permissions.json', input.permissions);
  writeJson(files, 'source.json', input.source);
  writeJson(files, 'trust-report.json', input.trustReport);
  writeJson(files, 'changelog.json', input.changelog ?? { entries: [] });
  writeJson(files, 'deploy-report.json', input.deployReport ?? { status: 'not-provided' });
  writeJson(files, 'migrations.json', input.migrations ?? { operations: [] });
  writeJson(files, 'license.json', input.license ?? { license: input.source.license });
  writeJson(files, 'collections.json', input.collections ?? { collections: [] });

  const packageHash = computePackageHash(files, manifestWithoutHash);
  const manifest: AppPackageManifest = {
    ...manifestWithoutHash,
    packageHash,
  };

  assertValidPackageManifest(manifest);
  writeJson(files, 'manifest.json', manifest);

  return {
    manifest,
    packageHash,
    files: sortFiles(files),
  };
}

export function computePackageHash(
  files: ReadonlyMap<string, Uint8Array>,
  manifestWithoutHash: AppPackageManifest,
): string {
  const hash = createHash('sha256');
  const sorted = sortFiles(files);
  hash.update('shippie.package.v1\n');
  hash.update('manifest-without-packageHash\n');
  hash.update(stableJson({ ...manifestWithoutHash, packageHash: null }));
  hash.update('\nfiles\n');

  for (const [path, bytes] of sorted) {
    if (path === 'manifest.json') continue;
    hash.update(path);
    hash.update('\0');
    hash.update(bytes);
    hash.update('\0');
  }

  return `sha256:${hash.digest('hex')}`;
}

export function stableJson(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (!value || typeof value !== 'object') return value;

  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const child = (value as Record<string, unknown>)[key];
    if (child !== undefined) sorted[key] = sortJsonValue(child);
  }
  return sorted;
}

function writeJson(files: Map<string, Uint8Array>, path: string, value: unknown): void {
  files.set(path, encoder.encode(`${stableJson(value)}\n`));
}

function normalizeAppFiles(
  files: ReadonlyMap<string, PackageFileValue> | Record<string, PackageFileValue>,
): Map<string, Uint8Array> {
  const entries = files instanceof Map ? files.entries() : Object.entries(files);
  const normalized = new Map<string, Uint8Array>();

  for (const [rawPath, value] of entries) {
    const path = normalizeAppPath(rawPath);
    normalized.set(path, toBytes(value));
  }

  if (!normalized.has('index.html')) {
    throw new Error('A .shippie package requires an app index.html file.');
  }

  return sortFiles(normalized);
}

function normalizeAppPath(rawPath: string): string {
  const path = rawPath.replaceAll('\\', '/').replace(/^\/+/, '').replace(/^app\//, '');
  const parts = path.split('/').filter(Boolean);

  if (parts.length === 0 || parts.some((part) => part === '.' || part === '..')) {
    throw new Error(`Invalid app file path: ${rawPath}`);
  }

  if (path.startsWith('__shippie/')) {
    throw new Error(`App package files cannot use reserved __shippie paths: ${rawPath}`);
  }

  return parts.join('/');
}

function toBytes(value: PackageFileValue): Uint8Array {
  if (typeof value === 'string') return encoder.encode(value);
  return value;
}

function sortFiles(files: ReadonlyMap<string, Uint8Array>): Map<string, Uint8Array> {
  return new Map([...files.entries()].sort(([a], [b]) => a.localeCompare(b)));
}
