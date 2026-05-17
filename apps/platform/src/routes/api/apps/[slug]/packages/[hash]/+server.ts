import { and, eq, isNull, or } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import {
  inviteCookieName,
  verifyInviteGrant,
} from '@shippie/access/invite-cookie';
import type { RequestHandler } from './$types';
import { getDrizzleClient, schema } from '$server/db/client';

export const GET: RequestHandler = async ({ params, platform, locals, request }) => {
  if (!platform?.env.DB || !platform.env.APPS) {
    throw error(503, 'Package storage unavailable');
  }

  const packageHash = params.hash.startsWith('sha256:')
    ? params.hash
    : `sha256:${params.hash}`;
  if (!/^sha256:[a-f0-9]{64}$/i.test(packageHash)) {
    throw error(400, 'Invalid package hash');
  }

  const db = getDrizzleClient(platform.env.DB);
  const [row] = await db
    .select({
      appId: schema.apps.id,
      appName: schema.apps.name,
      slug: schema.apps.slug,
      visibilityScope: schema.apps.visibilityScope,
      isArchived: schema.apps.isArchived,
      makerId: schema.apps.makerId,
      organizationId: schema.apps.organizationId,
      packageHash: schema.appPackages.packageHash,
      artifactPrefix: schema.appPackages.artifactPrefix,
    })
    .from(schema.appPackages)
    .innerJoin(schema.apps, eq(schema.apps.id, schema.appPackages.appId))
    .where(and(eq(schema.apps.slug, params.slug), eq(schema.appPackages.packageHash, packageHash)))
    .limit(1);

  if (!row || row.isArchived || !(await canFetchPackage(db, row, { locals, request, env: platform.env }))) {
    throw error(404, 'Package not found');
  }

  const key = `${row.artifactPrefix}/${row.packageHash}.shippie`;
  const obj = await platform.env.APPS.get(key);
  if (!obj) throw error(404, 'Package archive missing');

  return new Response(await obj.arrayBuffer(), {
    headers: {
      'content-type': 'application/vnd.shippie.package+json',
      'content-disposition': `attachment; filename="${row.slug}-${row.packageHash.slice(7, 19)}.shippie"`,
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
};

async function canFetchPackage(
  db: ReturnType<typeof getDrizzleClient>,
  row: {
    appId: string;
    slug: string;
    visibilityScope: string;
    makerId: string;
    organizationId: string | null;
  },
  opts: {
    locals: App.Locals;
    request: Request;
    env: { INVITE_SECRET?: string; AUTH_SECRET?: string };
  },
): Promise<boolean> {
  if (row.visibilityScope === 'public' || row.visibilityScope === 'unlisted') return true;

  const user = opts.locals.user;
  if (user?.id && row.makerId === user.id) return true;
  if (user?.id && row.visibilityScope === 'team' && row.organizationId) {
    const [membership] = await db
      .select({ userId: schema.organizationMembers.userId })
      .from(schema.organizationMembers)
      .where(
        and(
          eq(schema.organizationMembers.orgId, row.organizationId),
          eq(schema.organizationMembers.userId, user.id),
        ),
      )
      .limit(1);
    if (membership) return true;
  }

  if (user?.id || user?.email) {
    const accessPredicates = [
      user.id ? eq(schema.appAccess.userId, user.id) : null,
      user.email ? eq(schema.appAccess.email, user.email) : null,
    ].filter((filter): filter is NonNullable<typeof filter> => filter !== null);
    if (accessPredicates.length > 0) {
      const [grant] = await db
        .select({ id: schema.appAccess.id })
        .from(schema.appAccess)
        .where(
          and(
            eq(schema.appAccess.appId, row.appId),
            or(...accessPredicates),
            isNull(schema.appAccess.revokedAt),
          ),
        )
        .limit(1);
      if (grant) return true;
    }
  }

  return hasInviteGrantForSlug(opts.request, opts.env, row.slug);
}

async function hasInviteGrantForSlug(
  request: Request,
  env: { INVITE_SECRET?: string; AUTH_SECRET?: string },
  slug: string,
): Promise<boolean> {
  const secret = env.INVITE_SECRET ?? env.AUTH_SECRET;
  if (!secret) return false;
  const secure = new URL(request.url).protocol === 'https:';
  const cookie = readCookie(request.headers.get('cookie') ?? '', inviteCookieName(slug, { secure }));
  if (!cookie) return false;
  const grant = await verifyInviteGrant(cookie, secret);
  return grant?.app === slug;
}

function readCookie(cookieHeader: string, name: string): string | null {
  const escaped = name.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]+)`));
  return match ? decodeURIComponent(match[1]!) : null;
}
