/**
 * GET /api/deploy/badge/[slug]
 *
 * Shields-style SVG badge for a Shippie app. Two variants:
 *   - default: green "shippie · {N installs}"
 *   - ?variant=deploy: orange "deploy on shippie" CTA
 */
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

interface Row {
  name: string;
  install_count: number;
  has_active: number;
}

export const GET: RequestHandler = async ({ params, url, platform }) => {
  if (!platform?.env.DB) throw error(500, 'database unavailable');

  const variant = url.searchParams.get('variant') ?? 'live';
  const slug = params.slug;

  const row = await platform.env.DB
    .prepare(
      `SELECT name, install_count, (active_deploy_id IS NOT NULL) AS has_active
       FROM apps
       WHERE slug = ? AND is_archived = 0
       LIMIT 1`,
    )
    .bind(slug)
    .first<Row>();

  if (variant === 'deploy') {
    return svg(deployBadge());
  }
  if (!row || !row.has_active) {
    return svg(liveBadge('not deployed', '—', '#7A6B58'));
  }
  const label = `${Number(row.install_count).toLocaleString()} installs`;
  return svg(liveBadge('shippie', label, '#5E7B5C'));
};

function liveBadge(left: string, right: string, rightColor: string): string {
  const leftW = measure(left);
  const rightW = measure(right);
  const total = leftW + rightW;
  return badgeTemplate({ left, right, leftW, rightW, total, leftColor: '#14120F', rightColor });
}

function deployBadge(): string {
  const left = 'deploy on';
  const right = 'shippie';
  const leftW = measure(left);
  const rightW = measure(right);
  const total = leftW + rightW;
  return badgeTemplate({ left, right, leftW, rightW, total, leftColor: '#14120F', rightColor: '#E8603C' });
}

interface BadgeParts {
  left: string;
  right: string;
  leftW: number;
  rightW: number;
  total: number;
  leftColor: string;
  rightColor: string;
}

function badgeTemplate(p: BadgeParts): string {
  const h = 20;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${p.total}" height="${h}" role="img" aria-label="${xml(p.left)}: ${xml(p.right)}"><linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient><clipPath id="r"><rect width="${p.total}" height="${h}" rx="3"/></clipPath><g clip-path="url(#r)"><rect width="${p.leftW}" height="${h}" fill="${p.leftColor}"/><rect x="${p.leftW}" width="${p.rightW}" height="${h}" fill="${p.rightColor}"/><rect width="${p.total}" height="${h}" fill="url(#s)"/></g><g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11"><text x="${(p.leftW / 2) * 10}" y="150" transform="scale(.1)" fill="#000" fill-opacity=".3" textLength="${(p.leftW - 10) * 10}">${xml(p.left)}</text><text x="${(p.leftW / 2) * 10}" y="140" transform="scale(.1)" textLength="${(p.leftW - 10) * 10}">${xml(p.left)}</text><text x="${(p.leftW + p.rightW / 2) * 10}" y="150" transform="scale(.1)" fill="#000" fill-opacity=".3" textLength="${(p.rightW - 10) * 10}">${xml(p.right)}</text><text x="${(p.leftW + p.rightW / 2) * 10}" y="140" transform="scale(.1)" textLength="${(p.rightW - 10) * 10}">${xml(p.right)}</text></g></svg>`;
}

function measure(text: string): number {
  return Math.max(40, text.length * 6 + 10);
}

function xml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function svg(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'public, max-age=300, s-maxage=300',
    },
  });
}
