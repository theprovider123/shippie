/**
 * Runtime access gate for private apps.
 *
 * Runs after slug resolution and before wrap/static dispatch. For apps whose
 * visibility_scope is 'private', checks for a valid signed invite-cookie and
 * short-circuits to a 401 invite-required page if missing.
 *
 * App metadata (visibility_scope) is loaded from KV at `apps:{slug}:meta`.
 * The deploy pipeline writes this key on every create/update/visibility
 * change via writeAppMeta() in the control plane.
 */
import type { MiddlewareHandler } from 'hono';
import type { AppBindings } from '../app.ts';
import { verifyInviteGrant, inviteCookieName } from '@shippie/access/invite-cookie';

export interface AccessMeta {
  visibility_scope: 'public' | 'unlisted' | 'private';
  slug: string;
}

function cookieIsSecure(c: { req: { url: string } }): boolean {
  return c.req.url.startsWith('https:');
}

export function accessGate(deps: {
  loadMeta: (slug: string, env: AppBindings['Bindings']) => Promise<AccessMeta | null>;
}): MiddlewareHandler<AppBindings> {
  return async (c, next) => {
    // System routes never go through the gate.
    if (c.req.path.startsWith('/__shippie/')) return next();

    const meta = await deps.loadMeta(c.var.slug, c.env);
    if (!meta || meta.visibility_scope !== 'private') return next();

    const secret = c.env.INVITE_SECRET;
    if (!secret) {
      return c.html(renderMisconfigured(), 500);
    }

    const cookieName = inviteCookieName(meta.slug, { secure: cookieIsSecure(c) });
    const cookieHeader = c.req.header('cookie') ?? '';
    const escaped = cookieName.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const match = cookieHeader.match(new RegExp(`${escaped}=([^;]+)`));
    if (match) {
      const grant = await verifyInviteGrant(match[1]!, secret);
      if (grant && grant.app === meta.slug) return next();
    }

    return c.html(renderInviteRequired(meta.slug), 401);
  };
}

function renderInviteRequired(_slug: string): string {
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

function renderMisconfigured(): string {
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;padding:3rem;text-align:center">
<h1>Server misconfigured</h1>
<p>INVITE_SECRET binding is missing.</p>
</body></html>`;
}
