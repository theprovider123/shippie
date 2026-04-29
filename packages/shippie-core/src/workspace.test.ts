import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deployWorkspace, readWorkspacePlan } from './workspace.ts';

const TMP = join(tmpdir(), 'shippie-workspace-test-' + Date.now());

describe('workspace', () => {
  beforeEach(() => {
    mkdirSync(join(TMP, 'fan'), { recursive: true });
    mkdirSync(join(TMP, 'display'), { recursive: true });
    writeFileSync(join(TMP, 'fan', 'index.html'), '<html>fan</html>');
    writeFileSync(join(TMP, 'display', 'index.html'), '<html>display</html>');
    writeFileSync(
      join(TMP, 'shippie-workspace.json'),
      JSON.stringify({
        workspace: 'matchday',
        apps: [
          { slug: 'matchday-fan', directory: 'fan', role: 'fan' },
          { slug: 'matchday-display', directory: 'display', role: 'display' },
        ],
        shared: { groupCode: 'auto' },
      }),
    );
  });

  afterEach(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  test('reads a workspace plan from a directory', () => {
    const plan = readWorkspacePlan(TMP);
    expect('error' in plan).toBe(false);
    if ('error' in plan) return;
    expect(plan.workspace).toBe('matchday');
    expect(plan.shared.groupCode).toBe('auto');
    expect(plan.apps.map((app) => app.slug)).toEqual(['matchday-fan', 'matchday-display']);
    expect(plan.apps[0]?.absoluteDirectory).toBe(join(TMP, 'fan'));
  });

  test('dry-run deploy returns the plan without uploading', async () => {
    const result = await deployWorkspace(
      { apiUrl: 'https://example.com', token: null },
      { path: TMP, dryRun: true },
    );
    expect(result.ok).toBe(true);
    expect(result.apps).toHaveLength(2);
    expect(result.apps.every((app) => app.skipped)).toBe(true);
  });

  test('invalid app slug returns a useful error', () => {
    writeFileSync(
      join(TMP, 'shippie-workspace.json'),
      JSON.stringify({ workspace: 'bad', apps: [{ slug: 'Bad Slug' }] }),
    );
    const plan = readWorkspacePlan(TMP);
    expect(plan).toEqual({ error: 'apps[0].slug must be a valid Shippie slug' });
  });
});
