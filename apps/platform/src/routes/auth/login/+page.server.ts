/**
 * /auth/login — page load + form actions.
 *
 * Actions:
 *   ?/email   → mint a magic-link token, send through Cloudflare Email or print to console
 *   ?/github  → kick off OAuth (handled in +server.ts via redirect)
 *
 * GitHub starts via a separate redirect endpoint at /auth/login (POST → action),
 * keeping `?/github` symmetric with `?/email` so the form submit pattern matches.
 */
import { fail, redirect } from '@sveltejs/kit';
import { generateState, generateCodeVerifier } from 'arctic';
import type { Actions, PageServerLoad } from './$types';
import { createGitHub, GitHubNotConfiguredError } from '$server/auth/github';
import { createGoogle, isGoogleConfigured, GoogleNotConfiguredError } from '$server/auth/google';
import {
  createMicrosoft,
  isMicrosoftConfigured,
  MicrosoftNotConfiguredError,
} from '$server/auth/microsoft';
import { mintVerificationToken } from '$server/auth/verification-tokens';
import { sendMagicLink } from '$server/auth/email';
import { getAuthSecret } from '$server/auth/env';
import { checkMagicLinkRateLimit } from '$server/auth/rate-limit';

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
    microsoftEnabled: env ? isMicrosoftConfigured(env) : false,
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
    const rateLimit = await checkMagicLinkRateLimit({
      db: platform.env.DB,
      request,
      email,
    }).catch((err) => {
      console.error('[auth] checkMagicLinkRateLimit failed', err);
      return { ok: false as const, remaining: 0, retryAfterMs: 60_000 };
    });
    if (!rateLimit.ok) {
      return fail(429, {
        error: 'Too many sign-in attempts. Please try again in a few minutes.',
        retryAfterMs: rateLimit.retryAfterMs,
      });
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
    const returnTo = url.searchParams.get('return_to');
    const linkUrl = new URL(
      `/auth/email-link/${encodeURIComponent(mint.token)}`,
      origin.replace(/\/$/, ''),
    );
    if (returnTo) linkUrl.searchParams.set('return_to', returnTo);
    const link = linkUrl.toString();

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

  // School-domain SSO — Google Workspace. Env-gated: returns a friendly fail
  // (never crashes) when creds are absent. PKCE: state + codeVerifier cookies.
  google: async ({ platform, cookies, url }) => {
    if (!platform?.env) return fail(500, { error: 'Platform unavailable.' });
    let google;
    try {
      google = createGoogle(platform.env);
    } catch (err) {
      if (err instanceof GoogleNotConfiguredError) {
        return fail(500, { error: 'Google sign-in is not configured yet.' });
      }
      throw err;
    }
    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const authUrl = google.createAuthorizationURL(state, codeVerifier, ['openid', 'profile', 'email']);

    const isProd =
      platform.env.SHIPPIE_ENV === 'production' || platform.env.SHIPPIE_ENV === 'canary';
    const cookieAttrs = { path: '/', httpOnly: true, secure: isProd, sameSite: 'lax' as const, maxAge: 600 };
    cookies.set('google_oauth_state', state, cookieAttrs);
    cookies.set('google_oauth_verifier', codeVerifier, cookieAttrs);
    const returnTo = url.searchParams.get('return_to');
    if (returnTo) cookies.set('auth_return_to', returnTo, cookieAttrs);
    throw redirect(302, authUrl.toString());
  },

  // School-domain SSO — Microsoft 365 / Entra ID. Same env-gated PKCE pattern.
  microsoft: async ({ platform, cookies, url }) => {
    if (!platform?.env) return fail(500, { error: 'Platform unavailable.' });
    let microsoft;
    try {
      microsoft = createMicrosoft(platform.env);
    } catch (err) {
      if (err instanceof MicrosoftNotConfiguredError) {
        return fail(500, { error: 'Microsoft sign-in is not configured yet.' });
      }
      throw err;
    }
    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const authUrl = microsoft.createAuthorizationURL(state, codeVerifier, [
      'openid',
      'profile',
      'email',
      'User.Read',
    ]);

    const isProd =
      platform.env.SHIPPIE_ENV === 'production' || platform.env.SHIPPIE_ENV === 'canary';
    const cookieAttrs = { path: '/', httpOnly: true, secure: isProd, sameSite: 'lax' as const, maxAge: 600 };
    cookies.set('microsoft_oauth_state', state, cookieAttrs);
    cookies.set('microsoft_oauth_verifier', codeVerifier, cookieAttrs);
    const returnTo = url.searchParams.get('return_to');
    if (returnTo) cookies.set('auth_return_to', returnTo, cookieAttrs);
    throw redirect(302, authUrl.toString());
  },
};
