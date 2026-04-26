/**
 * Unified user resolution for /api/deploy/* routes.
 *
 * Accepts either:
 *   - A Bearer token (CLI / MCP) — resolved via cli-auth.ts
 *   - A session cookie (web UI) — already populated by hooks.server.ts
 *     into event.locals.user.
 *
 * Returns { userId } on success or null on failure.
 */
import type { RequestEvent } from '@sveltejs/kit';
import { authenticateBearer } from './cli-auth';

export async function resolveRequestUserId(event: RequestEvent): Promise<{ userId: string } | null> {
  // Web session takes precedence — already validated by the hook.
  if (event.locals.user) {
    return { userId: event.locals.user.id };
  }

  // Fall back to CLI Bearer token.
  if (!event.platform?.env.DB) return null;
  const auth = await authenticateBearer(
    event.request.headers.get('authorization'),
    event.platform.env.DB,
  );
  if (!auth) return null;
  return { userId: auth.userId };
}
