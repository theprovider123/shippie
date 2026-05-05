import { describe, expect, test } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHOWCASE_PRECACHE, SHOWCASE_SLUGS } from '$lib/_generated/showcase-catalog';
import { FIRST_PARTY_SHOWCASE_SLUGS } from '$lib/showcase-slugs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const APPS_DIR = join(REPO_ROOT, 'apps');
const STATIC_RUN_DIR = join(REPO_ROOT, 'apps', 'platform', 'static', 'run');

describe('showcase catalog drift check', () => {
  test('generated slugs match buildable apps/showcase-* directories', () => {
    expect([...SHOWCASE_SLUGS].sort()).toEqual(slugsFromShowcaseDirs());
  });

  test('first-party slug set uses the generated catalog', () => {
    expect([...FIRST_PARTY_SHOWCASE_SLUGS].sort()).toEqual([...SHOWCASE_SLUGS].sort());
  });

  test('static run inventory has no stale or missing showcase directories', () => {
    if (!existsSync(STATIC_RUN_DIR)) return;
    const staticSlugs = readdirSync(STATIC_RUN_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .filter((entry) => existsSync(join(STATIC_RUN_DIR, entry.name, 'index.html')))
      .map((entry) => entry.name)
      .sort();
    expect(staticSlugs).toEqual([...SHOWCASE_SLUGS].sort());
  });

  test('precache entries are derived from every generated slug', () => {
    expect(SHOWCASE_PRECACHE).toEqual(
      SHOWCASE_SLUGS.flatMap((slug) => [`/run/${slug}/`, `/run/${slug}/index.html`]),
    );
  });
});

function slugsFromShowcaseDirs(): string[] {
  return readdirSync(APPS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => name.startsWith('showcase-'))
    .filter((name) => hasBuildScript(name))
    .map((name) => slugFor(name))
    .sort();
}

function hasBuildScript(name: string): boolean {
  const pkgPath = join(APPS_DIR, name, 'package.json');
  if (!existsSync(pkgPath)) return false;
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { scripts?: Record<string, string> };
  return Boolean(pkg.scripts?.build);
}

function slugFor(name: string): string {
  const manifestPath = join(APPS_DIR, name, 'shippie.json');
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { slug?: unknown };
    if (typeof manifest.slug === 'string' && manifest.slug.length > 0) return manifest.slug;
  }
  return name.replace(/^showcase-/, '');
}
