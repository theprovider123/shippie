/**
 * Runtime access gate for private apps. Ported from
 * services/worker/src/router/access-gate.ts.
 *
 * Returns null if the request is permitted to proceed, or a Response if
 * the gate short-circuits (401 invite-required / 500 misconfigured).
 */
import type { WrapperContext } from '../env';
import {
  verifyInviteGrant,
  inviteCookieName
} from '@shippie/access/invite-cookie';
import type { AppMetaRuntime } from '../platform-client';

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
  if (!meta || meta.visibility_scope !== 'private') return null;

  const secret = ctx.env.INVITE_SECRET;
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

function renderMisconfigured(): string {
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;padding:3rem;text-align:center">
<h1>Server misconfigured</h1>
<p>INVITE_SECRET binding is missing.</p>
</body></html>`;
}
