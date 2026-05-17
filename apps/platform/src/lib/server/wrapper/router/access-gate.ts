/**
 * Runtime access gate for private apps. Ported from
 * services/worker/src/router/access-gate.ts.
 *
 * Returns null if the request is permitted to proceed, or a Response if
 * the gate short-circuits (401 invite-required / 500 misconfigured).
 */
import type { WrapperContext } from '../env';
import { and, eq, isNull } from 'drizzle-orm';
import {
  verifyInviteGrant,
  inviteCookieName
} from '@shippie/access/invite-cookie';
import type { AppMetaRuntime } from '../platform-client';
import { createLucia } from '$server/auth/lucia';
import { getDrizzleClient, schema } from '$server/db/client';

export interface AccessGateOpts {
  meta: AppMetaRuntime | null;
}

export async function runAccessGate(
  ctx: WrapperContext,
  opts: AccessGateOpts
): Promise<Response | null> {
  // System routes never go through the gate.
  if (new URL(ctx.request.url).pathname.startsWith('/__shippie/')) {
    return null;
  }
  const meta = opts.meta;
  if (!meta || (meta.visibility_scope !== 'private' && meta.visibility_scope !== 'team')) return null;

  const userId = await sessionUserId(ctx);
  if (meta.visibility_scope === 'team') {
    if (meta.organization_id && userId && await hasTeamAccess(ctx, meta.organization_id, userId)) {
      return null;
    }
    return new Response(renderTeamRequired(), {
      status: 403,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }

  if (userId && await hasPrivateAccess(ctx, meta.slug, userId)) {
    return null;
  }

  const secret = ctx.env.INVITE_SECRET ?? ctx.env.AUTH_SECRET;
  if (!secret) {
    return new Response(renderMisconfigured(), {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }

  const secure = ctx.request.url.startsWith('https:');
  const cookieName = inviteCookieName(meta.slug, { secure });
  const cookieHeader = ctx.request.headers.get('cookie') ?? '';
  const escaped = cookieName.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  const match = cookieHeader.match(new RegExp(`${escaped}=([^;]+)`));
  if (match) {
    const grant = await verifyInviteGrant(match[1]!, secret);
    if (grant && grant.app === meta.slug) return null;
  }

  return new Response(renderInviteRequired(), {
    status: 401,
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

async function sessionUserId(ctx: WrapperContext): Promise<string | null> {
  const cookieHeader = ctx.request.headers.get('cookie') ?? '';
  if (!cookieHeader) return null;

  const lucia = createLucia(ctx.env.DB, ctx.env);
  const sessionId = readCookie(cookieHeader, lucia.sessionCookieName);
  if (!sessionId) return null;

  try {
    const { user } = await lucia.validateSession(sessionId);
    return user?.id ?? null;
  } catch (err) {
    console.error('[shippie:access-gate] session validation failed', err);
    return null;
  }
}

async function hasPrivateAccess(ctx: WrapperContext, slug: string, userId: string): Promise<boolean> {
  const db = getDrizzleClient(ctx.env.DB);
  const [app] = await db
    .select({ id: schema.apps.id, makerId: schema.apps.makerId })
    .from(schema.apps)
    .where(eq(schema.apps.slug, slug))
    .limit(1);
  if (!app) return false;
  if (app.makerId === userId) return true;

  const [grant] = await db
    .select({ id: schema.appAccess.id })
    .from(schema.appAccess)
    .where(
      and(
        eq(schema.appAccess.appId, app.id),
        eq(schema.appAccess.userId, userId),
        isNull(schema.appAccess.revokedAt),
      ),
    )
    .limit(1);
  return Boolean(grant);
}

async function hasTeamAccess(ctx: WrapperContext, organizationId: string, userId: string): Promise<boolean> {
  const db = getDrizzleClient(ctx.env.DB);
  const [membership] = await db
    .select({ role: schema.organizationMembers.role })
    .from(schema.organizationMembers)
    .where(
      and(
        eq(schema.organizationMembers.orgId, organizationId),
        eq(schema.organizationMembers.userId, userId),
      ),
    )
    .limit(1);
  return Boolean(membership);
}

function readCookie(cookieHeader: string, name: string): string | null {
  const escaped = name.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]+)`));
  return match ? decodeURIComponent(match[1]!) : null;
}

function renderInviteRequired(): string {
  return `<!doctype html><html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Invite required</title>
<meta name="robots" content="noindex,nofollow">
<style>
  :root { color-scheme: dark light; }
  body { font-family: system-ui, -apple-system, sans-serif; background: #14120F; color: #EDE4D3; margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 2rem; }
  main { max-width: 420px; text-align: center; }
  h1 { font-family: 'Iowan Old Style', Georgia, serif; font-size: 2rem; letter-spacing: -0.02em; margin: 0 0 1rem; }
  p { color: #C9BEA9; line-height: 1.6; margin: 0 0 2rem; }
  a { color: #E8603C; text-decoration: none; font-family: ui-monospace, SFMono-Regular, monospace; font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; }
</style>
</head><body>
<main>
  <h1>Invite required</h1>
  <p>This is a private app on Shippie. Ask the owner for an invite link, or request access from whoever shared it with you.</p>
  <a href="https://shippie.app">← shippie.app</a>
</main>
</body></html>`;
}

function renderTeamRequired(): string {
  return `<!doctype html><html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Team access required</title>
<meta name="robots" content="noindex,nofollow">
<style>
  :root { color-scheme: dark light; }
  body { font-family: system-ui, -apple-system, sans-serif; background: #14120F; color: #EDE4D3; margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 2rem; }
  main { max-width: 420px; text-align: center; }
  h1 { font-family: 'Iowan Old Style', Georgia, serif; font-size: 2rem; margin: 0 0 1rem; }
  p { color: #C9BEA9; line-height: 1.6; margin: 0; }
</style>
</head><body>
<main>
  <h1>Team access required</h1>
  <p>This Shippie tool belongs to a team workspace. Sign in with an account that belongs to that organization.</p>
</main>
</body></html>`;
}

function renderMisconfigured(): string {
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;padding:3rem;text-align:center">
<h1>Server misconfigured</h1>
<p>INVITE_SECRET binding is missing.</p>
</body></html>`;
}
