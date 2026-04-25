// apps/web/app/i/[code]/route.ts
//
// Short invite URL redirector. Looks up a short code in KV and 302s to
// the long-form /invite/[token] claim page. 404s on miss/expired.
import { NextResponse, type NextRequest } from 'next/server';
import { resolveShortLink } from '@/lib/access/short-links';
import { withLogger } from '@/lib/observability/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withLogger(
  'invite.short.get',
  async (req: NextRequest, ctx: { params: Promise<{ code: string }> }) => {
    const { code } = await ctx.params;
    // Sanity-check the code shape before touching KV.
    if (!/^[a-z0-9]{4,16}$/.test(code)) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    const token = await resolveShortLink(code);
    if (!token) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    const dest = new URL(`/invite/${token}`, req.url);
    return NextResponse.redirect(dest, 302);
  },
);
