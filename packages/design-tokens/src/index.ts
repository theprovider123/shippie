/**
 * @shippie/design-tokens — canonical Shippie brand tokens.
 *
 * The runtime exports here are minimal — the real artefacts are the
 * `tokens.css` and `tailwind-theme.css` files in this folder, imported
 * via the package's `exports` map:
 *
 *   import "@shippie/design-tokens/tokens.css";
 *   import "@shippie/design-tokens/tailwind-theme.css"; // Tailwind v4 only
 *
 * The TS surface here is for tests + future programmatic use (e.g.
 * exposing the token list to a brand-checklist linter).
 */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

export const TOKENS_CSS_PATH = join(HERE, 'tokens.css');
export const TAILWIND_THEME_CSS_PATH = join(HERE, 'tailwind-theme.css');
export const CHECKLIST_PATH = join(HERE, 'checklist.md');

/**
 * The 14 canonical CSS variables every Shippie surface relies on.
 * The snapshot test asserts each of these appears in tokens.css —
 * if a future edit removes one, tests fail and the consumer breaks.
 */
export const CANONICAL_TOKENS: ReadonlyArray<string> = [
  '--sunset',
  '--sage-moss',
  '--marigold',
  '--bg',
  '--bg-pure',
  '--surface',
  '--text',
  '--text-secondary',
  '--text-light',
  '--border',
  '--font-heading',
  '--font-body',
  '--font-mono',
  '--spring',
];

/**
 * The Tailwind v4 utility namespaces we publish. Asserted in tests so
 * Tailwind apps can rely on `bg-bg`, `text-text`, `font-heading`, etc.
 */
export const CANONICAL_TAILWIND_MAPPINGS: ReadonlyArray<string> = [
  '--color-sunset',
  '--color-bg',
  '--color-text',
  '--color-text-light',
  '--color-border',
  '--font-heading',
  '--font-body',
  '--font-mono',
];
