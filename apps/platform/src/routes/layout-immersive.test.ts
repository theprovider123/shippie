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

  it('lets immersive apps occupy the viewport without reserved nav padding', () => {
    expect(source).toContain('function isImmersiveApp');
    expect(source).toContain("url.pathname === '/uniti'");
    expect(source).toContain('class:immersive={isImmersiveApp($page.url)}');
    expect(source).toContain('main.immersive');
    expect(source).toContain('position: fixed;');
    expect(source).toContain(":global(body[data-immersive='true'])");
    expect(source).toContain('padding-top: 0;');
  });
});
