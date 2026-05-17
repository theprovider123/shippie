import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const APPS_DIR = new URL('../../../../', import.meta.url).pathname;

describe('showcase lifecycle boot guard', () => {
  test('showcase entrypoints use the deterministic boot helper or opt out explicitly', () => {
    const offenders = readdirSync(APPS_DIR)
      .filter((name) => name.startsWith('showcase-'))
      .filter((dir) => {
        const appDir = join(APPS_DIR, dir);
        const mainPath = join(appDir, 'src', 'main.tsx');
        if (!existsSync(mainPath)) return false;

        const manifest = readManifest(join(appDir, 'shippie.json'));
        if (manifest.lifecycle === 'manual') return false;

        const source = readFileSync(mainPath, 'utf8');
        return !source.includes("@shippie/showcase-kit/boot");
      });

    expect(offenders).toEqual([]);
  });
});

function readManifest(path: string): { lifecycle?: unknown } {
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, 'utf8')) as { lifecycle?: unknown };
}
