/**
 * Hidden live demo entry for Uniti.
 *
 * Normal production login deliberately does not show demo affordances. This
 * route gives sales/demo devices a portable, secret-gated link that provisions
 * the seeded St Jude's workspace, signs in Sarah Mitchell, and redirects into
 * the private school cloud.
 */
import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createLucia } from '$server/auth/lucia';
import { ensureDemoSignIn } from '$server/cloudlet/demo-login';

function expectedDemoCode(env: { UNITI_DEMO_CODE?: string } | undefined): string | null {
  const code = env?.UNITI_DEMO_CODE?.trim();
  return code && code.length >= 16 ? code : null;
}

function safeReturnTo(value: string | null): string {
  if (!value) return '/uniti';
  if (!value.startsWith('/uniti')) return '/uniti';
  if (value.startsWith('//')) return '/uniti';
  return value;
}

export const GET: RequestHandler = async ({ cookies, platform, url }) => {
  const expected = expectedDemoCode(platform?.env);
  const supplied = url.searchParams.get('code')?.trim() ?? '';

  // Hide the route shape from casual discovery. Operational issues below are
  // deliberately 503 so deploy checks can distinguish misconfig from bad links.
  if (!expected || supplied !== expected) {
    throw error(404, 'Not found');
  }

  if (!platform?.env.DB || !platform.env.SCHOOL_WORKSPACE) {
    console.error('[uniti/demo] missing DB or SCHOOL_WORKSPACE binding');
    throw error(503, 'Demo sign-in is not configured.');
  }

  let result;
  try {
    result = await ensureDemoSignIn({
      d1: platform.env.DB,
      schoolWorkspaceNs: platform.env.SCHOOL_WORKSPACE,
    });
  } catch (err) {
    console.error('[uniti/demo] demo sign-in failed', err);
    throw error(500, 'Could not start the demo.');
  }

  const lucia = createLucia(platform.env.DB, platform.env);
  const session = await lucia.createSession(result.userId, {});
  const cookie = lucia.createSessionCookie(session.id);
  cookies.set(cookie.name, cookie.value, { path: '/', ...cookie.attributes });

  throw redirect(303, safeReturnTo(url.searchParams.get('return_to')));
};
