/**
 * Pure, dependency-free icon algorithm shared by the live ToolGlyph
 * component and the build-time SVG generator. Same input → same mark
 * everywhere (web / installed app / mobile).
 */

/** Theme-colour values that mean "maker did not choose one" → derive instead. */
const DEFAULT_THEME_COLORS = new Set(['', '#000', '#000000', 'transparent']);

function firstChar(word: string): string {
  return Array.from(word)[0] ?? '';
}

/** 1–2 letter monogram. Multi-word → initials (SD); single word → first two (Su). */
export function monogram(name: string, slug = ''): string {
  const n = (name ?? '').trim();
  if (n) {
    const words = n.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      return (firstChar(words[0] ?? '') + firstChar(words[1] ?? '')).toUpperCase();
    }
    const [c0, c1] = Array.from(words[0] ?? '');
    if (c0 && c1) return c0.toUpperCase() + c1.toLowerCase();
    if (c0) return c0.toUpperCase();
  }
  const s = (slug ?? '').trim();
  return s ? (Array.from(s)[0] ?? '?').toUpperCase() : '?';
}

/** FNV-1a → non-negative int. Stable across JS engines. */
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Accent colour: maker's themeColor when real, else a slug-derived hue. */
export function accentColor(slug: string, themeColor?: string | null): string {
  const tc = (themeColor ?? '').trim().toLowerCase();
  if (tc && !DEFAULT_THEME_COLORS.has(tc)) return (themeColor as string).trim();
  const hue = hashString(slug ?? '') % 360;
  // Fixed S/L tuned for the terminal palette so contrast holds across hues.
  return `hsl(${hue} 58% 62%)`;
}

/** Deterministic seed in [0, 1) for the ambient sheen / generated texture. */
export function surfaceSeed(slug: string): number {
  return (hashString(slug ?? '') % 1000) / 1000;
}
