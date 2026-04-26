/**
 * /auth/login — page load + form actions.
 *
 * Actions:
 *   ?/email   → mint a magic-link token, send via Resend or print to console
 *   ?/github  → kick off OAuth (handled in +server.ts via redirect)
 *
 * GitHub starts via a separate redirect endpoint at /auth/login (POST → action),
 * keeping `?/github` symmetric with `?/email` so the form submit pattern matches.
 */
import { fail, redirect } from '@sveltejs/kit';
import { generateState } from 'arctic';
import type { Actions, PageServerLoad } from './$types';
import { createGitHub, GitHubNotConfiguredError } from '$server/auth/github';
import { isGoogleConfigured } from '$server/auth/google';
import { mintVerificationToken } from '$server/auth/verification-tokens';
import { sendMagicLink } from '$server/auth/email';
import { getAuthSecret } from '$server/auth/env';

export const load: PageServerLoad = async ({ platform, locals, url }) => {
  // Already signed in? Bounce to the return target or home.
  if (locals.user) {
    const returnTo = url.searchParams.get('return_to') ?? '/';
    throw redirect(303, returnTo);
  }

  const env = platform?.env;
  return {
    githubEnabled: Boolean(env?.GITHUB_CLIENT_ID && env?.GITHUB_CLIENT_SECRET),
    googleEnabled: env ? isGoogleConfigured(env) : false,
    devMode: env?.SHIPPIE_ENV !== 'production',
  };
};

export const actions: Actions = {
  email: async ({ request, platform, url }) => {
    const data = await request.formData();
    const email = String(data.get('email') ?? '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      return fail(400, { error: 'Enter a valid email address.' });
    }
    if (!platform?.env.DB) {
      return fail(500, { error: 'Database unavailable.' });
    }

    let mint;
    try {
      mint = await mintVerificationToken({
        email,
        authSecret: getAuthSecret(platform.env),
        db: platform.env.DB,
      });
    } catch (err) {
      console.error('[auth] mintVerificationToken failed', err);
      return fail(500, { error: 'Could not create magic link. Please try again.' });
    }

    const origin = platform.env.PUBLIC_ORIGIN ?? url.origin;
    const link = `${origin.replace(/\/$/, '')}/auth/email-link/${encodeURIComponent(mint.token)}`;

    try {
      await sendMagicLink({ to: email, url: link, env: platform.env });
    } catch (err) {
      console.error('[auth] sendMagicLink failed', err);
      return fail(500, { error: 'Could not send magic link. Please try again.' });
    }

    return { success: true, email };
  },

  github: async ({ platform, cookies, url }) => {
    if (!platform?.env) {
      return fail(500, { error: 'Platform unavailable.' });
    }

    let github;
    try {
      github = createGitHub(platform.env);
    } catch (err) {
      if (err instanceof GitHubNotConfiguredError) {
        return fail(500, { error: 'GitHub sign-in is not configured.' });
      }
      throw err;
    }

    const state = generateState();
    const authUrl = github.createAuthorizationURL(state, ['read:user', 'user:email']);

    const isProd = platform.env.SHIPPIE_ENV === 'production' || platform.env.SHIPPIE_ENV === 'canary';
    const cookieAttrs = {
      path: '/',
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax' as const,
      maxAge: 600,
    };
    cookies.set('github_oauth_state', state, cookieAttrs);

    const returnTo = url.searchParams.get('return_to');
    if (returnTo) cookies.set('auth_return_to', returnTo, cookieAttrs);

    throw redirect(302, authUrl.toString());
  },
};
