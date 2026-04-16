/**
 * GET /api/assets/[appId]/[kind]
 *
 * Serves auto-packaged assets (OG card, install QR, screenshots, icon)
 * from R2. These are generated after every deploy by lib/autopack and
 * stored at `public-assets/{appId}/{kind}.png`.
 *
 * Supported `kind` values:
 *   og  — 1200x630 social card
 *   qr  — 512x512 install QR
 *
 * Spec v6 §8.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { DevR2, getDevR2AppsDir } from '@shippie/dev-storage';
import { withLogger } from '@/lib/observability/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_KINDS = new Set(['og', 'qr']);

export const GET = withLogger(
  'assets.public',
  async (_req: NextRequest, { params }: { params: Promise<{ appId: string; kind: string }> }) => {
    const { appId, kind } = await params;

    if (!/^[0-9a-f-]{36}$/.test(appId)) {
      return NextResponse.json({ error: 'invalid_app_id' }, { status: 400 });
    }
    const [base, ext = 'png'] = kind.split('.');
    if (!base || !ALLOWED_KINDS.has(base) || ext !== 'png') {
      return NextResponse.json({ error: 'invalid_kind' }, { status: 400 });
    }

    const r2 = new DevR2(getDevR2AppsDir());
    const obj = await r2.get(`public-assets/${appId}/${base}.png`);
    if (!obj) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const bytes = await obj.body();
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'content-type': 'image/png',
        'content-length': String(bytes.byteLength),
        'cache-control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
      },
    });
  },
);
