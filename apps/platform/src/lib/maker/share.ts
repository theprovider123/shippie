/**
 * Visibility/status-aware share logic for the maker app surface.
 *
 * A maker should never be handed a misleading link. The matrix:
 *   - public / unlisted / team + live  → copy + QR the public URL
 *   - private + live                   → open the Access / invite flow
 *   - draft / no deploy / failed       → blocked ("Ship first" / "Fix deploy")
 *
 * Pure + dependency-free so it can be unit-tested and used on client or server.
 */
export type ShareApp = {
  slug: string;
  visibilityScope: string;
  latestDeployStatus: string | null;
  activeDeployId: string | null;
};

export type ShareState =
  | { kind: 'public'; url: string }
  | { kind: 'invite'; href: string }
  | { kind: 'blocked'; reason: string };

export function isAppLive(app: Pick<ShareApp, 'latestDeployStatus' | 'activeDeployId'>): boolean {
  return Boolean(app.activeDeployId) || app.latestDeployStatus === 'success';
}

export function publicUrlFor(slug: string): string {
  return `https://shippie.app/${encodeURIComponent(slug)}`;
}

export function shareStateFor(app: ShareApp): ShareState {
  if (!isAppLive(app)) {
    const reason = app.latestDeployStatus === 'failed' ? 'Fix deploy' : 'Ship first';
    return { kind: 'blocked', reason };
  }
  if (app.visibilityScope === 'private') {
    return { kind: 'invite', href: `/maker/apps/${app.slug}/access` };
  }
  return { kind: 'public', url: publicUrlFor(app.slug) };
}
