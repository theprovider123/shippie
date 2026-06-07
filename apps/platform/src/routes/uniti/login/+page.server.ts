/**
 * /uniti/login — the Uniti-branded school sign-in (split-panel, teal + warm-white).
 *
 * This is the FIRST impression for a school. Unlike Shippie's generic
 * `/auth/login` (which stays the tool-launcher entry for other apps), this page
 * wears Uniti's identity (Plus Jakarta Sans, teal #1B9B7A) and surfaces the
 * provisioned school's branding on the left brand panel.
 *
 * Auth is REUSED, not reinvented: the form actions below mint the exact same
 * magic-link / demo / Google / Microsoft flows as `/auth/login`. SSO is
 * env-gated — buttons render disabled with an "ask your admin" hint when the
 * provider creds are absent, and the actions return a friendly `fail` (never
 * crash) if posted anyway.
 */
import { fail, redirect } from '@sveltejs/kit';
import { generateState, generateCodeVerifier } from 'arctic';
import { eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { getDrizzleClient, schema } from '$server/db/client';
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
import { createLucia } from '$server/auth/lucia';
import { ensureDemoSignIn, DEMO_SLUG } from '$server/cloudlet/demo-login';

// Generic fallback shown when no provisioned instance is matched (e.g. a fresh
// worker before the demo school is seeded). St Jude's is the demo school.
const FALLBACK_BRANDING = {
  schoolName: "St Jude's & St Paul's",
  badge: 'SJ&P',
  meta: 'CE Primary Academy · London NW3',
  term: 'Summer Term 2026 · Week 8',
};

// Dev / non-prod demo entry — runtime-gated on SHIPPIE_ENV (mirrors /auth/login).
function demoEnabled(env: { SHIPPIE_ENV?: string } | undefined): boolean {
  const flavor = env?.SHIPPIE_ENV ?? 'development';
  return flavor !== 'production' && flavor !== 'canary';
}

// Honorifics / stop-words dropped when computing badge initials, so the saint
// names (not "St") drive the letters: "St Jude's & St Paul's" → SJ&P.
const BADGE_STOP = new Set(['st', 'st.', 'saint', 'of', 'the', 'and']);

/**
 * Short brand-badge initials from a school name. Splits on a leading "&" /
 * "and" into two halves; for each half it takes the first significant word's
 * initial, but keeps a single leading "S" when the half is a "St"/"Saint"
 * dedication (so St Jude's → SJ). Joins the halves with "&".
 *   "St Jude's & St Paul's" → "SJ&P"   ·   "Greenfield Primary" → "GP"
 */
function initialsFor(name: string): string {
  const cleaned = name.replace(/[.'’]/g, '');
  const halves = cleaned.split(/\s*(?:&|\band\b)\s*/i).filter(Boolean);

  const initialsOf = (half: string, keepHonorific: boolean): string => {
    const words = half.split(/\s+/).filter((w) => /[A-Za-z]/.test(w[0] ?? ''));
    if (words.length === 0) return '';
    const saintLed = BADGE_STOP.has(words[0].toLowerCase());
    const significant = words.filter((w) => !BADGE_STOP.has(w.toLowerCase()));
    const core = significant[0]?.[0]?.toUpperCase() ?? words[0][0].toUpperCase();
    // Keep the "St" only on the first dedication so "St Jude's & St Paul's"
    // reads SJ&P (not SJ&SP) — every dedication after the first is just its core.
    return saintLed && keepHonorific
      ? `S${core}`
      : `${core}${significant[1]?.[0]?.toUpperCase() ?? ''}`;
  };

  if (halves.length >= 2) {
    return halves
      .map((h, i) => initialsOf(h, i === 0))
      .filter(Boolean)
      .join('&');
  }
  const out = initialsOf(halves[0] ?? name, true);
  return out || (name.slice(0, 2).toUpperCase() || 'SC');
}

export const load: PageServerLoad = async ({ platform, locals, url }) => {
  // Already signed in? Bounce to the return target or Today.
  if (locals.user) {
    const returnTo = url.searchParams.get('return_to') ?? '/uniti';
    throw redirect(303, returnTo);
  }

  const env = platform?.env;
  let branding = { ...FALLBACK_BRANDING };

  // Resolve the provisioned school's branding for the left panel. Prefer an
  // explicit ?school=<slug>, else the demo school, else the first instance.
  if (env?.DB) {
    try {
      const db = getDrizzleClient(env.DB);
      const wantSlug = url.searchParams.get('school') ?? DEMO_SLUG;
      let rows = await db
        .select({ name: schema.privateAppInstances.name, branding: schema.privateAppInstances.branding })
        .from(schema.privateAppInstances)
        .where(eq(schema.privateAppInstances.slug, wantSlug))
        .limit(1);
      if (rows.length === 0) {
        rows = await db
          .select({ name: schema.privateAppInstances.name, branding: schema.privateAppInstances.branding })
          .from(schema.privateAppInstances)
          .limit(1);
      }
      const inst = rows[0];
      if (inst) {
        const displayName = inst.branding?.displayName || inst.name;
        branding = {
          schoolName: displayName,
          badge: initialsFor(displayName),
          // meta / term aren't part of the provisioning Branding contract yet,
          // so they fall back to sensible demo values until the schema carries them.
          meta: FALLBACK_BRANDING.meta,
          term: FALLBACK_BRANDING.term,
        };
      }
    } catch (err) {
      console.error('[uniti/login] branding load failed', err);
    }
  }

  return {
    branding,
    googleEnabled: env ? isGoogleConfigured(env) : false,
    microsoftEnabled: env ? isMicrosoftConfigured(env) : false,
    devMode: env?.SHIPPIE_ENV !== 'production',
    demoEnabled: demoEnabled(env),
  };
};

export const actions: Actions = {
  // Magic link — identical to /auth/login ?/email, but returns to /uniti.
  email: async ({ request, platform, url }) => {
    const data = await request.formData();
    const email = String(data.get('email') ?? '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      return fail(400, { error: 'Enter a valid email address.', mode: 'magic' });
    }
    if (!platform?.env.DB) {
      return fail(500, { error: 'Database unavailable.', mode: 'magic' });
    }
    const rateLimit = await checkMagicLinkRateLimit({ db: platform.env.DB, request, email }).catch(
      (err) => {
        console.error('[uniti/login] checkMagicLinkRateLimit failed', err);
        return { ok: false as const, remaining: 0, retryAfterMs: 60_000 };
      },
    );
    if (!rateLimit.ok) {
      return fail(429, {
        error: 'Too many sign-in attempts. Please try again in a few minutes.',
        mode: 'magic',
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
      console.error('[uniti/login] mintVerificationToken failed', err);
      return fail(500, { error: 'Could not create magic link. Please try again.', mode: 'magic' });
    }

    const origin = platform.env.PUBLIC_ORIGIN ?? url.origin;
    const linkUrl = new URL(
      `/auth/email-link/${encodeURIComponent(mint.token)}`,
      origin.replace(/\/$/, ''),
    );
    linkUrl.searchParams.set('return_to', '/uniti');

    try {
      await sendMagicLink({ to: email, url: linkUrl.toString(), env: platform.env });
    } catch (err) {
      console.error('[uniti/login] sendMagicLink failed', err);
      return fail(500, { error: 'Could not send magic link. Please try again.', mode: 'magic' });
    }

    return { success: true, email, mode: 'magic' };
  },

  // Dev-only demo entry — "sign in as Sarah Mitchell". Reuses the shared helper.
  demo: async ({ platform, cookies }) => {
    if (!demoEnabled(platform?.env)) {
      return fail(403, { error: 'Demo sign-in is not available.' });
    }
    if (!platform?.env.DB) return fail(500, { error: 'Database unavailable.' });
    if (!platform.env.SCHOOL_WORKSPACE) {
      return fail(500, {
        error: 'School workspace binding unavailable (run via wrangler dev).',
      });
    }

    let result;
    try {
      result = await ensureDemoSignIn({
        d1: platform.env.DB,
        schoolWorkspaceNs: platform.env.SCHOOL_WORKSPACE,
      });
    } catch (err) {
      console.error('[uniti/login] demo sign-in failed', err);
      return fail(500, { error: 'Could not start the demo. Check the server logs.' });
    }

    const lucia = createLucia(platform.env.DB, platform.env);
    const session = await lucia.createSession(result.userId, {});
    const cookie = lucia.createSessionCookie(session.id);
    cookies.set(cookie.name, cookie.value, { path: '.', ...cookie.attributes });

    throw redirect(303, '/uniti');
  },

  // School-domain SSO — Google Workspace (env-gated PKCE).
  google: async ({ platform, cookies }) => {
    if (!platform?.env) return fail(500, { error: 'Platform unavailable.' });
    let google;
    try {
      google = createGoogle(platform.env);
    } catch (err) {
      if (err instanceof GoogleNotConfiguredError) {
        return fail(400, { error: 'Google sign-in isn’t enabled yet — ask your school admin.' });
      }
      throw err;
    }
    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const authUrl = google.createAuthorizationURL(state, codeVerifier, [
      'openid',
      'profile',
      'email',
    ]);
    const isProd =
      platform.env.SHIPPIE_ENV === 'production' || platform.env.SHIPPIE_ENV === 'canary';
    const cookieAttrs = {
      path: '/',
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax' as const,
      maxAge: 600,
    };
    cookies.set('google_oauth_state', state, cookieAttrs);
    cookies.set('google_oauth_verifier', codeVerifier, cookieAttrs);
    cookies.set('auth_return_to', '/uniti', cookieAttrs);
    throw redirect(302, authUrl.toString());
  },

  // School-domain SSO — Microsoft 365 / Entra ID (env-gated PKCE).
  microsoft: async ({ platform, cookies }) => {
    if (!platform?.env) return fail(500, { error: 'Platform unavailable.' });
    let microsoft;
    try {
      microsoft = createMicrosoft(platform.env);
    } catch (err) {
      if (err instanceof MicrosoftNotConfiguredError) {
        return fail(400, { error: 'Microsoft sign-in isn’t enabled yet — ask your school admin.' });
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
    const cookieAttrs = {
      path: '/',
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax' as const,
      maxAge: 600,
    };
    cookies.set('microsoft_oauth_state', state, cookieAttrs);
    cookies.set('microsoft_oauth_verifier', codeVerifier, cookieAttrs);
    cookies.set('auth_return_to', '/uniti', cookieAttrs);
    throw redirect(302, authUrl.toString());
  },
};
