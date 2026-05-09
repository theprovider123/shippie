import type { DeployVisibility } from './deploy.ts';

interface InternalCtx {
  apiUrl: string;
  token: string | null;
}

export interface VisibilityOptions {
  slug: string;
  visibility: DeployVisibility;
  organization?: string;
}

export interface VisibilityResult {
  ok: boolean;
  slug?: string;
  visibility?: DeployVisibility;
  error?: string;
  status?: number;
}

export async function updateAppVisibility(
  ctx: InternalCtx,
  opts: VisibilityOptions,
): Promise<VisibilityResult> {
  if (!ctx.token) {
    return { ok: false, error: 'no_auth_token' };
  }

  const res = await fetch(`${ctx.apiUrl}/api/apps/${encodeURIComponent(opts.slug)}/visibility`, {
    method: 'PATCH',
    headers: {
      authorization: `Bearer ${ctx.token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      visibility_scope: opts.visibility,
      organization: opts.organization,
    }),
  });

  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    return { ok: false, status: res.status, error: 'invalid_json_response' };
  }

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: typeof json.error === 'string' ? json.error : res.statusText,
    };
  }

  return {
    ok: true,
    status: res.status,
    slug: opts.slug,
    visibility: opts.visibility,
  };
}
