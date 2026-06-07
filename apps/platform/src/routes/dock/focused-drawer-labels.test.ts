import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(fileURLToPath(new URL('./+page.svelte', import.meta.url)), 'utf8');
// The Dock rail was extracted into its own component; its labels live there now.
const railSource = readFileSync(
  fileURLToPath(new URL('../../lib/container/DockRail.svelte', import.meta.url)),
  'utf8',
);

describe('focused Dock drawer labels', () => {
  it('uses the Dock / Tools / You product vocabulary', () => {
    const drawerActions = source.match(/<nav class="focused-drawer-actions"[\s\S]*?<\/nav>/)?.[0] ?? '';

    expect(drawerActions).toContain('>Dock<');
    expect(drawerActions).toContain('>Tools<');
    expect(drawerActions).toContain('>You<');
    expect(drawerActions).not.toContain('>Browse<');
    expect(drawerActions).not.toContain('>Data<');
  });

  it('keeps the primary Dock rail nav on Dock / Tools / You language', () => {
    const railPrimary = railSource.match(/<nav class="rail-nav" aria-label="Primary"[\s\S]*?<\/nav>/)?.[0] ?? '';

    expect(railPrimary).toContain('>Dock<');
    expect(railPrimary).toContain('>Tools<');
    expect(railPrimary).toContain('>You<');
    expect(railPrimary).not.toContain('>Browse<');
    expect(railPrimary).not.toContain('>Data<');
    expect(railPrimary).not.toContain('Sign in to sync');
  });
});
