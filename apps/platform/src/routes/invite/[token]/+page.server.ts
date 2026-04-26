/**
 * Invite claim page. Displays the app being invited to + a CTA. The
 * actual claim posts to a form action below; that action verifies the
 * invite, sets the HMAC-signed grant cookie, and redirects to the app
 * detail page.
 *
 * Port of `apps/web/app/invite/[token]/page.tsx` + the claim API route.
 */
import { error, fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import {
  signInviteGrant,
  inviteCookieName,
} from '@shippie/access/invite-cookie';
import { getDrizzleClient } from '$server/db/client';
import { appInvites, apps } from '$server/db/schema';

const COOKIE_TTL_DAYS = 30;

export const load: PageServerLoad = async ({ platform, params }) => {
  if (!platform?.env.DB) throw error(503, 'Database unavailable');
  const db = getDrizzleClient(platform.env.DB);

  const rows = await db
    .select({
      id: appInvites.id,
      revokedAt: appInvites.revokedAt,
      expiresAt: appInvites.expiresAt,
      maxUses: appInvites.maxUses,
      usedCount: appInvites.usedCount,
      appName: apps.name,
      appSlug: apps.slug,
      appTagline: apps.tagline,
    })
    .from(appInvites)
    .innerJoin(apps, eq(apps.id, appInvites.appId))
    .where(eq(appInvites.token, params.token))
    .limit(1);

  const inv = rows[0];
  const now = Date.now();
  const expiresMs = inv?.expiresAt ? Date.parse(inv.expiresAt) : null;
  const invalid =
    !inv ||
    inv.revokedAt != null ||
    (expiresMs != null && expiresMs < now) ||
    (inv.maxUses != null && inv.usedCount >= inv.maxUses);

  return {
    invalid,
    invite: inv
      ? {
          appName: inv.appName,
          appSlug: inv.appSlug,
          appTagline: inv.appTagline,
        }
      : null,
    token: params.token,
  };
};

export const actions: Actions = {
  claim: async ({ platform, params, cookies, locals, url }) => {
    if (!platform?.env.DB) return fail(503, { error: 'Database unavailable' });
    const secret = platform.env.AUTH_SECRET;
    if (!secret) return fail(500, { error: 'AUTH_SECRET not configured' });

    const db = getDrizzleClient(platform.env.DB);
    const rows = await db
      .select({
        id: appInvites.id,
        revokedAt: appInvites.revokedAt,
        expiresAt: appInvites.expiresAt,
        maxUses: appInvites.maxUses,
        usedCount: appInvites.usedCount,
        appSlug: apps.slug,
      })
      .from(appInvites)
      .innerJoin(apps, eq(apps.id, appInvites.appId))
      .where(eq(appInvites.token, params.token))
      .limit(1);

    const inv = rows[0];
    if (!inv) return fail(404, { error: 'Invite not found' });
    if (inv.revokedAt != null) return fail(410, { error: 'Invite revoked' });
    const now = Date.now();
    const expiresMs = inv.expiresAt ? Date.parse(inv.expiresAt) : null;
    if (expiresMs != null && expiresMs < now) return fail(410, { error: 'Invite expired' });
    if (inv.maxUses != null && inv.usedCount >= inv.maxUses) {
      return fail(410, { error: 'Invite maxed out' });
    }

    // Sign the grant cookie. `sub` is the user id if signed in, else
    // an anonymous id we generate (and the cookie embeds).
    const sub = locals.user?.id ?? `anon_${crypto.randomUUID()}`;
    const exp = Math.floor(Date.now() / 1000) + COOKIE_TTL_DAYS * 24 * 60 * 60;
    const cookie = await signInviteGrant(
      { sub, app: inv.appSlug, tok: inv.id, src: 'invite_link', exp },
      secret,
    );

    const isProd = url.hostname.endsWith('.shippie.app') || url.hostname === 'shippie.app';
    const cookieName = inviteCookieName(inv.appSlug, { secure: isProd });
    cookies.set(cookieName, cookie, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
      maxAge: COOKIE_TTL_DAYS * 24 * 60 * 60,
    });

    // Phase 4b will increment `usedCount` here. Skipped in 4a — the
    // schema accepts the uncounted claim, and the public-data flow
    // already gates on revocation/expiry above.

    throw redirect(303, `/apps/${inv.appSlug}`);
  },
};
