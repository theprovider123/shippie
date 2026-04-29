import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { graduateScaffold } from './graduate.ts';

function withTempCwd<T>(fn: (dir: string) => T): T {
  const cwd = process.cwd();
  const dir = mkdtempSync(join(tmpdir(), 'shippie-graduate-'));
  try {
    process.chdir(dir);
    return fn(dir);
  } finally {
    process.chdir(cwd);
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('graduateScaffold', () => {
  test('rejects invalid slugs', () => {
    expect(() => graduateScaffold({ slug: 'BAD SLUG' })).toThrow(/Invalid slug/);
    expect(() => graduateScaffold({ slug: '-leading' })).toThrow(/Invalid slug/);
    expect(() => graduateScaffold({ slug: '' })).toThrow(/Invalid slug/);
  });

  test('produces capacitor.config.ts pointing at the deployed PWA', () => {
    withTempCwd(() => {
      const result = graduateScaffold({ slug: 'recipe-saver' });
      expect(result.files).toContain('capacitor.config.ts');
      const cfg = readFileSync(join(result.outDir, 'capacitor.config.ts'), 'utf8');
      expect(cfg).toContain('https://recipe-saver.shippie.app');
      expect(cfg).toContain("appId: 'app.shippie.recipesaver'");
      expect(cfg).toContain("appName: 'Recipe Saver'");
    });
  });

  test('honours an explicit serverUrl override', () => {
    withTempCwd(() => {
      const result = graduateScaffold({
        slug: 'recipe-saver',
        serverUrl: 'https://shippie.app/apps/recipe-saver',
      });
      const cfg = readFileSync(join(result.outDir, 'capacitor.config.ts'), 'utf8');
      expect(cfg).toContain('https://shippie.app/apps/recipe-saver');
    });
  });

  test('writes a redirect shim that targets the same URL', () => {
    withTempCwd(() => {
      const result = graduateScaffold({ slug: 'habit-tracker' });
      const html = readFileSync(join(result.outDir, 'www/index.html'), 'utf8');
      expect(html).toContain('https://habit-tracker.shippie.app');
    });
  });

  test('package.json declares the @capacitor deps and helper scripts', () => {
    withTempCwd(() => {
      const result = graduateScaffold({ slug: 'demo' });
      const pkg = JSON.parse(readFileSync(join(result.outDir, 'package.json'), 'utf8'));
      expect(pkg.dependencies['@capacitor/core']).toBeDefined();
      expect(pkg.dependencies['@capacitor/android']).toBeDefined();
      expect(pkg.dependencies['@capacitor/ios']).toBeDefined();
      expect(pkg.scripts['cap:sync']).toBe('npx cap sync');
    });
  });

  test('errors when the output directory already exists without --force', () => {
    withTempCwd(() => {
      graduateScaffold({ slug: 'demo' });
      expect(() => graduateScaffold({ slug: 'demo' })).toThrow(/already exists/);
    });
  });

  test('overwrites with --force', () => {
    withTempCwd(() => {
      graduateScaffold({ slug: 'demo' });
      const result = graduateScaffold({ slug: 'demo', force: true });
      expect(existsSync(join(result.outDir, 'capacitor.config.ts'))).toBe(true);
    });
  });

  test('returns nextSteps that walk the maker through Capacitor', () => {
    withTempCwd(() => {
      const result = graduateScaffold({ slug: 'demo' });
      expect(result.nextSteps.some((s) => s.includes('cap:add:android'))).toBe(true);
      expect(result.nextSteps.some((s) => s.includes('cap:add:ios'))).toBe(true);
    });
  });
});
