import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(fileURLToPath(new URL('./+layout.svelte', import.meta.url)), 'utf8');

describe('layout immersive tool chrome', () => {
  it('suppresses global nav for full-screen tool routes', () => {
    expect(source).toContain('function isImmersiveToolRoute');
    expect(source).toContain("url.pathname.startsWith('/run')");
    expect(source).toContain('!isImmersiveToolRoute($page.url)');
    expect(source).toContain('class:immersive-tool-route={isImmersiveToolRoute($page.url)}');
  });
});
