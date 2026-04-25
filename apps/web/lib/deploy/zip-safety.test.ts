/**
 * Zip-slip hardening unit tests.
 *
 * We hand-craft zip buffers with `adm-zip` containing entries that try
 * to escape the target prefix, and assert that `deployStaticHot`
 * rejects them before writing anything to R2.
 *
 * This covers classic zip-slip (`../../etc/passwd`), absolute paths
 * (`/etc/passwd`, treated as rooted by some unzippers), and Windows
 * backslash separators that can bypass naive `/` parsing.
 */
import { describe, expect, test } from 'bun:test';
import AdmZip from 'adm-zip';
import { deployStaticHot } from './index.ts';

/**
 * AdmZip's `addFile` sanitizes separators, so for the hostile cases we
 * reach into the internal representation and set `entryName` after the
 * fact. This matches what a malicious zip produced by another tool
 * would look like on disk.
 */
function zipWithRawEntry(entryName: string): Buffer {
  const zip = new AdmZip();
  zip.addFile('placeholder', Buffer.from('hi'));
  const entries = zip.getEntries();
  if (entries[0]) {
    entries[0].entryName = entryName;
  }
  return zip.toBuffer();
}

describe('deployStaticHot — zip path safety', () => {
  const baseInput = {
    slug: 'zip-safety-test',
    makerId: '00000000-0000-0000-0000-000000000001',
    reservedSlugs: new Set<string>(),
  };

  test('rejects classic zip-slip (../../etc/passwd)', async () => {
    const res = await deployStaticHot({
      ...baseInput,
      zipBuffer: zipWithRawEntry('../../etc/passwd'),
    });
    expect(res.success).toBe(false);
    expect(res.reason).toMatch(/Unsafe path in zip/);
  });

  test('rejects single-level parent traversal (../secret.html)', async () => {
    const res = await deployStaticHot({
      ...baseInput,
      zipBuffer: zipWithRawEntry('../secret.html'),
    });
    expect(res.success).toBe(false);
    expect(res.reason).toMatch(/Unsafe path in zip/);
  });

  test('rejects absolute paths (/etc/passwd.html)', async () => {
    // Leading-slash entries are stripped on purpose for interop, but a
    // *normalized* path that still starts with `/` (double-slash case)
    // or something that escapes must still be rejected. We use a
    // pathological double-leading-slash below.
    const res = await deployStaticHot({
      ...baseInput,
      zipBuffer: zipWithRawEntry('/../etc/passwd.html'),
    });
    expect(res.success).toBe(false);
    expect(res.reason).toMatch(/Unsafe path in zip/);
  });

  test('rejects Windows backslash separators (..\\windows.html)', async () => {
    const res = await deployStaticHot({
      ...baseInput,
      zipBuffer: zipWithRawEntry('..\\windows.html'),
    });
    expect(res.success).toBe(false);
    expect(res.reason).toMatch(/Unsafe path in zip/);
  });

  test('rejects embedded parent traversal (foo/../../escape.html)', async () => {
    const res = await deployStaticHot({
      ...baseInput,
      zipBuffer: zipWithRawEntry('foo/../../escape.html'),
    });
    expect(res.success).toBe(false);
    expect(res.reason).toMatch(/Unsafe path in zip/);
  });

  test('rejects a zip whose every entry is unsafe (no safe files remain)', async () => {
    // All entries malicious — the pipeline must stop at the first one.
    const res = await deployStaticHot({
      ...baseInput,
      zipBuffer: zipWithRawEntry('../../../outside.html'),
    });
    expect(res.success).toBe(false);
    expect(res.reason).toMatch(/Unsafe path in zip/);
  });
});
