/**
 * Invite claim page. Displays the app being invited to + a CTA. The
 * actual claim posts to a form action below; that action verifies the
 * invite, sets the HMAC-signed grant cookie, and redirects into the
 * focused Dock shell so the private package can be installed locally.
 *
 * Port of `apps/web/app/invite/[token]/page.tsx` + the claim API route.
 */
import { error, fail, redirect } from '@sveltejs/kit';
import { and, eq, isNull, lt, or, sql } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import {
  signInviteGrant,
  inviteCookieName,
} from '@shippie/access/invite-cookie';
import { getDrizzleClient } from '$server/db/client';
import { appAccess, appInvites, apps } from '$server/db/schema';
import {
  privateJoinJoinTokenFromUrl,
  privateJoinRoleFromUrl,
  privateJoinSpaceIdFromUrl,
  privateJoinTransferIdFromUrl,
  privateJoinUrlForApp,
} from '$server/invites/private-join';
import {
  hasPrivateSpaceCapabilityParams,
  PRIVATE_SPACE_SIGNATURE_PARAM,
  privateSpaceCapabilityFromUrl,
  verifyPrivateSpaceCapability,
} from '$server/invites/private-space-capability';
import { incrementSpaceJoinTokenClaim } from '$server/spaces/private-spaces';

const COOKIE_TTL_DAYS = 30;

type SpaceInvitePreview =
  | {
      enabled: true;
      valid: true;
      spaceId: string;
      role: string;
      hasSealedHandoff: boolean;
    }
  | {
      enabled: true;
      valid: false;
    };

export const load: PageServerLoad = async ({ platform, params, url }) => {
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
    spaceInvite: inv
      ? await previewPrivateSpaceInvite({
          url,
          appSlug: inv.appSlug,
          inviteToken: params.token,
          secret: platform.env.INVITE_SECRET ?? platform.env.AUTH_SECRET,
        })
      : null,
    token: params.token,
  };
};

export const actions: Actions = {
  claim: async ({ platform, params, cookies, locals, url }) => {
    if (!platform?.env.DB) return fail(503, { error: 'Database unavailable' });
    const secret = platform.env.INVITE_SECRET ?? platform.env.AUTH_SECRET;
    if (!secret) return fail(500, { error: 'Invite signing secret not configured' });

    const db = getDrizzleClient(platform.env.DB);
    const rows = await db
      .select({
        id: appInvites.id,
        revokedAt: appInvites.revokedAt,
        expiresAt: appInvites.expiresAt,
        maxUses: appInvites.maxUses,
        usedCount: appInvites.usedCount,
        appId: appInvites.appId,
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

    const spaceCapability = privateSpaceCapabilityFromUrl(url, {
      appSlug: inv.appSlug,
      inviteToken: params.token,
    });
    if (hasPrivateSpaceCapabilityParams(url)) {
      if (!spaceCapability) return fail(400, { error: 'Invalid private space invite' });
      const ok = await verifyPrivateSpaceCapability(
        secret,
        spaceCapability,
        url.searchParams.get(PRIVATE_SPACE_SIGNATURE_PARAM),
      );
      if (!ok) return fail(400, { error: 'Private space invite was changed or is no longer valid' });
    }

    const [claimed] = await db
      .update(appInvites)
      .set({ usedCount: sql`${appInvites.usedCount} + 1` })
      .where(
        and(
          eq(appInvites.id, inv.id),
          isNull(appInvites.revokedAt),
          or(isNull(appInvites.maxUses), lt(appInvites.usedCount, appInvites.maxUses)),
        ),
      )
      .returning({ id: appInvites.id });
    if (!claimed) return fail(410, { error: 'Invite maxed out' });
    if (spaceCapability) {
      await incrementSpaceJoinTokenClaim({
        db: platform.env.DB,
        spaceId: spaceCapability.spaceId,
        joinToken: spaceCapability.joinToken,
        inviteId: inv.id,
        appId: inv.appId,
        actorId: locals.user?.id ?? null,
      });
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

    if (locals.user) {
      const [existing] = await db
        .select({ id: appAccess.id })
        .from(appAccess)
        .where(
          and(
            eq(appAccess.appId, inv.appId),
            eq(appAccess.userId, locals.user.id),
            isNull(appAccess.revokedAt),
          ),
        )
        .limit(1);
      if (!existing) {
        await db.insert(appAccess).values({
          appId: inv.appId,
          userId: locals.user.id,
          invitedBy: null,
          source: 'invite_link',
        });
      }
    }

    throw redirect(303, privateJoinUrlForApp(inv.appSlug, {
      transferId: spaceCapability?.transferId ?? privateJoinTransferIdFromUrl(url),
      spaceId: spaceCapability?.spaceId ?? privateJoinSpaceIdFromUrl(url),
      role: spaceCapability?.role ?? privateJoinRoleFromUrl(url),
      joinToken: spaceCapability?.joinToken ?? privateJoinJoinTokenFromUrl(url),
    }));
  },
};

async function previewPrivateSpaceInvite(input: {
  url: URL;
  appSlug: string;
  inviteToken: string;
  secret: string | undefined;
}): Promise<SpaceInvitePreview | null> {
  if (!hasPrivateSpaceCapabilityParams(input.url)) return null;
  const capability = privateSpaceCapabilityFromUrl(input.url, {
    appSlug: input.appSlug,
    inviteToken: input.inviteToken,
  });
  if (!capability || !input.secret) return { enabled: true, valid: false };
  const valid = await verifyPrivateSpaceCapability(
    input.secret,
    capability,
    input.url.searchParams.get(PRIVATE_SPACE_SIGNATURE_PARAM),
  );
  if (!valid) return { enabled: true, valid: false };
  return {
    enabled: true,
    valid: true,
    spaceId: capability.spaceId,
    role: capability.role,
    hasSealedHandoff: Boolean(capability.transferId),
  };
}
