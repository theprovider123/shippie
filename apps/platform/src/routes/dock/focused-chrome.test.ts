import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const DOCK_PAGE_SOURCE = readFileSync(resolve(HERE, '+page.svelte'), 'utf8');

describe('focused dock chrome', () => {
  test('the Shippie mark toggles the focused drawer instead of exiting the running app', () => {
    const handler = DOCK_PAGE_SOURCE.match(
      /function handleFocusedToolsPress\(event: Event\) \{([\s\S]*?)\n  \}/,
    )?.[1];

    expect(handler).toContain('toggleFocusedDrawer();');
    expect(handler).not.toContain("exitFocusedMode('home')");
    expect(DOCK_PAGE_SOURCE).toMatch(
      /<button[\s\S]*class="focused-chrome-button focused-chrome-tools"/,
    );
    expect(DOCK_PAGE_SOURCE).not.toMatch(
      /<a[\s\S]*class="focused-chrome-button focused-chrome-tools"/,
    );
    expect(DOCK_PAGE_SOURCE).not.toContain('focused-chrome-options');
    expect(DOCK_PAGE_SOURCE).not.toContain('focusedToolOptionsOpen');
  });

  test('mobile focused chrome stays above app controls', () => {
    const focusedMobileStart = DOCK_PAGE_SOURCE.indexOf(
      '    .focused-chrome-button {\n      top: calc(env(safe-area-inset-top, 0px) + 10px);',
    );
    const focusedMobileEnd = DOCK_PAGE_SOURCE.indexOf(
      '\n  }\n\n  .focused-shell :global(.drawer)',
      focusedMobileStart,
    );
    const mobileBlock = DOCK_PAGE_SOURCE.slice(focusedMobileStart, focusedMobileEnd);

    expect(mobileBlock).toContain('top: calc(env(safe-area-inset-top, 0px) + 10px);');
    expect(mobileBlock).toContain('bottom: auto;');
    expect(mobileBlock).toMatch(/\.focused-chrome-tools \{[\s\S]*left: 50%;/);
    expect(mobileBlock).toMatch(/\.focused-chrome-tools \{[\s\S]*transform: translateX\(-50%\);/);
    expect(mobileBlock).toContain('transform: translateX(-50%) translateY(-140%);');
    expect(DOCK_PAGE_SOURCE).not.toContain(
      'bottom: calc(env(safe-area-inset-bottom, 0px) + 18px);',
    );
  });

  test('focused switcher owns share actions and dark drawer styling', () => {
    expect(DOCK_PAGE_SOURCE).toContain('class="focused-current-tool"');
    expect(DOCK_PAGE_SOURCE).toContain('onclick={shareActiveTool}');
    expect(DOCK_PAGE_SOURCE).toContain('onclick={copyActiveToolLink}');
    expect(DOCK_PAGE_SOURCE).toContain('class="focused-current-action primary"');
    expect(DOCK_PAGE_SOURCE).not.toContain('focused-options-panel');
    expect(DOCK_PAGE_SOURCE).not.toContain('Share and options');

    const drawerStyle = DOCK_PAGE_SOURCE.match(
      /\.focused-shell :global\(\.drawer\) \{([\s\S]*?)\n  \}/,
    )?.[1];
    expect(drawerStyle).toContain('--cream-bg: #0F0D0A;');
    expect(drawerStyle).toContain('--cream-text: #EDE4D3;');
    expect(drawerStyle).toContain('background: #0F0D0A;');
  });
});
