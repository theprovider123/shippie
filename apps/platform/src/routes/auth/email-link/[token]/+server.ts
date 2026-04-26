/**
 * Magic-link redemption.
 *
 * GET /auth/email-link/<token> — verify HMAC, single-use the row, find or
 * create the user by email, create a Lucia session, redirect to /.
 */
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyAndConsumeToken } from '$server/auth/verification-tokens';
import { findOrCreateUserByEmail } from '$server/auth/users';
import { createLucia } from '$server/auth/lucia';
import { getAuthSecret } from '$server/auth/env';

export const GET: RequestHandler = async ({ params, platform, cookies, url }) => {
  if (!platform?.env.DB) {
    return new Response('Database unavailable.', { status: 500 });
  }

  const result = await verifyAndConsumeToken({
    token: params.token,
    authSecret: getAuthSecret(platform.env),
    db: platform.env.DB,
  });

  if (!result.ok) {
    const reasonText: Record<string, string> = {
      invalid_format: 'This sign-in link is malformed.',
      bad_signature: 'This sign-in link is invalid.',
      expired: 'This sign-in link has expired. Please request a new one.',
      unknown_or_used: 'This sign-in link has already been used or has expired.',
    };
    return new Response(reasonText[result.reason] ?? 'Sign-in failed.', {
      status: 400,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const user = await findOrCreateUserByEmail(result.email, platform.env.DB);
  const lucia = createLucia(platform.env.DB, platform.env);
  const session = await lucia.createSession(user.id, {});
  const cookie = lucia.createSessionCookie(session.id);
  cookies.set(cookie.name, cookie.value, { path: '.', ...cookie.attributes });

  const returnTo = url.searchParams.get('return_to') ?? '/';
  throw redirect(303, returnTo);
};
