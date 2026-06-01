import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrationsByNumber, nextMigrationNumber, offendingDuplicates } from './check-migrations.mjs';

const made: string[] = [];
function fixture(files: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'mig-'));
  made.push(dir);
  for (const f of files) writeFileSync(join(dir, f), '-- test\n');
  return dir;
}
afterAll(() => made.forEach((d) => rmSync(d, { recursive: true, force: true })));

describe('check-migrations', () => {
  it('flags a NEW duplicate number', () => {
    const dir = fixture(['0099_seed_a.sql', '0099_seed_b.sql', '0100_other.sql']);
    const off = offendingDuplicates(dir);
    expect(off).toHaveLength(1);
    expect(off[0]!.num).toBe('0099');
    expect(off[0]!.files).toEqual(['0099_seed_a.sql', '0099_seed_b.sql']);
  });

  it('ignores grandfathered numbers (0012/0038/0039)', () => {
    const dir = fixture(['0012_seed_mevrouw.sql', '0012_seed_caffeine.sql', '0040_ok.sql']);
    expect(offendingDuplicates(dir)).toHaveLength(0);
  });

  it('allocates the next free number as max+1, zero-padded', () => {
    const dir = fixture(['0041_a.sql', '0042_b.sql', '0043_c.sql']);
    expect(nextMigrationNumber(dir)).toBe('0044');
  });

  it('ignores non-migration files', () => {
    const dir = fixture(['0001_real.sql', 'meta.json', 'README.md', 'notes_0001.txt']);
    expect(migrationsByNumber(dir).size).toBe(1);
  });

  it('the real drizzle dir has no NON-grandfathered duplicates', () => {
    // default dir = apps/platform/drizzle
    expect(offendingDuplicates()).toHaveLength(0);
  });
});
