import { describe, expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectDataPolicy } from './data';

function tempApp(config: unknown) {
  const dir = mkdtempSync(join(tmpdir(), 'shippie-data-doctor-'));
  writeFileSync(join(dir, 'shippie.json'), JSON.stringify(config, null, 2));
  return dir;
}

describe('shippie data doctor', () => {
  test('passes inherited Shippie Documents data policy', () => {
    const dir = tempApp({
      name: 'Journal',
      data: {
        mode: 'shippie-documents',
        documents: ['main'],
        attachments: true,
        recovery: 'inherited',
        migrations: 'snapshot-v0',
        snapshots: 'inherited',
        media: 'encrypted-chunked',
        realtime: 'inherited',
      },
    });
    const report = inspectDataPolicy(dir);
    expect(report.ok).toBe(true);
    expect(report.findings.some((finding) => finding.message.includes('Your Data recovery'))).toBe(true);
  });

  test('fails missing data block', () => {
    const dir = tempApp({ name: 'Legacy App' });
    const report = inspectDataPolicy(dir);
    expect(report.ok).toBe(false);
    expect(report.findings[0]?.message).toContain('Missing data block');
  });
});
