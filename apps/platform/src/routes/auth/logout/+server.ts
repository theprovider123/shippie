/**
 * POST /auth/logout — destroy the current session, clear cookie, redirect to /.
 *
 * GET also supported as a convenience for plain links (e.g. nav menu) — but
 * production UI should always POST to avoid CSRF-based logout shenanigans.
 */
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const handler: RequestHandler = async ({ locals, cookies }) => {
  if (locals.session && locals.lucia) {
    await locals.lucia.invalidateSession(locals.session.id);
    const blank = locals.lucia.createBlankSessionCookie();
    cookies.set(blank.name, blank.value, { path: '.', ...blank.attributes });
  }
  throw redirect(303, '/');
};

export const POST = handler;
export const GET = handler;
