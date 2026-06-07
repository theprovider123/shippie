import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

interface WebSessionRow {
  id: string;
  expires_at: string;
  client_name: string | null;
  client_surface: string | null;
  created_at: string | null;
  last_seen_at: string | null;
  user_agent: string | null;
}

interface CliTokenRow {
  id: string;
  client_name: string;
  scopes: string;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
}

export const load: PageServerLoad = async ({ locals, platform, url }) => {
  if (!locals.user) {
    throw redirect(303, `/auth/login?return_to=${encodeURIComponent(url.pathname)}`);
  }
  if (!platform?.env.DB) {
    return {
      userEmail: locals.user.email,
      currentSessionId: locals.session?.id ?? null,
      sessions: [],
      cliTokens: [],
    };
  }

  const [sessionsResult, cliResult] = await Promise.all([
    platform.env.DB
      .prepare(
        `SELECT id, expires_at, client_name, client_surface, created_at, last_seen_at, user_agent
         FROM sessions
         WHERE user_id = ?
         ORDER BY COALESCE(last_seen_at, created_at, expires_at) DESC
         LIMIT 50`,
      )
      .bind(locals.user.id)
      .all<WebSessionRow>(),
    platform.env.DB
      .prepare(
        `SELECT id, client_name, scopes, created_at, last_used_at, expires_at
         FROM cli_tokens
         WHERE user_id = ? AND revoked_at IS NULL
         ORDER BY COALESCE(last_used_at, created_at) DESC
         LIMIT 50`,
      )
      .bind(locals.user.id)
      .all<CliTokenRow>(),
  ]);

  return {
    userEmail: locals.user.email,
    currentSessionId: locals.session?.id ?? null,
    sessions: sessionsResult.results ?? [],
    cliTokens: cliResult.results ?? [],
  };
};

export const actions: Actions = {
  revokeSession: async ({ request, platform, locals, cookies }) => {
    if (!locals.user || !locals.lucia) throw redirect(303, '/auth/login?return_to=%2Fyou%2Faccess');
    if (!platform?.env.DB) return fail(500, { error: 'Database unavailable.' });

    const data = await request.formData();
    const sessionId = String(data.get('session_id') ?? '');
    if (!sessionId) return fail(400, { error: 'Missing session.' });

    const row = await platform.env.DB
      .prepare('SELECT id FROM sessions WHERE id = ? AND user_id = ? LIMIT 1')
      .bind(sessionId, locals.user.id)
      .first<{ id: string }>();
    if (!row) return fail(404, { error: 'Session not found.' });

    await locals.lucia.invalidateSession(sessionId);
    if (locals.session?.id === sessionId) {
      const blank = locals.lucia.createBlankSessionCookie();
      cookies.set(blank.name, blank.value, { path: '.', ...blank.attributes });
      throw redirect(303, '/auth/login?return_to=%2Fyou%2Faccess');
    }
    return { ok: true };
  },

  revokeCli: async ({ request, platform, locals }) => {
    if (!locals.user) throw redirect(303, '/auth/login?return_to=%2Fyou%2Faccess');
    if (!platform?.env.DB) return fail(500, { error: 'Database unavailable.' });

    const data = await request.formData();
    const tokenId = String(data.get('token_id') ?? '');
    if (!tokenId) return fail(400, { error: 'Missing token.' });

    await platform.env.DB
      .prepare('UPDATE cli_tokens SET revoked_at = ? WHERE id = ? AND user_id = ?')
      .bind(new Date().toISOString(), tokenId, locals.user.id)
      .run();
    return { ok: true };
  },
};
