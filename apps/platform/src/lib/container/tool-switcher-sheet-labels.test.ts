import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(fileURLToPath(new URL('./ToolSwitcherSheet.svelte', import.meta.url)), 'utf8');

describe('ToolSwitcherSheet labels', () => {
  it('uses the same Dock / Tools / You vocabulary as the rest of Shippie', () => {
    const actions = source.match(/<nav class="switcher-nav"[\s\S]*?<\/nav>/)?.[0] ?? '';

    expect(actions).toContain('>Dock<');
    expect(actions).toContain('>Tools<');
    expect(actions).toContain('>You<');
    expect(actions).not.toContain('>Access<');
    expect(actions).not.toContain('>Data<');
    expect(actions).not.toContain('>Browse<');
  });

  it('renders rows via the ToolRow primitive, not hardcoded relationship copy', () => {
    expect(source).toContain('ToolRow');
    // These drift phrases now come from labels.ts via ToolRow, never inline.
    expect(source).not.toContain('Running now');
    expect(source).not.toContain('Saved to Dock');
  });
});
