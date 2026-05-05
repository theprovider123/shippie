import { describe, expect, test } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHOWCASE_PRECACHE, SHOWCASE_SLUGS } from '$lib/_generated/showcase-catalog';
import { FIRST_PARTY_SHOWCASE_SLUGS } from '$lib/showcase-slugs';
import { curatedApps } from '$lib/container/state';

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

  test('container curated apps match source showcase slugs', () => {
    expect(curatedApps.map((app) => app.slug).sort()).toEqual(slugsFromShowcaseDirs());
  });

  test('container dev URLs match each showcase Vite port', () => {
    const ports = new Map(portsFromShowcaseDirs());
    expect(new Set(ports.values()).size).toBe(ports.size);

    for (const app of curatedApps) {
      const port = ports.get(app.slug);
      expect(port, `${app.slug} should have a Vite dev port`).toBeDefined();
      expect(app.devUrl).toBe(`http://localhost:${port}/`);
    }
  });

  test('every showcase manifest declares canonical launch metadata', () => {
    for (const name of showcaseDirNames()) {
      const manifest = manifestFor(name);
      expect(manifest.slug, `${name} should declare slug`).toBe(slugFor(name));
      expect(typeof manifest.name, `${name} should declare name`).toBe('string');
      expect(typeof manifest.description, `${name} should declare description`).toBe('string');
      expect(typeof manifest.theme_color, `${name} should use theme_color`).toBe('string');
      expect(typeof manifest.background_color, `${name} should use background_color`).toBe('string');
    }
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
  return showcaseDirNames()
    .filter((name) => hasBuildScript(name))
    .map((name) => slugFor(name))
    .sort();
}

function showcaseDirNames(): string[] {
  return readdirSync(APPS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => name.startsWith('showcase-'))
    .sort();
}

function hasBuildScript(name: string): boolean {
  const pkgPath = join(APPS_DIR, name, 'package.json');
  if (!existsSync(pkgPath)) return false;
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { scripts?: Record<string, string> };
  return Boolean(pkg.scripts?.build);
}

function slugFor(name: string): string {
  const manifest = manifestFor(name);
  if (typeof manifest.slug === 'string' && manifest.slug.length > 0) return manifest.slug;
  return name.replace(/^showcase-/, '');
}

function manifestFor(name: string): Record<string, unknown> {
  const manifestPath = join(APPS_DIR, name, 'shippie.json');
  if (!existsSync(manifestPath)) return {};
  return JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
}

function portsFromShowcaseDirs(): Array<[string, number]> {
  return readdirSync(APPS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => name.startsWith('showcase-'))
    .filter((name) => hasBuildScript(name))
    .map((name) => {
      const slug = slugFor(name);
      const viteConfig = readFileSync(join(APPS_DIR, name, 'vite.config.ts'), 'utf8');
      const match = /port:\s*(\d{4,5})/.exec(viteConfig);
      if (!match) throw new Error(`${name} is missing server.port in vite.config.ts`);
      return [slug, Number(match[1])] as [string, number];
    })
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}
