/**
 * Maker apps list — Phase 1B placeholder.
 *
 * The platform doesn't yet expose `/api/apps?mine=true` for authenticated
 * makers. When it lands (Phase 7 expansion), this client wires through.
 * Until then we return [] so the MCP `apps` tool degrades gracefully.
 */

export interface AppListItem {
  slug: string;
  name: string;
  status: string;
  kind?: string | null;
  liveUrl?: string;
}

interface InternalCtx {
  apiUrl: string;
  token: string | null;
}

export async function fetchAppsList(_ctx: InternalCtx): Promise<AppListItem[]> {
  // TODO(phase-7): GET /api/apps?mine=true with bearer token, parse rows.
  return [];
}
