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

export const SHIPPIE_ARCHIVE_SCHEMA = 'shippie.archive.v1' as const;

export interface ShippiePackageArchive {
  schema: typeof SHIPPIE_ARCHIVE_SCHEMA;
  packageHash: string;
  files: Array<{
    path: string;
    sha256: string;
    bytesBase64: string;
  }>;
}

const PLACEHOLDER_HASH = `sha256:${'0'.repeat(64)}`;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function buildShippiePackage(input: BuildShippiePackageInput): Promise<BuiltShippiePackage> {
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

  const versionWithoutHash: AppVersionRecord = {
    ...input.version,
    code: {
      ...input.version.code,
      packageHash: PLACEHOLDER_HASH,
    },
  };

  writeJson(files, 'version.json', versionWithoutHash);
  writeJson(files, 'permissions.json', input.permissions);
  writeJson(files, 'source.json', input.source);
  writeJson(files, 'trust-report.json', input.trustReport);
  writeJson(files, 'changelog.json', input.changelog ?? { entries: [] });
  writeJson(files, 'deploy-report.json', input.deployReport ?? { status: 'not-provided' });
  writeJson(files, 'migrations.json', input.migrations ?? { operations: [] });
  writeJson(files, 'license.json', input.license ?? { license: input.source.license });
  writeJson(files, 'collections.json', input.collections ?? { collections: [] });

  const packageHash = await computePackageHash(files, manifestWithoutHash);
  const manifest: AppPackageManifest = {
    ...manifestWithoutHash,
    packageHash,
  };
  const version: AppVersionRecord = {
    ...input.version,
    code: {
      ...input.version.code,
      packageHash,
    },
  };

  assertValidPackageManifest(manifest);
  writeJson(files, 'manifest.json', manifest);
  writeJson(files, 'version.json', version);

  return {
    manifest,
    packageHash,
    files: sortFiles(files),
  };
}

export async function computePackageHash(
  files: ReadonlyMap<string, Uint8Array>,
  manifestWithoutHash: AppPackageManifest,
): Promise<string> {
  const chunks: Uint8Array[] = [];
  const sorted = sortFiles(files);
  chunks.push(encoder.encode('shippie.package.v1\n'));
  chunks.push(encoder.encode('manifest-without-packageHash\n'));
  chunks.push(encoder.encode(stableJson({ ...manifestWithoutHash, packageHash: null })));
  chunks.push(encoder.encode('\nfiles\n'));

  for (const [path, bytes] of sorted) {
    if (path === 'manifest.json') continue;
    chunks.push(encoder.encode(path));
    chunks.push(encoder.encode('\0'));
    chunks.push(path === 'version.json' ? normalizeVersionBytesForHash(bytes) : bytes);
    chunks.push(encoder.encode('\0'));
  }

  return `sha256:${await sha256Hex(concatBytes(chunks))}`;
}

export async function createShippiePackageArchive(
  built: Pick<BuiltShippiePackage, 'packageHash' | 'files'>,
): Promise<Uint8Array> {
  const archive: ShippiePackageArchive = {
    schema: SHIPPIE_ARCHIVE_SCHEMA,
    packageHash: built.packageHash,
    files: await Promise.all(
      [...sortFiles(built.files).entries()].map(async ([path, bytes]) => ({
        path,
        sha256: `sha256:${await sha256Hex(bytes)}`,
        bytesBase64: bytesToBase64(bytes),
      })),
    ),
  };
  return encoder.encode(`${stableJson(archive)}\n`);
}

export async function readShippiePackageArchive(bytes: Uint8Array | string): Promise<BuiltShippiePackage> {
  const raw = typeof bytes === 'string' ? bytes : decoder.decode(bytes);
  const archive = JSON.parse(raw) as ShippiePackageArchive;
  if (archive.schema !== SHIPPIE_ARCHIVE_SCHEMA) {
    throw new Error('Unsupported .shippie archive schema.');
  }
  if (!/^sha256:[a-f0-9]{64}$/i.test(archive.packageHash)) {
    throw new Error('Invalid .shippie archive package hash.');
  }

  const files = new Map<string, Uint8Array>();
  for (const file of archive.files) {
    const path = normalizePackagePath(file.path);
    const fileBytes = base64ToBytes(file.bytesBase64);
    const actualHash = `sha256:${await sha256Hex(fileBytes)}`;
    if (actualHash !== file.sha256) {
      throw new Error(`File hash mismatch for ${path}.`);
    }
    files.set(path, fileBytes);
  }

  const manifestBytes = files.get('manifest.json');
  if (!manifestBytes) throw new Error('.shippie archive is missing manifest.json.');
  const manifest = JSON.parse(decoder.decode(manifestBytes)) as AppPackageManifest;
  assertValidPackageManifest(manifest);
  const computedHash = await computePackageHash(files, manifest);
  if (computedHash !== archive.packageHash || computedHash !== manifest.packageHash) {
    throw new Error('.shippie archive package hash does not match contents.');
  }

  return {
    manifest,
    packageHash: computedHash,
    files: sortFiles(files),
  };
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

function normalizeVersionBytesForHash(bytes: Uint8Array): Uint8Array {
  try {
    const version = JSON.parse(decoder.decode(bytes)) as AppVersionRecord;
    return encoder.encode(
      `${stableJson({
        ...version,
        code: {
          ...version.code,
          packageHash: PLACEHOLDER_HASH,
        },
      })}\n`,
    );
  } catch {
    return bytes;
  }
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

function normalizePackagePath(rawPath: string): string {
  const path = rawPath.replaceAll('\\', '/').replace(/^\/+/, '');
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0 || parts.some((part) => part === '.' || part === '..')) {
    throw new Error(`Invalid package file path: ${rawPath}`);
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

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof btoa === 'function') {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }
  return Buffer.from(bytes).toString('base64');
}

function base64ToBytes(value: string): Uint8Array {
  if (typeof atob === 'function') {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  return new Uint8Array(Buffer.from(value, 'base64'));
}
