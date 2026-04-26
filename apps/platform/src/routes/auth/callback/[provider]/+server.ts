/**
 * OAuth callback router.
 *
 * GitHub: verify state, exchange code, fetch profile + verified email,
 * upsert user, create Lucia session, redirect to return_to or /.
 *
 * Google: stub — returns 501 until GOOGLE_CLIENT_ID is provisioned.
 */
import { redirect } from '@sveltejs/kit';
import { OAuth2RequestError } from 'arctic';
import type { RequestHandler } from './$types';
import {
  createGitHub,
  fetchGitHubProfile,
  fetchGitHubPrimaryEmail,
} from '$server/auth/github';
import { findOrCreateUserByGitHub } from '$server/auth/users';

export const GET: RequestHandler = async ({ params, url, cookies, platform }) => {
  if (params.provider !== 'github') {
    return new Response(`Provider ${params.provider} not supported.`, { status: 501 });
  }
  if (!platform?.env.DB || !platform.env.GITHUB_CLIENT_ID) {
    return new Response('GitHub OAuth not configured.', { status: 500 });
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const storedState = cookies.get('github_oauth_state');

  if (!code || !state || !storedState || state !== storedState) {
    return new Response('Invalid OAuth state.', { status: 400 });
  }

  // Clear state cookie regardless of outcome.
  cookies.delete('github_oauth_state', { path: '/' });

  try {
    const github = createGitHub(platform.env);
    const tokens = await github.validateAuthorizationCode(code);
    const accessToken = tokens.accessToken();

    const profile = await fetchGitHubProfile(accessToken);
    let email = profile.email;
    if (!email) email = await fetchGitHubPrimaryEmail(accessToken);
    if (!email) {
      return new Response('Could not retrieve a verified GitHub email.', { status: 400 });
    }

    const user = await findOrCreateUserByGitHub({
      githubId: String(profile.id),
      email,
      login: profile.login,
      displayName: profile.name,
      avatarUrl: profile.avatar_url,
      db: platform.env.DB,
    });

    const lucia = (await import('$server/auth/lucia')).createLucia(platform.env.DB, platform.env);
    const session = await lucia.createSession(user.id, {});
    const cookie = lucia.createSessionCookie(session.id);
    cookies.set(cookie.name, cookie.value, { path: '.', ...cookie.attributes });

    const returnTo = cookies.get('auth_return_to') ?? '/';
    cookies.delete('auth_return_to', { path: '/' });
    throw redirect(303, returnTo);
  } catch (err) {
    if (err instanceof Response) throw err;
    if ((err as { status?: number })?.status === 303) throw err; // redirect rethrow
    if (err instanceof OAuth2RequestError) {
      return new Response(`OAuth error: ${err.message}`, { status: 400 });
    }
    console.error('[auth] github callback failed', err);
    return new Response('Sign-in failed. Try again.', { status: 500 });
  }
};
