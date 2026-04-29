export interface AppConfigResult {
  slug: string;
  config: Record<string, unknown>;
  hasOverride: boolean;
}

interface InternalCtx {
  apiUrl: string;
  token: string | null;
  fetchImpl?: typeof fetch;
}

interface ConfigResponse {
  slug?: unknown;
  config?: unknown;
  has_override?: unknown;
  hasOverride?: unknown;
}

export async function fetchAppConfig(ctx: InternalCtx, slug: string): Promise<AppConfigResult> {
  return configRequest(ctx, slug, { method: 'GET' });
}

export async function updateAppConfig(
  ctx: InternalCtx,
  slug: string,
  config: Record<string, unknown>,
): Promise<AppConfigResult> {
  return configRequest(ctx, slug, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ config }),
  });
}

export async function resetAppConfig(ctx: InternalCtx, slug: string): Promise<AppConfigResult> {
  return configRequest(ctx, slug, { method: 'DELETE' });
}

async function configRequest(
  ctx: InternalCtx,
  slug: string,
  init: RequestInit,
): Promise<AppConfigResult> {
  if (!ctx.token) throw new Error('no_auth_token');
  if (!isValidSlug(slug)) throw new Error('invalid_slug');

  const fetchImpl = ctx.fetchImpl ?? fetch;
  const res = await fetchImpl(
    `${ctx.apiUrl.replace(/\/$/, '')}/api/apps/${encodeURIComponent(slug)}/config`,
    {
      ...init,
      headers: {
        authorization: `Bearer ${ctx.token}`,
        ...(init.headers as Record<string, string> | undefined),
      },
    },
  );

  if (res.status === 401) throw new Error('unauthenticated');
  if (res.status === 404) throw new Error('app_not_found');
  if (!res.ok) throw new Error(`config_failed:${res.status}`);

  return normalizeConfigResponse((await res.json()) as ConfigResponse);
}

function normalizeConfigResponse(body: ConfigResponse): AppConfigResult {
  if (typeof body.slug !== 'string') throw new Error('invalid_config_response');
  const hasOverride =
    typeof body.has_override === 'boolean'
      ? body.has_override
      : typeof body.hasOverride === 'boolean'
        ? body.hasOverride
        : false;
  return {
    slug: body.slug,
    config: isRecord(body.config) ? body.config : {},
    hasOverride,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidSlug(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,62}$/.test(value);
}
