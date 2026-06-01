export interface RemixHandoff {
  slug: string;
  targetSlug: string;
  name: string;
  tagline?: string | null;
  sourceRepo: string;
  source?: RemixSourceInfo | null;
  license: string;
  latestVersion?: string | null;
  forkUrl?: string | null;
  deploy: {
    cli: string;
    mcp: {
      tool: 'deploy';
      arguments: {
        directory: string;
        slug: string;
        remix_from: string;
      };
    };
    workspace: {
      slug: string;
      directory: string;
      remixFrom: string;
    };
  };
}

export interface RemixSourceInfo {
  webUrl: string;
  cloneUrl: string | null;
  forkUrl: string | null;
  owner: string | null;
  repo: string | null;
  ref: string | null;
  path: string | null;
}

interface InternalCtx {
  apiUrl: string;
  fetchImpl?: typeof fetch;
}

interface RemixInfoResponse {
  remix?: Partial<RemixHandoff>;
  error?: unknown;
  reason?: unknown;
}

export async function fetchRemixInfo(ctx: InternalCtx, slug: string): Promise<RemixHandoff> {
  const normalizedSlug = slug.trim();
  if (!/^[a-z0-9-]{1,63}$/.test(normalizedSlug)) {
    throw new Error('invalid_slug');
  }

  const fetchImpl = ctx.fetchImpl ?? fetch;
  const res = await fetchImpl(
    `${ctx.apiUrl.replace(/\/$/, '')}/api/apps/${encodeURIComponent(normalizedSlug)}/remix`,
  );

  const body = (await res.json().catch(() => ({}))) as RemixInfoResponse;
  if (!res.ok) {
    const reason = typeof body.reason === 'string' ? body.reason : undefined;
    const err = typeof body.error === 'string' ? body.error : `remix_info_failed:${res.status}`;
    throw new Error(reason ? `${err}: ${reason}` : err);
  }

  const remix = body.remix;
  if (!remix || typeof remix.slug !== 'string' || typeof remix.sourceRepo !== 'string' || typeof remix.license !== 'string') {
    throw new Error('invalid_remix_response');
  }

  const deploy = normalizeDeployHints(remix.deploy, remix.slug);
  return {
    slug: remix.slug,
    targetSlug: typeof remix.targetSlug === 'string' ? remix.targetSlug : deploy.workspace.slug,
    name: typeof remix.name === 'string' ? remix.name : remix.slug,
    tagline: typeof remix.tagline === 'string' || remix.tagline === null ? remix.tagline : null,
    sourceRepo: remix.sourceRepo,
    source: normalizeSourceInfo(remix.source),
    license: remix.license,
    latestVersion:
      typeof remix.latestVersion === 'string' || remix.latestVersion === null
        ? remix.latestVersion
        : null,
    forkUrl:
      typeof remix.forkUrl === 'string' || remix.forkUrl === null
        ? remix.forkUrl
        : null,
    deploy,
  };
}

function normalizeSourceInfo(value: unknown): RemixSourceInfo | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.webUrl !== 'string') return null;
  return {
    webUrl: raw.webUrl,
    cloneUrl: typeof raw.cloneUrl === 'string' || raw.cloneUrl === null ? raw.cloneUrl : null,
    forkUrl: typeof raw.forkUrl === 'string' || raw.forkUrl === null ? raw.forkUrl : null,
    owner: typeof raw.owner === 'string' || raw.owner === null ? raw.owner : null,
    repo: typeof raw.repo === 'string' || raw.repo === null ? raw.repo : null,
    ref: typeof raw.ref === 'string' || raw.ref === null ? raw.ref : null,
    path: typeof raw.path === 'string' || raw.path === null ? raw.path : null,
  };
}

function normalizeDeployHints(value: Partial<RemixHandoff['deploy']> | undefined, slug: string): RemixHandoff['deploy'] {
  const fallbackTarget = `${slug}-remix`;
  return {
    cli:
      typeof value?.cli === 'string'
        ? value.cli
        : `shippie deploy ./dist --slug ${fallbackTarget} --remix ${slug}`,
    mcp: {
      tool: 'deploy',
      arguments: {
        directory:
          typeof value?.mcp?.arguments?.directory === 'string'
            ? value.mcp.arguments.directory
            : '/absolute/path/to/dist',
        slug:
          typeof value?.mcp?.arguments?.slug === 'string'
            ? value.mcp.arguments.slug
            : fallbackTarget,
        remix_from:
          typeof value?.mcp?.arguments?.remix_from === 'string'
            ? value.mcp.arguments.remix_from
            : slug,
      },
    },
    workspace: {
      slug:
        typeof value?.workspace?.slug === 'string'
          ? value.workspace.slug
          : fallbackTarget,
      directory:
        typeof value?.workspace?.directory === 'string'
          ? value.workspace.directory
          : 'dist',
      remixFrom:
        typeof value?.workspace?.remixFrom === 'string'
          ? value.workspace.remixFrom
          : slug,
    },
  };
}
