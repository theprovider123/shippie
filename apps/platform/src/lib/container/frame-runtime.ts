import type { ContainerApp, PackageFileCache } from './state';
import { rewriteCssPackageUrls, rewritePackageAssetReferences } from './app-srcdoc';

export interface ObjectUrlApi {
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
}

export interface PackageFrameSource {
  fingerprint: string;
  entryUrl: string;
  urls: Map<string, string>;
}

export type PackageFrameSourceCache = Map<string, PackageFrameSource>;

export type FrameState = { status: 'booting' | 'ready' | 'error'; message?: string };
export type FrameStates = Record<string, FrameState>;
export type FrameReloadNonces = Record<string, number>;

export function createOrReusePackageFrameSource(
  app: ContainerApp,
  packageFiles: Record<string, PackageFileCache> | undefined,
  cache: PackageFrameSourceCache,
  api: ObjectUrlApi | null = defaultObjectUrlApi(),
): string | null {
  if (!api || !packageFiles) return null;
  const entry = packageFiles[app.entry];
  if (!entry?.text) return null;

  const fingerprint = `${app.packageHash}:${app.entry}:${Object.keys(packageFiles).sort().join('|')}`;
  const existing = cache.get(app.id);
  if (existing?.fingerprint === fingerprint) return existing.entryUrl;
  if (existing) revokePackageFrameSource(app.id, cache, api);

  const source = createPackageFrameSource(app, packageFiles, fingerprint, api);
  cache.set(app.id, source);
  return source.entryUrl;
}

export function createPackageFrameSource(
  app: ContainerApp,
  packageFiles: Record<string, PackageFileCache>,
  fingerprint: string,
  api: ObjectUrlApi,
): PackageFrameSource {
  const entry = packageFiles[app.entry];
  if (!entry?.text) {
    throw new Error(`Package entry ${app.entry} is missing or is not text.`);
  }

  const urls = new Map<string, string>();
  for (const [path, file] of Object.entries(packageFiles)) {
    if (path === app.entry) continue;
    const blob =
      file.text !== undefined
        ? new Blob(
            [
              path.toLowerCase().endsWith('.css')
                ? rewriteCssPackageUrls(file.text, baseDirFor(path), (assetPath) => packageFiles[assetPath]?.dataUrl)
                : file.text,
            ],
            { type: file.mimeType },
          )
        : dataUrlToBlob(file.dataUrl, file.mimeType);
    urls.set(path, api.createObjectURL(blob));
  }

  const entryHtml = rewritePackageAssetReferences(entry.text, app.entry, (path) => urls.get(path));
  const entryUrl = api.createObjectURL(new Blob([entryHtml], { type: entry.mimeType }));
  return { fingerprint, entryUrl, urls };
}

export function revokePackageFrameSource(
  appId: string,
  cache: PackageFrameSourceCache,
  api: Pick<ObjectUrlApi, 'revokeObjectURL'> | null = defaultObjectUrlApi(),
): void {
  const record = cache.get(appId);
  if (!record) return;
  if (api) {
    api.revokeObjectURL(record.entryUrl);
    for (const url of record.urls.values()) api.revokeObjectURL(url);
  }
  cache.delete(appId);
}

export function revokeAllPackageFrameSources(
  cache: PackageFrameSourceCache,
  api: Pick<ObjectUrlApi, 'revokeObjectURL'> | null = defaultObjectUrlApi(),
): void {
  for (const appId of [...cache.keys()]) revokePackageFrameSource(appId, cache, api);
}

export function dataUrlToBlob(dataUrl: string, fallbackMime: string): Blob {
  const [meta = '', encoded = ''] = dataUrl.split(',', 2);
  const mime = /^data:([^;,]+)/.exec(meta)?.[1] ?? fallbackMime;
  if (meta.includes(';base64')) {
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }
  return new Blob([decodeURIComponent(encoded)], { type: mime });
}

export function markFrameBootingState(states: FrameStates, appId: string): FrameStates {
  return { ...states, [appId]: { status: 'booting' } };
}

export function markFrameReadyState(states: FrameStates, appId: string): FrameStates {
  return { ...states, [appId]: { status: 'ready' } };
}

export function markFrameErrorState(
  states: FrameStates,
  appId: string,
  message = 'This app could not open in the container.',
): FrameStates {
  return { ...states, [appId]: { status: 'error', message } };
}

export function nextFrameReloadNonces(nonces: FrameReloadNonces, appId: string): FrameReloadNonces {
  return { ...nonces, [appId]: (nonces[appId] ?? 0) + 1 };
}

function baseDirFor(path: string): string {
  return path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';
}

function defaultObjectUrlApi(): ObjectUrlApi | null {
  if (
    typeof window === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function' ||
    typeof URL.revokeObjectURL !== 'function' ||
    typeof Blob === 'undefined'
  ) {
    return null;
  }
  return URL;
}
