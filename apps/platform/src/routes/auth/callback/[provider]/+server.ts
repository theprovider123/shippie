/**
 * OAuth callback router.
 *
 * github    — verify state, exchange code, fetch profile + verified email.
 * google    — verify state + PKCE verifier, exchange code, fetch OIDC userinfo
 *             (requires email_verified).
 * microsoft — verify state + PKCE verifier, exchange code, fetch Graph /me.
 *
 * All providers are ENV-GATED: an unconfigured provider returns a clean error
 * (never crashes). Magic-link remains the testable default when no OAuth creds
 * are present in the environment. On success: upsert the user by verified
 * email, create a Lucia session, redirect to return_to or /.
 */
import { redirect } from '@sveltejs/kit';
import { OAuth2RequestError } from 'arctic';
import type { RequestHandler } from './$types';
import { createGitHub, fetchGitHubProfile, fetchGitHubPrimaryEmail } from '$server/auth/github';
import { createGoogle, fetchGoogleProfile, isGoogleConfigured } from '$server/auth/google';
import { createMicrosoft, fetchMicrosoftProfile, isMicrosoftConfigured } from '$server/auth/microsoft';
import { findOrCreateUserByGitHub, findOrCreateUserByEmail } from '$server/auth/users';

type Provider = 'github' | 'google' | 'microsoft';

async function startSession(
  platform: App.Platform,
  cookies: Parameters<RequestHandler>[0]['cookies'],
  userId: string,
): Promise<string> {
  const lucia = (await import('$server/auth/lucia')).createLucia(platform.env.DB, platform.env);
  const session = await lucia.createSession(userId, {});
  const cookie = lucia.createSessionCookie(session.id);
  cookies.set(cookie.name, cookie.value, { path: '.', ...cookie.attributes });
  const returnTo = cookies.get('auth_return_to') ?? '/';
  cookies.delete('auth_return_to', { path: '/' });
  return returnTo;
}

export const GET: RequestHandler = async ({ params, url, cookies, platform }) => {
  const provider = params.provider as Provider;
  if (!platform?.env.DB) {
    return new Response('Database unavailable.', { status: 500 });
  }
  const env = platform.env;

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  try {
    if (provider === 'github') {
      if (!env.GITHUB_CLIENT_ID) return new Response('GitHub OAuth not configured.', { status: 501 });
      const storedState = cookies.get('github_oauth_state');
      if (!code || !state || !storedState || state !== storedState) {
        return new Response('Invalid OAuth state.', { status: 400 });
      }
      cookies.delete('github_oauth_state', { path: '/' });
      const github = createGitHub(env);
      const tokens = await github.validateAuthorizationCode(code);
      const accessToken = tokens.accessToken();
      const profile = await fetchGitHubProfile(accessToken);
      let email = profile.email ?? (await fetchGitHubPrimaryEmail(accessToken));
      if (!email) return new Response('Could not retrieve a verified GitHub email.', { status: 400 });
      const user = await findOrCreateUserByGitHub({
        githubId: String(profile.id),
        email,
        login: profile.login,
        displayName: profile.name,
        avatarUrl: profile.avatar_url,
        db: env.DB,
      });
      const returnTo = await startSession(platform, cookies, user.id);
      throw redirect(303, returnTo);
    }

    if (provider === 'google') {
      if (!isGoogleConfigured(env)) return new Response('Google OAuth not configured.', { status: 501 });
      const storedState = cookies.get('google_oauth_state');
      const verifier = cookies.get('google_oauth_verifier');
      if (!code || !state || !storedState || !verifier || state !== storedState) {
        return new Response('Invalid OAuth state.', { status: 400 });
      }
      cookies.delete('google_oauth_state', { path: '/' });
      cookies.delete('google_oauth_verifier', { path: '/' });
      const google = createGoogle(env);
      const tokens = await google.validateAuthorizationCode(code, verifier);
      const profile = await fetchGoogleProfile(tokens.accessToken());
      if (!profile.email || !profile.email_verified) {
        return new Response('A verified Google email is required.', { status: 400 });
      }
      const user = await findOrCreateUserByEmail(profile.email.toLowerCase(), env.DB);
      const returnTo = await startSession(platform, cookies, user.id);
      throw redirect(303, returnTo);
    }

    if (provider === 'microsoft') {
      if (!isMicrosoftConfigured(env)) {
        return new Response('Microsoft OAuth not configured.', { status: 501 });
      }
      const storedState = cookies.get('microsoft_oauth_state');
      const verifier = cookies.get('microsoft_oauth_verifier');
      if (!code || !state || !storedState || !verifier || state !== storedState) {
        return new Response('Invalid OAuth state.', { status: 400 });
      }
      cookies.delete('microsoft_oauth_state', { path: '/' });
      cookies.delete('microsoft_oauth_verifier', { path: '/' });
      const microsoft = createMicrosoft(env);
      const tokens = await microsoft.validateAuthorizationCode(code, verifier);
      const profile = await fetchMicrosoftProfile(tokens.accessToken());
      const email = (profile.mail ?? profile.userPrincipalName)?.toLowerCase();
      if (!email) return new Response('Could not retrieve a Microsoft email.', { status: 400 });
      const user = await findOrCreateUserByEmail(email, env.DB);
      const returnTo = await startSession(platform, cookies, user.id);
      throw redirect(303, returnTo);
    }

    return new Response(`Provider ${provider} not supported.`, { status: 501 });
  } catch (err) {
    if (err instanceof Response) throw err;
    if ((err as { status?: number })?.status === 303) throw err; // redirect rethrow
    if (err instanceof OAuth2RequestError) {
      return new Response(`OAuth error: ${err.message}`, { status: 400 });
    }
    console.error(`[auth] ${provider} callback failed`, err);
    return new Response('Sign-in failed. Try again.', { status: 500 });
  }
};
