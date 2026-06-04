import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(fileURLToPath(new URL('./+page.svelte', import.meta.url)), 'utf8');

describe('login copy', () => {
  it('does not promise opening maker before the user is signed in', () => {
    expect(source).toContain("primary: 'Sign in to Maker'");
    expect(source).not.toContain("primary: 'Open Maker'");
  });

  it('keeps the requires-account hero to one primary action', () => {
    const requiresAccountBlock =
      source.match(/{#if data\.requiresAccount}[\s\S]*?{:else}/)?.[0] ?? '';

    expect(requiresAccountBlock).toContain('class="continue-primary"');
    expect(requiresAccountBlock).not.toContain('class="browse-link"');
  });
});
