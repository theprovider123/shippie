/**
 * PATCH /api/admin/apps/[id] — archive or restore an app.
 *
 * Admin-only. Writes an audit log entry.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { schema } from '@shippie/db';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { isAdmin } from '@/lib/admin';
import { writeAuditLog } from '@/lib/audit';
import { parseBody } from '@/lib/internal/validation';
import { checkRateLimit, rateLimited } from '@/lib/rate-limit';
import { withLogger } from '@/lib/observability/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PatchAppSchema = z.object({
  is_archived: z.boolean(),
  takedown_reason: z.string().max(500).optional(),
});

export const PATCH = withLogger(
  'admin.apps.patch',
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const session = await auth();
    if (!session?.user?.email || !isAdmin(session.user.email)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    const rl = checkRateLimit({
      key: `admin:${session.user.id}`,
      limit: 20,
      windowMs: 60_000,
    });
    if (!rl.ok) return rateLimited(rl);

    const { id } = await params;
    const parsed = await parseBody(req, PatchAppSchema);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;

    const db = await getDb();
    const [updated] = await db
      .update(schema.apps)
      .set({
        isArchived: body.is_archived,
        takedownReason: body.is_archived ? (body.takedown_reason ?? 'No reason provided') : null,
        updatedAt: new Date(),
      })
      .where(eq(schema.apps.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: 'app_not_found' }, { status: 404 });
    }

    await writeAuditLog(db, {
      actorUserId: session.user.id,
      action: body.is_archived ? 'admin.app.archive' : 'admin.app.restore',
      targetType: 'app',
      targetId: id,
      metadata: {
        slug: updated.slug,
        takedown_reason: body.takedown_reason,
      },
    });

    return NextResponse.json({ success: true, app: { id: updated.id, slug: updated.slug, isArchived: updated.isArchived } });
  },
);
