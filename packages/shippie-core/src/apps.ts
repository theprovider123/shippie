export interface AppListItem {
  slug: string;
  name: string;
  status: string;
  kind?: string | null;
  liveUrl?: string;
  visibility?: string;
  updatedAt?: string;
}

interface InternalCtx {
  apiUrl: string;
  token: string | null;
  fetchImpl?: typeof fetch;
}

interface AppsListResponse {
  apps?: Array<{
    slug?: unknown;
    name?: unknown;
    status?: unknown;
    kind?: unknown;
    live_url?: unknown;
    liveUrl?: unknown;
    visibility?: unknown;
    updated_at?: unknown;
    updatedAt?: unknown;
  }>;
  error?: unknown;
}

export async function fetchAppsList(ctx: InternalCtx): Promise<AppListItem[]> {
  if (!ctx.token) {
    throw new Error('no_auth_token');
  }

  const fetchImpl = ctx.fetchImpl ?? fetch;
  const res = await fetchImpl(`${ctx.apiUrl.replace(/\/$/, '')}/api/apps`, {
    headers: { authorization: `Bearer ${ctx.token}` },
  });

  if (res.status === 401) throw new Error('unauthenticated');
  if (!res.ok) throw new Error(`apps_list_failed:${res.status}`);

  const body = (await res.json()) as AppsListResponse;
  return (body.apps ?? [])
    .map((item) => normalizeAppListItem(item))
    .filter((item): item is AppListItem => Boolean(item));
}

function normalizeAppListItem(item: NonNullable<AppsListResponse['apps']>[number]): AppListItem | null {
  if (typeof item.slug !== 'string' || typeof item.name !== 'string') return null;
  return {
    slug: item.slug,
    name: item.name,
    status: typeof item.status === 'string' ? item.status : 'unknown',
    kind: typeof item.kind === 'string' ? item.kind : item.kind === null ? null : undefined,
    liveUrl:
      typeof item.live_url === 'string'
        ? item.live_url
        : typeof item.liveUrl === 'string'
          ? item.liveUrl
          : undefined,
    visibility: typeof item.visibility === 'string' ? item.visibility : undefined,
    updatedAt:
      typeof item.updated_at === 'string'
        ? item.updated_at
        : typeof item.updatedAt === 'string'
          ? item.updatedAt
          : undefined,
  };
}
