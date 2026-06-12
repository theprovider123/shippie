/**
 * Shared share-card (Open Graph image) builder for apps.
 *
 * `buildAppCardSvg` is a pure SVG-string builder consumed by both
 * /api/apps/[slug]/og.svg (served as-is) and /api/apps/[slug]/og.png
 * (rasterized with resvg-wasm for crawlers that don't render SVG —
 * WhatsApp, iMessage, etc.).
 *
 * `OG_FONT_FAMILY` must match the family name of the font buffer passed to
 * the rasterizer (static/__shippie/og-font.ttf = Inter SemiBold).
 */
import type { D1Database } from '@cloudflare/workers-types';
import { canonicalShowcaseSlug, isFirstPartyShowcase } from '$lib/showcase-slugs';
import { curatedApps, initials } from '$lib/container/state';
import { getDrizzleClient } from '$server/db/client';
import { findBySlug } from '$server/db/queries/apps';

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;
export const OG_FONT_FAMILY = 'Inter';

const DEFAULT_ACCENT = '#1B6B5C';
const BG = '#070A0D';
const FONT = `font-family="${OG_FONT_FAMILY}, Arial, Helvetica, sans-serif"`;

export type AppShareMeta = {
  slug: string;
  name: string;
  description: string;
  category: string;
  accent: string;
  iconUrl: string | null;
};

/**
 * Structural slice of a SvelteKit request event — both og endpoints pass
 * their event straight through.
 */
export interface AppShareMetaEvent {
  params: { slug: string };
  platform?: { env: { DB: D1Database } };
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => (
    {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&apos;',
    }[char] ?? char
  ));
}

export function cleanColor(value: string | null | undefined, fallback = DEFAULT_ACCENT): string {
  return /^#[0-9a-f]{6}$/i.test(value ?? '') ? value! : fallback;
}

function absoluteUrl(value: string | null | undefined, origin: string): string | null {
  if (!value) return null;
  try {
    return new URL(value, origin).toString();
  } catch {
    return null;
  }
}

function wrapWords(input: string, maxChars: number, maxLines: number): string[] {
  const words = input.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
    if (lines.length === maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  const out = lines.map((line) => line.length > maxChars + 8 ? `${line.slice(0, maxChars + 5)}...` : line);
  if (words.join(' ').length > out.join(' ').length && out.length > 0) {
    out[out.length - 1] = out[out.length - 1].replace(/\.*$/, '...');
  }
  return out.length > 0 ? out : ['Shippie app'];
}

export function buildAppCardSvg(meta: AppShareMeta, origin: string): string {
  const accent = cleanColor(meta.accent);
  const titleLines = wrapWords(meta.name, 16, 2);
  const bodyLines = wrapWords(meta.description, 64, 3);
  const mark = initials(meta.name || meta.slug).slice(0, 3) || 'S';
  const iconUrl = absoluteUrl(meta.iconUrl, origin);
  const titleSize = titleLines.length > 1 ? 76 : 96;
  const title = titleLines
    .map((line, i) => `<text x="96" y="${230 + i * 86}" ${FONT} font-size="${titleSize}" font-weight="800" fill="#fff">${escapeXml(line)}</text>`)
    .join('');
  const bodyY = 300 + titleLines.length * 74;
  const body = bodyLines
    .map((line, i) => `<text x="96" y="${bodyY + i * 42}" ${FONT} font-size="30" font-weight="500" fill="rgba(255,255,255,0.76)">${escapeXml(line)}</text>`)
    .join('');
  const appUrl = `shippie.app/${meta.slug}`;
  const icon = iconUrl
    ? `<image href="${escapeXml(iconUrl)}" x="910" y="154" width="170" height="170" preserveAspectRatio="xMidYMid slice" clip-path="url(#iconClip)"/>`
    : `<text x="995" y="266" ${FONT} font-size="72" font-weight="800" text-anchor="middle" fill="#fff">${escapeXml(mark)}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}" role="img" aria-label="${escapeXml(meta.name)} on Shippie">
  <defs>
    <linearGradient id="wash" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.38"/>
      <stop offset="48%" stop-color="${accent}" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0.04"/>
    </linearGradient>
    <clipPath id="iconClip">
      <rect x="910" y="154" width="170" height="170" rx="42"/>
    </clipPath>
  </defs>
  <rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="${BG}"/>
  <rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="url(#wash)"/>
  <path d="M0 512 C196 456 321 497 494 440 C691 375 837 250 1200 288 L1200 630 L0 630 Z" fill="${accent}" opacity="0.12"/>
  <rect x="72" y="72" width="1056" height="486" rx="36" fill="rgba(255,255,255,0.045)" stroke="rgba(255,255,255,0.12)"/>
  <text x="96" y="134" ${FONT} font-size="22" font-weight="800" fill="${accent}">SHARED ON SHIPPIE</text>
  ${title}
  ${body}
  <rect x="910" y="154" width="170" height="170" rx="42" fill="${accent}" opacity="0.92"/>
  ${icon}
  <text x="995" y="382" ${FONT} font-size="22" font-weight="700" text-anchor="middle" fill="rgba(255,255,255,0.70)">${escapeXml(meta.category.toUpperCase())}</text>
  <text x="96" y="524" ${FONT} font-size="30" font-weight="800" fill="#fff">${escapeXml(appUrl)}</text>
  <text x="1104" y="524" ${FONT} font-size="24" font-weight="700" text-anchor="end" fill="rgba(255,255,255,0.62)">local-first app link</text>
</svg>`;
}

/**
 * Resolve share metadata for a slug, mirroring the og.svg visibility rules:
 * archived/private/team apps return null (→ 404), D1 wins over the bundled
 * first-party manifest, unknown slugs return null.
 */
export async function loadAppShareMeta(event: AppShareMetaEvent): Promise<AppShareMeta | null> {
  const slug = canonicalShowcaseSlug(event.params.slug);
  if (event.platform?.env.DB) {
    try {
      const app = await findBySlug(getDrizzleClient(event.platform.env.DB), slug);
      if (app) {
        if (app.isArchived || app.visibilityScope === 'private' || app.visibilityScope === 'team') {
          return null;
        }
        return {
          slug: app.slug,
          name: app.name,
          description: app.tagline ?? app.description ?? `${app.name} on Shippie.`,
          category: app.category,
          accent: cleanColor(app.themeColor),
          iconUrl: app.iconUrl,
        };
      }
    } catch {
      // Fall through to the bundled first-party manifest when D1 is unavailable.
    }
  }

  if (!isFirstPartyShowcase(slug)) return null;
  const app = curatedApps.find((item) => item.slug === slug);
  if (!app || app.visibility === 'private' || app.visibility === 'team') return null;
  return {
    slug: app.slug,
    name: app.name,
    description: app.description,
    category: app.category ?? 'tools',
    accent: cleanColor(app.accent),
    iconUrl: app.iconUrl ?? null,
  };
}
