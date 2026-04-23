/**
 * PATCH /api/apps/:slug/visibility
 *
 * Maker-only. Flips visibility_scope between public / unlisted / private,
 * then propagates the change to runtime KV so the Worker access-gate
 * picks it up within its cache TTL.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { schema } from '@shippie/db';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { writeAppMeta } from '@/lib/deploy/kv';
import { withLogger } from '@/lib/observability/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PatchSchema = z.object({
  visibility_scope: z.enum(['public', 'unlisted', 'private']),
});

export const PATCH = withLogger(
  'apps.visibility.patch',
  async (req: NextRequest, ctx: { params: Promise<{ slug: string }> }) => {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    }
    const { slug } = await ctx.params;

    const body = await req.json().catch(() => ({}));
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
    }

    const db = await getDb();
    const [app] = await db
      .select({ id: schema.apps.id, makerId: schema.apps.makerId })
      .from(schema.apps)
      .where(eq(schema.apps.slug, slug))
      .limit(1);
    if (!app) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (app.makerId !== session.user.id) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    await db
      .update(schema.apps)
      .set({ visibilityScope: parsed.data.visibility_scope, updatedAt: new Date() })
      .where(eq(schema.apps.id, app.id));

    // Propagate to runtime KV — the Worker's access-gate reads this.
    await writeAppMeta(slug, { visibility_scope: parsed.data.visibility_scope });

    return NextResponse.json({ success: true });
  },
);
