import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./DashboardHome.svelte', import.meta.url), 'utf8');

describe('DashboardHome launchpad grid (guardrail)', () => {
  test('renders one tile grid — no separate manage mode', () => {
    expect(src).toContain('class="dock-tile-grid"');
    expect(src).toContain('variant="tile"');
    // Manage was redundant (same tools + actions, row layout). Removed:
    expect(src).not.toContain('class="view-toggle"');
    expect(src).not.toMatch(/dockView\s*=\s*\$state/);
    expect(src).not.toContain('class="dock-row-list"');
  });
  test('tiles carry open + close/remove inline (what manage used to expose)', () => {
    expect(src).toContain('onOpen={() => onOpenTool(tool.slug)}');
    expect(src).toContain('onCloseTool(tool.slug)');
    expect(src).toContain('onRemoveSavedTool(tool.slug)');
  });
  test('collapses empty sections (no group rendered when its list is empty)', () => {
    expect(src).toContain('dockGroups.open.length > 0');
    expect(src).toContain('dockGroups.recent.length > 0');
    expect(src).toContain('dockGroups.saved.length > 0');
  });
});
