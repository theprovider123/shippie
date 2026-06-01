import { describe, expect, test } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalIntentFor } from '@shippie/intents';
import { curatedApps, curatedAppsBySurface } from '$lib/container/state';
import {
  VALID_CATEGORIES,
  VALID_SURFACES,
  VALID_TIERS,
  VALID_VISIBILITIES,
} from './schema';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const APPS_DIR = join(REPO_ROOT, 'apps');

const PUBLIC_FLAGSHIPS = [
  'palate',
  'chiwit',
  'mise',
  'symptom-diary',
  'lift',
  'golazo',
  'tab',
  'receipt-snap',
  'voice-memo',
  'journal',
  'read-later',
  'match-room',
] as const;

const PRIVATE_FLAGSHIPS = [
  'mevrouw',
  'cycle',
  'therapy-notes',
  'care-log',
  'co-pilot',
  'hearth',
] as const;

describe('first-party showcase manifest contract', () => {
  test('every showcase declares visibility, surface, category, and tier', () => {
    for (const manifest of manifests()) {
      expect(VALID_VISIBILITIES, `${manifest.slug} visibility`).toContain(manifest.visibility);
      expect(VALID_SURFACES, `${manifest.slug} curation.surface`).toContain(manifest.curation?.surface);
      expect(VALID_CATEGORIES, `${manifest.slug} curation.category`).toContain(manifest.curation?.category);
      expect(VALID_TIERS, `${manifest.slug} curation.tier`).toContain(manifest.curation?.tier);
      expect(manifest.curation?.surface, `${manifest.slug} must not create a private surface`).not.toBe('private');
    }
  });

  test('approved public and private flagship rosters are explicit', () => {
    const bySlug = new Map(manifests().map((manifest) => [manifest.slug, manifest]));

    for (const slug of PUBLIC_FLAGSHIPS) {
      const manifest = bySlug.get(slug);
      expect(manifest?.visibility, slug).toBe('public');
      expect(manifest?.curation?.surface, slug).toBe('featured');
      expect(manifest?.curation?.tier, slug).toBe('public-flagship');
    }

    for (const slug of PRIVATE_FLAGSHIPS) {
      const manifest = bySlug.get(slug);
      expect(manifest?.visibility, slug).toBe('private');
      expect(manifest?.curation?.surface, slug).toBe('labs');
      expect(manifest?.curation?.tier, slug).toBe('private-flagship');
    }
  });

  test('private flagships stay out of public curated surfaces', () => {
    const publicSurfaceSlugs = new Set(
      [...curatedAppsBySurface('featured'), ...curatedAppsBySurface('arcade'), ...curatedAppsBySurface('labs')]
        .map((app) => app.slug),
    );
    for (const slug of PRIVATE_FLAGSHIPS) {
      expect(publicSurfaceSlugs.has(slug), slug).toBe(false);
      const app = curatedApps.find((candidate) => candidate.slug === slug);
      expect(app?.visibility, slug).toBe('private');
      expect(app?.tier, slug).toBe('private-flagship');
    }
  });

  test('declared legacy and canonical intents resolve through @shippie/intents', () => {
    for (const manifest of manifests()) {
      for (const [direction, intents] of Object.entries(manifest.intents ?? {})) {
        if (!Array.isArray(intents)) continue;
        for (const intent of intents) {
          expect(canonicalIntentFor(intent), `${manifest.slug} ${direction} ${intent}`).not.toBeNull();
        }
      }
    }
  });

  test('icons are same-origin or relative assets', () => {
    for (const manifest of manifests()) {
      if (!manifest.icon) continue;
      expect(typeof manifest.icon, `${manifest.slug} icon`).toBe('string');
      expect(/^(?:\/|\.\/|\.\.\/|data:image\/)/.test(manifest.icon), `${manifest.slug} icon ${manifest.icon}`).toBe(true);
    }
  });
});

type ShowcaseManifest = {
  slug: string;
  visibility?: string;
  icon?: string;
  curation?: {
    surface?: string;
    category?: string;
    tier?: string;
  };
  intents?: Record<string, unknown>;
};

function manifests(): ShowcaseManifest[] {
  return readdirSync(APPS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => name.startsWith('showcase-'))
    .filter((name) => existsSync(join(APPS_DIR, name, 'shippie.json')))
    .map((name) => JSON.parse(readFileSync(join(APPS_DIR, name, 'shippie.json'), 'utf8')) as ShowcaseManifest)
    .sort((a, b) => a.slug.localeCompare(b.slug));
}
