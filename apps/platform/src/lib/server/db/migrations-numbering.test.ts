import { describe, expect, test } from 'vitest';
import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../..');
const DRIZZLE_DIR = resolve(REPO_ROOT, 'apps', 'platform', 'drizzle');

const DOCUMENTED_DUPLICATES: Record<string, string> = {
  '0012': 'pre-existing applied-state split: mevrouw seed and caffeine-log seed',
  '0038': 'pre-existing applied-state split: analytics index and world-cup-fantasy private seed',
  '0039': 'pre-existing applied-state split: golazo seed and reserved slugs',
};

describe('drizzle migration numbering', () => {
  test('new migrations do not introduce duplicate numeric prefixes', () => {
    const files = readdirSync(DRIZZLE_DIR).filter((file) => /^\d{4}_.*\.sql$/.test(file));
    const byPrefix = new Map<string, string[]>();
    for (const file of files) {
      const prefix = file.slice(0, 4);
      byPrefix.set(prefix, [...(byPrefix.get(prefix) ?? []), file]);
    }

    const duplicates = [...byPrefix.entries()]
      .filter(([, group]) => group.length > 1)
      .map(([prefix]) => prefix)
      .sort();

    expect(duplicates).toEqual(Object.keys(DOCUMENTED_DUPLICATES).sort());
  });
});
