import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(fileURLToPath(new URL('./+page.svelte', import.meta.url)), 'utf8');

describe('login copy', () => {
  it('does not promise opening maker before the user is signed in', () => {
    // The maker intent's title is a sign-in CTA ("Continue to Maker"), never
    // "Open Maker" — we don't imply the user is already in.
    expect(source).toContain("panelTitle: 'Continue to Maker'");
    expect(source).not.toContain('Open Maker');
  });

  it('keeps the sign-in card to one primary action', () => {
    // The magic-link submit is the single sunset primary CTA; the redesigned
    // card has no competing hero buttons.
    const primaryCount = (source.match(/class="btn--primary"/g) ?? []).length;
    expect(primaryCount).toBe(1);
    expect(source).not.toContain('class="continue-primary"');
    expect(source).not.toContain('class="browse-link"');
  });
});
