import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(fileURLToPath(new URL('./+page.svelte', import.meta.url)), 'utf8');

describe('focused Dock drawer labels', () => {
  it('uses the Dock / Tools / You product vocabulary', () => {
    const drawerActions = source.match(/<nav class="focused-drawer-actions"[\s\S]*?<\/nav>/)?.[0] ?? '';

    expect(drawerActions).toContain('>Dock<');
    expect(drawerActions).toContain('>Tools<');
    expect(drawerActions).toContain('>You<');
    expect(drawerActions).not.toContain('>Browse<');
    expect(drawerActions).not.toContain('>Data<');
  });

  it('keeps primary Dock rail actions on Tools / You language', () => {
    const railActions = source.match(/<nav class="rail-foot"[\s\S]*?<\/nav>/)?.[0] ?? '';

    expect(railActions).toContain('Browse tools');
    expect(railActions).toContain('>You<');
    expect(railActions).not.toContain('>Data<');
    expect(railActions).not.toContain('Sign in to sync');
  });
});
