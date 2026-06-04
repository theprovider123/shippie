import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(fileURLToPath(new URL('./ToolSwitcherSheet.svelte', import.meta.url)), 'utf8');

describe('ToolSwitcherSheet labels', () => {
  it('uses the same Dock / Tools / You vocabulary as the rest of Shippie', () => {
    const actions = source.match(/<div class="switcher-actions"[\s\S]*?<\/div>/)?.[0] ?? '';

    expect(actions).toContain('>Dock<');
    expect(actions).toContain('>Tools<');
    expect(actions).toContain('>You<');
    expect(actions).not.toContain('>Access<');
    expect(actions).not.toContain('>Data<');
    expect(actions).not.toContain('>Browse<');
  });
});
