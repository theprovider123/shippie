// apps/web/app/api/invite/[token]/claim/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { schema } from '@shippie/db';
import { getDb } from '@/lib/db';
import { auth } from '@/lib/auth';
import { claimInvite } from '@/lib/access/invites';
import { signInviteGrant, inviteCookieName } from '@shippie/access/invite-cookie';
import { getInviteSecret } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const session = await auth();

  const result = await claimInvite({ token, userId: session?.user?.id });
  if (!result.success) {
    return NextResponse.json(
      { error: 'claim_failed', reason: result.reason },
      { status: 400 },
    );
  }

  const db = await getDb();
  const [app] = await db
    .select({ slug: schema.apps.slug })
    .from(schema.apps)
    .where(eq(schema.apps.id, result.appId))
    .limit(1);
  if (!app) return NextResponse.json({ error: 'app_missing' }, { status: 500 });

  const secret = getInviteSecret();
  const isProd = process.env.NODE_ENV === 'production';

  const expSec = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30; // 30 days
  const jwt = await signInviteGrant(
    {
      sub: session?.user?.id ?? `anon-${Math.random().toString(36).slice(2, 10)}`,
      app: app.slug,
      tok: result.inviteId,
      src: 'invite_link',
      exp: expSec,
    },
    secret,
  );

  const cookieName = inviteCookieName(app.slug, { secure: isProd });
  const host = process.env.SHIPPIE_PUBLIC_HOST ?? (isProd ? 'shippie.app' : 'localhost');
  const scheme = isProd ? 'https://' : 'http://';
  // Runtime subdomain: prod = {slug}.shippie.app; dev = {slug}.localhost:4200
  const runtimePort = isProd ? '' : `:${process.env.SHIPPIE_WORKER_PORT ?? '4200'}`;
  const runtimeUrl = `${scheme}${app.slug}.${host}${runtimePort}/`;

  const cookieParts = [
    `${cookieName}=${jwt}`,
    `Path=/`,
    `SameSite=Lax`,
    `Max-Age=${60 * 60 * 24 * 30}`,
    `Domain=.${host}`,
  ];
  if (isProd) cookieParts.push('Secure');

  const res = NextResponse.json({ success: true, redirect_to: runtimeUrl });
  res.headers.set('set-cookie', cookieParts.join('; '));
  return res;
}
