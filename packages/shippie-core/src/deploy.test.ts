import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deployDirectory } from './deploy.ts';

const TMP = join(tmpdir(), 'shippie-core-deploy-test-' + Date.now());

describe('deployDirectory', () => {
  beforeEach(() => {
    mkdirSync(TMP, { recursive: true });
    writeFileSync(join(TMP, 'index.html'), '<html>ok</html>');
  });
  afterEach(() => {
    try {
      rmSync(TMP, { recursive: true, force: true });
    } catch {}
  });

  test('returns error when directory missing', async () => {
    const result = await deployDirectory(
      { apiUrl: 'https://example.com', token: 'tok' },
      { directory: '/no/such/path' },
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain('directory not found');
  });

  test('non-trial deploy without token surfaces no_auth_token', async () => {
    const result = await deployDirectory(
      { apiUrl: 'https://example.com', token: null },
      { directory: TMP, slug: 'test-app' },
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain('no_auth_token');
  });
});
