import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractChangelog } from './changelog';

function files(entries: Record<string, string>): Map<string, Buffer> {
  return new Map(Object.entries(entries).map(([k, v]) => [k, Buffer.from(v)]));
}

test('extracts entries from CHANGELOG.md', () => {
  const r = extractChangelog({
    files: files({
      'CHANGELOG.md': '## v2.0\n- Fixed login bug\n- Added dark mode\n## v1.0\n- Initial release',
    }),
    version: 2,
  });
  assert.equal(r.source, 'CHANGELOG.md');
  assert.equal(r.summary, 'v2.0');
  assert.deepEqual(r.entries, ['Fixed login bug', 'Added dark mode']);
});

test('case-insensitive filename lookup', () => {
  const r = extractChangelog({
    files: files({ 'changelog.md': '## First\n- Item one' }),
    version: 1,
  });
  assert.equal(r.source, 'CHANGELOG.md');
  assert.equal(r.entries.length, 1);
});

test('no changelog file returns default', () => {
  const r1 = extractChangelog({ files: new Map(), version: 1 });
  assert.equal(r1.source, 'default');
  assert.equal(r1.summary, 'Initial release');

  const r2 = extractChangelog({ files: new Map(), version: 3 });
  assert.equal(r2.summary, 'Updates in v3');
});

test('changelog with no ## headings returns first line', () => {
  const r = extractChangelog({
    files: files({ 'CHANGELOG.md': 'Just some notes about changes.' }),
    version: 1,
  });
  assert.equal(r.source, 'CHANGELOG.md');
  assert.equal(r.summary, 'Just some notes about changes.');
});
