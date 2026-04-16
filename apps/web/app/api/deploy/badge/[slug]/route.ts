/**
 * GET /api/deploy/badge/[slug]
 *
 * Returns a shields-style SVG badge for a given Shippie app slug.
 *
 * Use in a README as:
 *   [![Deploy on Shippie](https://shippie.app/api/deploy/badge/my-app)](https://my-app.shippie.app)
 *
 * Two variants via ?variant=:
 *   - live     (default) — green "deployed" state for existing apps
 *   - deploy           — orange "Deploy on Shippie" call-to-action style
 *
 * See differentiation plan Pillar B5.
 */
import { sql } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { withLogger } from '@/lib/observability/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface BadgeRow {
  name: string;
  installCount: number;
  active: boolean;
}

type BadgeCtx = { params: Promise<{ slug: string }> };

export const GET = withLogger<BadgeCtx>('deploy.badge', async (req: NextRequest, ctx) => {
  const { slug } = await ctx.params;
  const variant = new URL(req.url).searchParams.get('variant') ?? 'live';

  const db = await getDb();
  const rows = (await db.execute(sql`
    select name,
           install_count as "installCount",
           (active_deploy_id is not null) as active
    from apps
    where slug = ${slug} and is_archived = false
    limit 1
  `)) as unknown as BadgeRow[];

  const row = rows[0];

  if (variant === 'deploy') {
    return svg(deployBadge());
  }

  if (!row || !row.active) {
    return svg(liveBadge('not deployed', '—', '#7A6B58'));
  }

  const label = `${row.installCount.toLocaleString()} installs`;
  return svg(liveBadge('shippie', label, '#5E7B5C'));
});

function liveBadge(left: string, right: string, rightColor: string): string {
  const leftW  = measure(left);
  const rightW = measure(right);
  const total  = leftW + rightW;
  return badgeTemplate({ left, right, leftW, rightW, total, leftColor: '#14120F', rightColor });
}

function deployBadge(): string {
  const left = 'deploy on';
  const right = 'shippie';
  const leftW  = measure(left);
  const rightW = measure(right);
  const total  = leftW + rightW;
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
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${p.total}" height="${h}" role="img" aria-label="${xml(p.left)}: ${xml(p.right)}">
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r"><rect width="${p.total}" height="${h}" rx="3"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${p.leftW}" height="${h}" fill="${p.leftColor}"/>
    <rect x="${p.leftW}" width="${p.rightW}" height="${h}" fill="${p.rightColor}"/>
    <rect width="${p.total}" height="${h}" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="${(p.leftW / 2) * 10}" y="150" transform="scale(.1)" fill="#000" fill-opacity=".3" textLength="${(p.leftW - 10) * 10}">${xml(p.left)}</text>
    <text x="${(p.leftW / 2) * 10}" y="140" transform="scale(.1)" textLength="${(p.leftW - 10) * 10}">${xml(p.left)}</text>
    <text x="${(p.leftW + p.rightW / 2) * 10}" y="150" transform="scale(.1)" fill="#000" fill-opacity=".3" textLength="${(p.rightW - 10) * 10}">${xml(p.right)}</text>
    <text x="${(p.leftW + p.rightW / 2) * 10}" y="140" transform="scale(.1)" textLength="${(p.rightW - 10) * 10}">${xml(p.right)}</text>
  </g>
</svg>`;
}

function measure(text: string): number {
  // Approximate shields.io glyph width: 6px @ 11pt Verdana + 10px padding.
  return Math.max(40, text.length * 6 + 10);
}

function xml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
