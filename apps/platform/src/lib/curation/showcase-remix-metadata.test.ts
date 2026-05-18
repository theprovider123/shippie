import { describe, expect, test } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = new URL('../../../../../', import.meta.url);
const appsDir = new URL('apps/', repoRoot);

describe('first-party showcase remix metadata', () => {
  test('every first-party showcase declares source, license, and remix opt-in', () => {
    const missing: string[] = [];
    const showcaseDirs = readdirSync(appsDir)
      .filter((name) => name.startsWith('showcase-'))
      .sort();

    for (const dir of showcaseDirs) {
      const manifestPath = join(appsDir.pathname, dir, 'shippie.json');
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
      const expectedSource = `https://github.com/theprovider123/shippie/tree/main/apps/${dir}`;

      if (manifest.source_repo !== expectedSource) missing.push(`${dir}: source_repo`);
      if (typeof manifest.license !== 'string' || manifest.license.length === 0) missing.push(`${dir}: license`);
      if (manifest.remix_allowed !== true) missing.push(`${dir}: remix_allowed`);
    }

    expect(missing).toEqual([]);
  });
});
