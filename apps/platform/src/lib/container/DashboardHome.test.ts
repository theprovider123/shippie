import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./DashboardHome.svelte', import.meta.url), 'utf8');

describe('DashboardHome launchpad grid (guardrail)', () => {
  test('has a grid/manage view toggle', () => {
    expect(src).toMatch(/dockView\s*=\s*\$state<'grid' \| 'manage'>/);
    expect(src).toContain('class="view-toggle"');
  });
  test('renders ToolRow tiles in grid view', () => {
    expect(src).toContain('variant="tile"');
    expect(src).toContain('class="dock-tile-grid"');
  });
  test('keeps the row list for manage view', () => {
    expect(src).toContain('class="dock-row-list"');
  });
});
