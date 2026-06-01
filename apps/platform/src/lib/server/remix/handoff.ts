import { eq } from 'drizzle-orm';
import { schema, type ShippieDb } from '$server/db/client';
import { remixEligibilityForSlug, type RemixableApp } from './eligibility';
import { describeRemixDataCompatibility } from './compatibility';
import { normalizeSourceRepo, type NormalizedSourceRepo } from './source-repo';

const SLUG_MAX = 63;
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export interface RemixDeployHints {
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
}

export interface RemixHandoffPayload {
  slug: string;
  name: string;
  tagline: string | null;
  sourceRepo: string;
  source: NormalizedSourceRepo;
  license: string;
  latestVersion: string | null;
  forkUrl: string | null;
  targetSlug: string;
  data: {
    family: string | null;
    compatibility: ReturnType<typeof describeRemixDataCompatibility>['status'];
    note: string;
  };
  deploy: RemixDeployHints;
}

export type RemixHandoff =
  | { ok: true; app: RemixableApp; remix: RemixHandoffPayload }
  | { ok: false; reason: string };

export async function remixHandoffForSlug(
  db: ShippieDb,
  slug: string,
  opts: { reservedSlugs?: ReadonlySet<string> } = {},
): Promise<RemixHandoff> {
  const eligibility = await remixEligibilityForSlug(db, slug);
  if (!eligibility.ok) return eligibility;

  const source = normalizeSourceRepo(eligibility.app.sourceRepo);
  if (!source) {
    return { ok: false, reason: 'The maker has not published a valid source repository URL.' };
  }

  const targetSlug = await suggestRemixSlug(db, eligibility.app.slug, opts.reservedSlugs ?? new Set());
  if (!targetSlug) {
    return { ok: false, reason: 'No available remix slug could be suggested for this app.' };
  }

  const dataCompatibility = describeRemixDataCompatibility({
    family: eligibility.app.dataFamily,
  });

  return {
    ok: true,
    app: eligibility.app,
    remix: {
      slug: eligibility.app.slug,
      name: eligibility.app.name,
      tagline: eligibility.app.tagline,
      sourceRepo: source.webUrl,
      source,
      license: eligibility.app.license,
      latestVersion: eligibility.app.latestVersion,
      forkUrl: source.forkUrl,
      targetSlug,
      data: {
        family: eligibility.app.dataFamily,
        compatibility: dataCompatibility.status,
        note: dataCompatibility.summary,
      },
      deploy: deployHints(eligibility.app.slug, targetSlug),
    },
  };
}

export async function suggestRemixSlug(
  db: ShippieDb,
  parentSlug: string,
  reservedSlugs: ReadonlySet<string> = new Set(),
  opts: { slugExists?: (slug: string) => Promise<boolean> } = {},
): Promise<string | null> {
  const exists = opts.slugExists ?? ((candidate: string) => slugExists(db, candidate));
  for (let attempt = 1; attempt <= 50; attempt += 1) {
    const candidate = remixSlugCandidate(parentSlug, attempt);
    if (!SLUG_RE.test(candidate)) continue;
    if (reservedSlugs.has(candidate)) continue;
    if (await exists(candidate)) continue;
    return candidate;
  }
  return null;
}

export function remixSlugCandidate(parentSlug: string, attempt = 1): string {
  const suffix = attempt <= 1 ? '-remix' : `-remix-${attempt}`;
  const stemMax = SLUG_MAX - suffix.length;
  const stem = parentSlug.slice(0, stemMax).replace(/-+$/g, '') || 'app';
  return `${stem}${suffix}`;
}

function deployHints(parentSlug: string, targetSlug: string): RemixDeployHints {
  return {
    cli: `shippie deploy ./dist --slug ${targetSlug} --remix ${parentSlug}`,
    mcp: {
      tool: 'deploy',
      arguments: {
        directory: '/absolute/path/to/dist',
        slug: targetSlug,
        remix_from: parentSlug,
      },
    },
    workspace: {
      slug: targetSlug,
      directory: 'dist',
      remixFrom: parentSlug,
    },
  };
}

async function slugExists(db: ShippieDb, slug: string): Promise<boolean> {
  const found = await db.query.apps.findFirst({
    where: eq(schema.apps.slug, slug),
    columns: { id: true },
  });
  return Boolean(found);
}
