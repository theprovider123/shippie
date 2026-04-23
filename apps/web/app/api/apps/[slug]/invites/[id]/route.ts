// apps/web/app/api/apps/[slug]/invites/[id]/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { schema } from '@shippie/db';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { revokeInvite } from '@/lib/access/invites';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ slug: string; id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { slug, id } = await ctx.params;
  const db = await getDb();
  const [app] = await db
    .select({ id: schema.apps.id, makerId: schema.apps.makerId })
    .from(schema.apps)
    .where(eq(schema.apps.slug, slug))
    .limit(1);
  if (!app) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (app.makerId !== session.user.id)
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const ok = await revokeInvite({ id, appId: app.id, by: session.user.id });
  return NextResponse.json({ success: ok });
}
