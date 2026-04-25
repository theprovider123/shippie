import type { ShippieJson } from './shippie-json.ts';
import { isProjectType, type ProjectType } from './project-types.ts';

export type PublicDisplayMode = 'standalone' | 'fullscreen' | 'minimal-ui' | 'browser';
export type PublicTransitionMode = 'none' | 'slide' | 'expand' | 'rise' | 'crossfade';
export type PublicLocalAiMode = 'text' | 'vision' | 'embeddings';

export interface PublicShippieJson {
  version: 1;
  slug?: string;
  type: ProjectType;
  name: string;
  tagline?: string;
  description?: string;
  category: string;
  categories?: string[];
  icon?: string;
  screenshots?: string[];
  theme_color?: string;
  background_color?: string;
  display: PublicDisplayMode;
  badge: boolean;
  transitions: PublicTransitionMode;
  haptics: boolean;
  sound: boolean;
  ambient: boolean;
  local: {
    database: boolean;
    files: boolean;
    ai: PublicLocalAiMode[];
    sync: boolean;
  };
}

export interface CompilePublicShippieJsonOptions {
  slug?: string;
  defaults?: Partial<Pick<ShippieJson, 'theme_color' | 'background_color' | 'category'>>;
}

const PUBLIC_KEYS = new Set([
  'version',
  'slug',
  'type',
  'name',
  'tagline',
  'description',
  'category',
  'categories',
  'icon',
  'screenshots',
  'theme_color',
  'background_color',
  'display',
  'badge',
  'transitions',
  'haptics',
  'sound',
  'ambient',
  'local',
]);

const LOCAL_KEYS = new Set(['database', 'files', 'ai', 'sync']);
const DISPLAY_MODES = new Set<PublicDisplayMode>(['standalone', 'fullscreen', 'minimal-ui', 'browser']);
const TRANSITION_MODES = new Set<PublicTransitionMode>(['none', 'slide', 'expand', 'rise', 'crossfade']);
const LOCAL_AI_MODES = new Set<PublicLocalAiMode>(['text', 'vision', 'embeddings']);
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export const PublicShippieJsonSchema = {
  parse: parsePublicShippieJson,
};

export function isInternalShippieJson(value: unknown): value is ShippieJson {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    record.version === 1 &&
    typeof record.name === 'string' &&
    typeof record.category === 'string' &&
    typeof record.type === 'string' &&
    isProjectType(record.type)
  );
}

export function parsePublicShippieJson(value: unknown): PublicShippieJson {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('shippie.json must be an object');
  }
  const record = value as Record<string, unknown>;
  const unknown = Object.keys(record).filter((key) => !PUBLIC_KEYS.has(key));
  if (unknown.length > 0) {
    throw new Error(`Unrecognized shippie.json field(s): ${unknown.join(', ')}`);
  }

  const name = stringField(record, 'name', { required: true, max: 120 })!;
  const typeRaw = stringField(record, 'type', { fallback: 'app' });
  if (!isProjectType(typeRaw)) throw new Error(`Invalid shippie.json.type: ${typeRaw}`);

  const display = enumField(record, 'display', DISPLAY_MODES, 'standalone');
  const transitions = enumField(record, 'transitions', TRANSITION_MODES, 'slide');
  const local = parseLocal(record.local);

  return {
    version: 1,
    slug: stringField(record, 'slug', { max: 64 }),
    type: typeRaw,
    name,
    tagline: stringField(record, 'tagline', { max: 280 }),
    description: stringField(record, 'description', { max: 2000 }),
    category: stringField(record, 'category', { fallback: 'tools', max: 64 })!,
    categories: stringArrayField(record, 'categories', 10),
    icon: stringField(record, 'icon'),
    screenshots: stringArrayField(record, 'screenshots', 12),
    theme_color: colorField(record, 'theme_color'),
    background_color: colorField(record, 'background_color'),
    display,
    badge: booleanField(record, 'badge', true),
    transitions,
    haptics: booleanField(record, 'haptics', true),
    sound: booleanField(record, 'sound', false),
    ambient: booleanField(record, 'ambient', false),
    local,
  };
}

export function compilePublicShippieJson(
  publicConfig: PublicShippieJson,
  opts: CompilePublicShippieJsonOptions = {},
): ShippieJson {
  const primaryCategory =
    publicConfig.categories?.[0] ?? publicConfig.category ?? opts.defaults?.category ?? 'tools';
  const internal: ShippieJson = {
    version: 1,
    slug: opts.slug ?? publicConfig.slug,
    type: publicConfig.type as ProjectType,
    name: publicConfig.name,
    tagline: publicConfig.tagline,
    description: publicConfig.description,
    category: primaryCategory,
    icon: publicConfig.icon,
    theme_color: publicConfig.theme_color ?? opts.defaults?.theme_color,
    background_color: publicConfig.background_color ?? opts.defaults?.background_color,
    pwa: {
      display: publicConfig.display,
      categories: publicConfig.categories ?? [primaryCategory],
      screenshots: publicConfig.screenshots,
    },
    sdk: {
      auto_inject: true,
    },
    feedback: {
      enabled: true,
    },
    permissions: {},
  };

  if (publicConfig.local.database || publicConfig.local.sync) {
    internal.permissions = { ...internal.permissions, storage: 'rw' };
  }
  if (publicConfig.local.files) {
    internal.permissions = { ...internal.permissions, files: true };
  }
  if (publicConfig.local.ai.length > 0) {
    internal.permissions = {
      ...internal.permissions,
      native_bridge: publicConfig.local.ai.map((kind) => `local-ai:${kind}`),
    };
  }

  if (Object.keys(internal.permissions ?? {}).length === 0) {
    delete internal.permissions;
  }

  return internal;
}

export function normalizeShippieJson(
  value: unknown,
  opts: CompilePublicShippieJsonOptions = {},
): ShippieJson {
  if (
    isInternalShippieJson(value) &&
    ('pwa' in value || 'permissions' in value || 'build' in value || 'sdk' in value)
  ) {
    return { ...value, slug: opts.slug ?? value.slug };
  }
  return compilePublicShippieJson(parsePublicShippieJson(value), opts);
}

function stringField(
  record: Record<string, unknown>,
  key: string,
  opts: { required?: boolean; fallback?: string; max?: number } = {},
): string | undefined {
  const value = record[key];
  if (value == null) {
    if (opts.required) throw new Error(`Missing required shippie.json.${key}`);
    return opts.fallback;
  }
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`shippie.json.${key} must be a non-empty string`);
  }
  if (opts.max && value.length > opts.max) {
    throw new Error(`shippie.json.${key} must be ${opts.max} characters or fewer`);
  }
  return value;
}

function stringArrayField(
  record: Record<string, unknown>,
  key: string,
  max: number,
): string[] | undefined {
  const value = record[key];
  if (value == null) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.length === 0)) {
    throw new Error(`shippie.json.${key} must be an array of strings`);
  }
  if (value.length > max) throw new Error(`shippie.json.${key} can contain at most ${max} items`);
  return value as string[];
}

function colorField(record: Record<string, unknown>, key: string): string | undefined {
  const value = stringField(record, key);
  if (value == null) return undefined;
  if (!HEX_COLOR.test(value)) throw new Error(`shippie.json.${key} must be a #RRGGBB color`);
  return value;
}

function booleanField(record: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = record[key];
  if (value == null) return fallback;
  if (typeof value !== 'boolean') throw new Error(`shippie.json.${key} must be a boolean`);
  return value;
}

function enumField<T extends string>(
  record: Record<string, unknown>,
  key: string,
  values: ReadonlySet<T>,
  fallback: T,
): T {
  const value = record[key];
  if (value == null) return fallback;
  if (typeof value !== 'string' || !values.has(value as T)) {
    throw new Error(`Invalid shippie.json.${key}: ${String(value)}`);
  }
  return value as T;
}

function parseLocal(value: unknown): PublicShippieJson['local'] {
  if (value == null) return { database: false, files: false, ai: [], sync: false };
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('shippie.json.local must be an object');
  }
  const record = value as Record<string, unknown>;
  const unknown = Object.keys(record).filter((key) => !LOCAL_KEYS.has(key));
  if (unknown.length > 0) {
    throw new Error(`Unrecognized shippie.json.local field(s): ${unknown.join(', ')}`);
  }
  const aiRaw = record.ai ?? [];
  if (!Array.isArray(aiRaw)) throw new Error('shippie.json.local.ai must be an array');
  for (const mode of aiRaw) {
    if (typeof mode !== 'string' || !LOCAL_AI_MODES.has(mode as PublicLocalAiMode)) {
      throw new Error(`Invalid shippie.json.local.ai mode: ${String(mode)}`);
    }
  }
  return {
    database: booleanField(record, 'database', false),
    files: booleanField(record, 'files', false),
    ai: aiRaw as PublicLocalAiMode[],
    sync: booleanField(record, 'sync', false),
  };
}
