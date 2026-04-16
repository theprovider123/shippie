/**
 * GET /api/auth/cli/whoami
 *
 * Returns the user identified by the Bearer token, or 401 if the token
 * is missing / expired / revoked. Used by `shippie whoami`.
 */
import { sql } from 'drizzle-orm';
import { NextResponse, type NextRequest } from 'next/server';
import { authenticateBearer } from '@/lib/cli-auth';
import { getDb } from '@/lib/db';
import { withLogger } from '@/lib/observability/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withLogger('auth.cli.whoami', async (req: NextRequest) => {
  const auth = await authenticateBearer(req.headers.get('authorization'));
  if (!auth) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const db = await getDb();
  const rows = (await db.execute(sql`
    select id, email, username, name
    from users where id = ${auth.userId} limit 1
  `)) as unknown as Array<{ id: string; email: string; username: string | null; name: string | null }>;

  const user = rows[0];
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  return NextResponse.json({
    user_id: user.id,
    email: user.email ?? null,
    username: user.username ?? null,
    name: user.name ?? null,
  });
});
