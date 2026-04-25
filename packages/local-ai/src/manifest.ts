import type { LocalAiFeature } from '@shippie/local-runtime-contract';

export type LocalAiModelKind = 'embedding' | 'classifier' | 'sentiment' | 'vision';
export type LocalAiRuntime = 'transformers-js' | 'webllm' | 'custom-wasm';

export interface LocalAiModelChunk {
  path: string;
  bytes: number;
  integrity: `sha256-${string}` | `sha384-${string}` | `sha512-${string}`;
}

export interface LocalAiModelEntry {
  id: string;
  version: string;
  kind: LocalAiModelKind;
  runtime: LocalAiRuntime;
  features: LocalAiFeature[];
  bytes: number;
  chunks: LocalAiModelChunk[];
  tokenizer?: string;
  quantization?: string;
  dimensions?: number;
  recommended?: boolean;
}

export interface LocalAiManifest {
  schemaVersion: 1;
  generatedAt: string;
  baseUrl: string;
  models: LocalAiModelEntry[];
}

export interface ResolvedModelChunk extends LocalAiModelChunk {
  url: string;
}

export interface ResolvedModelEntry extends LocalAiModelEntry {
  chunks: ResolvedModelChunk[];
}

export function parseLocalAiManifest(input: unknown): LocalAiManifest {
  if (!isRecord(input)) throw new Error('local AI manifest must be an object');
  if (input.schemaVersion !== 1) throw new Error('local AI manifest schemaVersion must be 1');
  const generatedAt = requiredString(input.generatedAt, 'generatedAt');
  const baseUrl = normalizeBaseUrl(requiredString(input.baseUrl, 'baseUrl'));
  const rawModels = input.models;
  if (!Array.isArray(rawModels) || rawModels.length === 0) throw new Error('local AI manifest requires at least one model');

  return {
    schemaVersion: 1,
    generatedAt,
    baseUrl,
    models: rawModels.map(parseModelEntry),
  };
}

export function resolveModel(manifest: LocalAiManifest, feature: LocalAiFeature): ResolvedModelEntry | null {
  const model = manifest.models
    .filter((candidate) => candidate.features.includes(feature))
    .sort((a, b) => Number(Boolean(b.recommended)) - Number(Boolean(a.recommended)) || a.bytes - b.bytes)[0];
  if (!model) return null;
  return {
    ...model,
    chunks: model.chunks.map((chunk) => ({
      ...chunk,
      url: `${manifest.baseUrl}/${chunk.path}`,
    })),
  };
}

export function manifestDownloadBytes(manifest: LocalAiManifest, features: LocalAiFeature[]): number {
  const ids = new Set<string>();
  let total = 0;
  for (const feature of features) {
    const model = resolveModel(manifest, feature);
    if (!model || ids.has(model.id)) continue;
    ids.add(model.id);
    total += model.bytes;
  }
  return total;
}

function parseModelEntry(input: unknown): LocalAiModelEntry {
  if (!isRecord(input)) throw new Error('local AI model entry must be an object');
  const id = requiredString(input.id, 'models[].id');
  const version = requiredString(input.version, `models[${id}].version`);
  const kind = requiredEnum(input.kind, `models[${id}].kind`, ['embedding', 'classifier', 'sentiment', 'vision']);
  const runtime = requiredEnum(input.runtime, `models[${id}].runtime`, ['transformers-js', 'webllm', 'custom-wasm']);
  const features: LocalAiFeature[] = requiredArray(input.features, `models[${id}].features`).map((feature) =>
    requiredEnum(feature, `models[${id}].features[]`, ['embeddings', 'classification', 'sentiment', 'vision']),
  );
  const bytes = requiredPositiveInteger(input.bytes, `models[${id}].bytes`);
  const chunks = requiredArray(input.chunks, `models[${id}].chunks`).map((chunk) => parseChunk(id, chunk));
  const tokenizer = optionalString(input.tokenizer, `models[${id}].tokenizer`);
  const quantization = optionalString(input.quantization, `models[${id}].quantization`);
  const dimensions = input.dimensions === undefined ? undefined : requiredPositiveInteger(input.dimensions, `models[${id}].dimensions`);
  const chunkBytes = chunks.reduce((sum, chunk) => sum + chunk.bytes, 0);
  if (chunkBytes !== bytes) throw new Error(`models[${id}].bytes must equal chunk byte total`);

  return {
    id,
    version,
    kind,
    runtime,
    features,
    bytes,
    chunks,
    tokenizer,
    quantization,
    dimensions,
    recommended: Boolean(input.recommended),
  };
}

function parseChunk(modelId: string, input: unknown): LocalAiModelChunk {
  if (!isRecord(input)) throw new Error(`models[${modelId}].chunks[] must be an object`);
  const path = requiredString(input.path, `models[${modelId}].chunks[].path`);
  if (path.startsWith('/') || path.includes('..')) throw new Error(`models[${modelId}].chunks[].path must be relative`);
  return {
    path,
    bytes: requiredPositiveInteger(input.bytes, `models[${modelId}].chunks[].bytes`),
    integrity: parseIntegrity(requiredString(input.integrity, `models[${modelId}].chunks[].integrity`)),
  };
}

function parseIntegrity(value: string): LocalAiModelChunk['integrity'] {
  if (/^sha(256|384|512)-[A-Za-z0-9+/=]+$/.test(value)) return value as LocalAiModelChunk['integrity'];
  throw new Error('chunk integrity must be an SRI sha256/sha384/sha512 hash');
}

function normalizeBaseUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error('local AI manifest baseUrl must be https');
  return url.toString().replace(/\/$/, '');
}

function requiredString(value: unknown, path: string): string {
  if (typeof value === 'string' && value.trim()) return value;
  throw new Error(`${path} must be a non-empty string`);
}

function optionalString(value: unknown, path: string): string | undefined {
  if (value === undefined) return undefined;
  return requiredString(value, path);
}

function requiredPositiveInteger(value: unknown, path: string): number {
  if (Number.isSafeInteger(value) && Number(value) > 0) return Number(value);
  throw new Error(`${path} must be a positive integer`);
}

function requiredArray(value: unknown, path: string): unknown[] {
  if (Array.isArray(value) && value.length > 0) return value;
  throw new Error(`${path} must be a non-empty array`);
}

function requiredEnum<T extends string>(value: unknown, path: string, allowed: readonly T[]): T {
  if (typeof value === 'string' && allowed.includes(value as T)) return value as T;
  throw new Error(`${path} must be one of: ${allowed.join(', ')}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
