import { describe, expect, test } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIRST_PARTY_CURATION } from '$lib/_generated/first-party-curation';
import { SHOWCASE_PRECACHE, SHOWCASE_SLUGS } from '$lib/_generated/showcase-catalog';
import { FIRST_PARTY_SHOWCASE_SLUGS } from '$lib/showcase-slugs';
import { curatedApps } from '$lib/container/state';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const APPS_DIR = join(REPO_ROOT, 'apps');
const STATIC_RUNTIME_DIR = join(REPO_ROOT, 'apps', 'platform', 'static', '__shippie-run');

describe('showcase catalog drift check', () => {
  test('generated slugs match hosted showcase runtime directories', () => {
    if (!existsSync(STATIC_RUNTIME_DIR)) return;
    expect([...SHOWCASE_SLUGS].sort()).toEqual(staticRuntimeSlugs());
  });

  test('first-party slug set uses the generated curation manifest', () => {
    expect([...FIRST_PARTY_SHOWCASE_SLUGS].sort()).toEqual(
      FIRST_PARTY_CURATION.map((entry) => entry.slug).sort(),
    );
  });

  test('container curated apps match hosted showcase slugs', () => {
    if (!existsSync(STATIC_RUNTIME_DIR)) return;
    expect(curatedApps.map((app) => app.slug).sort()).toEqual(staticRuntimeSlugs());
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

  test('static runtime inventory has no stale or missing showcase directories', () => {
    if (!existsSync(STATIC_RUNTIME_DIR)) return;
    expect(staticRuntimeSlugs()).toEqual([...SHOWCASE_SLUGS].sort());
  });

  test('static showcase runtimes install the container local-db bridge before app modules', () => {
    if (!existsSync(STATIC_RUNTIME_DIR)) return;

    for (const slug of SHOWCASE_SLUGS) {
      const indexPath = join(STATIC_RUNTIME_DIR, slug, 'index.html');
      if (!existsSync(indexPath)) continue;
      const html = readFileSync(indexPath, 'utf8');
      const bridgeIndex = html.indexOf('data-shippie-container-local-db');
      const moduleIndex = html.indexOf('<script type="module"');
      expect(bridgeIndex, `${slug} should install container local DB bridge`).toBeGreaterThan(-1);
      expect(moduleIndex, `${slug} should load a module bundle`).toBeGreaterThan(-1);
      expect(bridgeIndex, `${slug} bridge should run before app module`).toBeLessThan(moduleIndex);
    }
  });

  test('precache entries are derived from every generated slug', () => {
    expect(SHOWCASE_PRECACHE).toEqual(
      SHOWCASE_SLUGS.map((slug) => `/__shippie-run/${slug}/?shippie_embed=1`),
    );
  });
});

function slugsFromShowcaseDirs(): string[] {
  return showcaseDirNames()
    .filter((name) => hasBuildScript(name))
    .map((name) => slugFor(name))
    .sort();
}

function staticRuntimeSlugs(): string[] {
  return readdirSync(STATIC_RUNTIME_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => existsSync(join(STATIC_RUNTIME_DIR, entry.name, 'index.html')))
    .map((entry) => entry.name)
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
