export interface RemixHandoff {
  slug: string;
  name: string;
  tagline?: string | null;
  sourceRepo: string;
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

  return {
    slug: remix.slug,
    name: typeof remix.name === 'string' ? remix.name : remix.slug,
    tagline: typeof remix.tagline === 'string' || remix.tagline === null ? remix.tagline : null,
    sourceRepo: remix.sourceRepo,
    license: remix.license,
    latestVersion:
      typeof remix.latestVersion === 'string' || remix.latestVersion === null
        ? remix.latestVersion
        : null,
    forkUrl:
      typeof remix.forkUrl === 'string' || remix.forkUrl === null
        ? remix.forkUrl
        : null,
    deploy: normalizeDeployHints(remix.deploy, remix.slug),
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
