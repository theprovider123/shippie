export interface StatusResult {
  ok: boolean;
  deployId?: string;
  slug?: string;
  version?: number;
  /** building | ready | cold-pending | done | failed */
  phase?: string;
  durationMs?: number | null;
  error?: string;
  status?: number;
}

interface InternalCtx {
  apiUrl: string;
}

export async function fetchStatus(
  ctx: InternalCtx,
  deployId: string,
): Promise<StatusResult> {
  const res = await fetch(
    `${ctx.apiUrl}/api/deploy/${encodeURIComponent(deployId)}/status`,
  );
  if (res.status === 404) {
    return { ok: false, status: 404, error: 'deploy_not_found' };
  }
  if (!res.ok) {
    return { ok: false, status: res.status, error: res.statusText };
  }

  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    return { ok: false, status: res.status, error: 'invalid_json_response' };
  }

  return {
    ok: true,
    status: res.status,
    deployId: typeof json.deploy_id === 'string' ? json.deploy_id : undefined,
    slug: typeof json.slug === 'string' ? json.slug : undefined,
    version: typeof json.version === 'number' ? json.version : undefined,
    phase: typeof json.phase === 'string' ? json.phase : undefined,
    durationMs:
      typeof json.duration_ms === 'number'
        ? json.duration_ms
        : json.duration_ms === null
          ? null
          : undefined,
  };
}
