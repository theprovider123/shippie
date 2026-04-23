// apps/web/app/api/apps/[slug]/invites/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { schema } from '@shippie/db';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { createLinkInvite, listInvites } from '@/lib/access/invites';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CreateSchema = z.object({
  kind: z.enum(['link', 'email']).default('link'),
  email: z.string().email().optional(),
  max_uses: z.number().int().positive().optional(),
  expires_at: z.string().datetime().optional(),
});

async function requireOwner(slug: string, userId: string) {
  const db = await getDb();
  const [row] = await db
    .select({ id: schema.apps.id, makerId: schema.apps.makerId })
    .from(schema.apps)
    .where(eq(schema.apps.slug, slug))
    .limit(1);
  if (!row) return { error: 'not_found' as const };
  if (row.makerId !== userId) return { error: 'forbidden' as const };
  return { appId: row.id };
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { slug } = await ctx.params;
  const gate = await requireOwner(slug, session.user.id);
  if ('error' in gate)
    return NextResponse.json(
      { error: gate.error },
      { status: gate.error === 'forbidden' ? 403 : 404 },
    );
  const invites = await listInvites({ appId: gate.appId });
  return NextResponse.json({ invites });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { slug } = await ctx.params;
  const gate = await requireOwner(slug, session.user.id);
  if ('error' in gate)
    return NextResponse.json(
      { error: gate.error },
      { status: gate.error === 'forbidden' ? 403 : 404 },
    );

  const body = await req.json().catch(() => ({}));
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input' }, { status: 400 });

  if (parsed.data.kind === 'email') {
    return NextResponse.json(
      { error: 'not_implemented', reason: 'email invites ship in Phase C' },
      { status: 501 },
    );
  }

  const invite = await createLinkInvite({
    appId: gate.appId,
    createdBy: session.user.id,
    maxUses: parsed.data.max_uses,
    expiresAt: parsed.data.expires_at ? new Date(parsed.data.expires_at) : undefined,
  });

  const host = process.env.SHIPPIE_PUBLIC_HOST ?? 'shippie.app';
  return NextResponse.json({
    invite,
    url: `https://${host}/invite/${invite.token}`,
  });
}
