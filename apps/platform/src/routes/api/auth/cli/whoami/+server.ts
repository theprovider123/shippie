/**
 * GET /api/auth/cli/whoami
 *
 * Validates the Bearer token, returns the user. Used by `shippie whoami`.
 *
 * Response shape: { user_id, email, username, name } (preserves the
 * Phase-2 apps/web contract for CLI compatibility).
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authenticateBearer } from '$server/auth/cli-auth';

interface UserRowMinimal {
  id: string;
  email: string;
  username: string | null;
  name: string | null;
  display_name: string | null;
}

export const GET: RequestHandler = async ({ request, platform }) => {
  if (!platform?.env.DB) {
    return json({ error: 'database_unavailable' }, { status: 500 });
  }

  const auth = await authenticateBearer(
    request.headers.get('authorization'),
    platform.env.DB,
  );
  if (!auth) {
    return json({ error: 'unauthenticated' }, { status: 401 });
  }

  const user = await platform.env.DB
    .prepare('SELECT id, email, username, name, display_name FROM users WHERE id = ? LIMIT 1')
    .bind(auth.userId)
    .first<UserRowMinimal>();

  if (!user) return json({ error: 'unauthenticated' }, { status: 401 });

  return json({
    user_id: user.id,
    email: user.email ?? null,
    username: user.username ?? null,
    name: user.name ?? user.display_name ?? null,
  });
};
