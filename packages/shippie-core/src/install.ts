import {
  createShippiePackageArchive,
  readShippiePackageArchive,
  type BuiltShippiePackage,
} from '@shippie/app-package-builder';
import {
  SHIPPIE_COLLECTION_SCHEMA,
  assertValidCollectionManifest,
  collectionEntryToReceiptInput,
  createAppReceipt,
  type AppCollectionEntry,
  type AppCollectionManifest,
  type AppReceipt,
  type AppVersionRecord,
  type InstallSource,
} from '@shippie/app-package-contract';

export type InstallTarget =
  | { kind: 'hub'; url: string }
  | { kind: 'directory'; path: string };

export interface PreparedPackageInstall {
  package: BuiltShippiePackage;
  archiveBytes: Uint8Array;
  entry: AppCollectionEntry;
  receipt: AppReceipt;
}

export async function preparePackageInstall(input: {
  archiveBytes: Uint8Array | string;
  source?: InstallSource;
  installedAt?: string;
}): Promise<PreparedPackageInstall> {
  const archiveBytes = typeof input.archiveBytes === 'string'
    ? new TextEncoder().encode(input.archiveBytes)
    : input.archiveBytes;
  const built = await readShippiePackageArchive(archiveBytes);
  const manifest = built.manifest;
  const version = readPackageVersion(built) ?? manifest.packageHash;
  const verifiedArchive = await createShippiePackageArchive(built);
  const entry: AppCollectionEntry = {
    appId: manifest.id,
    slug: manifest.slug,
    name: manifest.name,
    version,
    kind: manifest.kind,
    packageHash: manifest.packageHash,
    packageUrl: `./packages/${manifest.packageHash}.shippie`,
    domains: [manifest.domains.canonical, ...(manifest.domains.custom ?? [])],
    summary: manifest.description,
  };
  const receipt = createAppReceipt({
    ...collectionEntryToReceiptInput(entry, input.source ?? 'package'),
    version,
    installedAt: input.installedAt,
  });
  return {
    package: built,
    archiveBytes: verifiedArchive,
    entry,
    receipt,
  };
}

function readPackageVersion(built: BuiltShippiePackage): string | null {
  const versionBytes = built.files.get('version.json');
  if (!versionBytes) return null;
  try {
    const version = JSON.parse(new TextDecoder().decode(versionBytes)) as Partial<AppVersionRecord>;
    return typeof version.code?.version === 'string' ? version.code.version : null;
  } catch {
    return null;
  }
}

export function normalizeInstallTarget(raw: string): InstallTarget {
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    return { kind: 'hub', url: raw.replace(/\/+$/, '') };
  }

  if (raw === 'hub.local' || raw.endsWith('.local')) {
    return { kind: 'hub', url: `http://${raw}` };
  }

  return { kind: 'directory', path: raw };
}

export function createMirrorCollection(input: {
  id?: string;
  slug?: string;
  name?: string;
  origin: string;
  entries: AppCollectionEntry[];
  now?: string;
}): AppCollectionManifest {
  const now = input.now ?? new Date().toISOString();
  const origin = input.origin.replace(/\/+$/, '');
  const collection: AppCollectionManifest = {
    schema: SHIPPIE_COLLECTION_SCHEMA,
    id: input.id ?? 'collection_local_mirror',
    slug: input.slug ?? 'local-mirror',
    name: input.name ?? 'Local Mirror',
    kind: 'hub',
    createdAt: now,
    updatedAt: now,
    publisher: {
      id: 'local-hub',
      name: 'Local Hub',
    },
    sourceUrl: `${origin}/collections/${input.slug ?? 'local-mirror'}.json`,
    hub: {
      origin,
      offline: true,
    },
    packages: input.entries.map((entry) => ({
      ...entry,
      packageUrl: new URL(entry.packageUrl, `${origin}/`).href,
    })),
  };
  assertValidCollectionManifest(collection);
  return collection;
}
