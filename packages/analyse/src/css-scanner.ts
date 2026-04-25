/**
 * Regex-based CSS scanner. Extracts the most-frequent colour appearance
 * (best-guess primary), the body background colour, the first non-system
 * font-family value, and a boolean for whether any `@keyframes` rules
 * were declared.
 *
 * No CSS parser is used — we accept ±5% error on adversarial input in
 * exchange for zero deps and fast deploy-time analysis. CSS-variable
 * resolution (e.g. `--accent` references) is intentionally out of scope.
 */

export interface CssScanResult {
  primaryColor: string | null;
  backgroundColor: string | null;
  fontFamily: string | null;
  hasCustomAnimations: boolean;
}

const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;
const HSL_RE = /hsla?\([^)]+\)/gi;
const RGB_RE = /rgba?\([^)]+\)/gi;
const KEYFRAMES_RE = /@(?:-webkit-)?keyframes\b/gi;
const BODY_BG_RE =
  /body\s*\{[^}]*background(?:-color)?\s*:\s*(#[0-9a-fA-F]{3,8}|hsla?\([^)]+\)|rgba?\([^)]+\))/i;
const FONT_FAMILY_RE = /font-family\s*:\s*([^;}\n]+)/gi;

const decoder = new TextDecoder();

export function scanCss(files: ReadonlyMap<string, Uint8Array>): CssScanResult {
  const colourCounts = new Map<string, number>();
  let backgroundColor: string | null = null;
  let fontFamily: string | null = null;
  let hasCustomAnimations = false;
  let sawCss = false;

  for (const [path, bytes] of files) {
    if (!path.endsWith('.css')) continue;
    sawCss = true;
    const css = decoder.decode(bytes);

    for (const m of css.matchAll(HEX_RE)) {
      const colour = m[0].toLowerCase();
      colourCounts.set(colour, (colourCounts.get(colour) ?? 0) + 1);
    }
    for (const m of css.matchAll(HSL_RE)) {
      const colour = m[0].toLowerCase();
      colourCounts.set(colour, (colourCounts.get(colour) ?? 0) + 1);
    }
    for (const m of css.matchAll(RGB_RE)) {
      const colour = m[0].toLowerCase();
      colourCounts.set(colour, (colourCounts.get(colour) ?? 0) + 1);
    }

    if (!backgroundColor) {
      const bg = css.match(BODY_BG_RE)?.[1];
      if (bg) backgroundColor = bg;
    }

    if (!fontFamily) {
      for (const m of css.matchAll(FONT_FAMILY_RE)) {
        const value = m[1] ?? '';
        const picked = pickFontFamily(value);
        if (picked) {
          fontFamily = picked;
          break;
        }
      }
    }

    if (!hasCustomAnimations && KEYFRAMES_RE.test(css)) {
      hasCustomAnimations = true;
    }
    KEYFRAMES_RE.lastIndex = 0;
  }

  if (!sawCss) {
    return {
      primaryColor: null,
      backgroundColor: null,
      fontFamily: null,
      hasCustomAnimations: false,
    };
  }

  let primaryColor: string | null = null;
  let topCount = 0;
  for (const [colour, count] of colourCounts) {
    if (count > topCount) {
      topCount = count;
      primaryColor = colour;
    }
  }

  return { primaryColor, backgroundColor, fontFamily, hasCustomAnimations };
}

/**
 * Pick the first non-system font from a comma-separated `font-family`
 * value. Strips quotes and skips bare keywords like `sans-serif` or any
 * `-apple-system` / `system-ui` identifiers.
 */
function pickFontFamily(value: string): string | null {
  const parts = value.split(',');
  for (const raw of parts) {
    const cleaned = raw.trim().replace(/^['"]|['"]$/g, '').trim();
    if (!cleaned) continue;
    if (isSystemFont(cleaned)) continue;
    return cleaned;
  }
  return null;
}

const SYSTEM_FONT_KEYWORDS = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'inherit',
  'initial',
  'unset',
  'revert',
]);

function isSystemFont(name: string): boolean {
  const lower = name.toLowerCase();
  if (SYSTEM_FONT_KEYWORDS.has(lower)) return true;
  if (lower.startsWith('-apple-system')) return true;
  if (lower.startsWith('-webkit-')) return true;
  if (lower === 'blinkmacsystemfont') return true;
  if (lower === 'segoe ui') return true;
  return false;
}
