import { describe, expect, test } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const APPS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../');

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === 'build') continue;
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) out.push(...listSourceFiles(path));
    else if (/\.(tsx?|jsx?)$/.test(name)) out.push(path);
  }
  return out;
}

describe('showcase Your Data integration guard', () => {
  test('showcase apps do not link directly to the dead standalone data route', () => {
    const showcaseDirs = readdirSync(APPS_DIR)
      .filter((name) => name.startsWith('showcase-'))
      .map((name) => join(APPS_DIR, name, 'src'))
      .filter((path) => existsSync(path));

    const offenders = showcaseDirs.flatMap((dir) =>
      listSourceFiles(dir).filter((file) => readFileSync(file, 'utf-8').includes('/__shippie/data')),
    );

    expect(offenders).toEqual([]);
  });
});
