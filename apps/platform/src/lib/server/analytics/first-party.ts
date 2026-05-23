import type { D1Database } from '@cloudflare/workers-types';
import { FIRST_PARTY_CURATION } from '$lib/_generated/first-party-curation';
import { SHOWCASE_SLUGS } from '$lib/_generated/showcase-catalog';
import { ensureShellAppSeeded, SHELL_USER_ID } from '../../util/shippie-shell';

const FIRST_PARTY_SLUGS = new Set<string>(SHOWCASE_SLUGS);

export interface FirstPartyAnalyticsSeed {
  id: string;
  slug: string;
  name: string;
  category: string;
  surface: string;
  visibilityScope: 'public' | 'unlisted';
}

export function firstPartyAnalyticsSeed(slug: string): FirstPartyAnalyticsSeed | null {
  if (!FIRST_PARTY_SLUGS.has(slug)) return null;
  const curation = FIRST_PARTY_CURATION.find((entry) => entry.slug === slug);
  const surface = curation?.surface ?? 'featured';
  return {
    id: `app_first_party_${slug.replace(/[^a-z0-9]+/g, '_')}`,
    slug,
    name: titleFromSlug(slug),
    category: curation?.category ?? 'tools',
    surface,
    visibilityScope: surface === 'archived' ? 'unlisted' : 'public',
  };
}

export async function ensureFirstPartyAnalyticsApp(d1: D1Database, slug: string): Promise<boolean> {
  const seed = firstPartyAnalyticsSeed(slug);
  if (!seed) return false;

  await ensureShellAppSeeded(d1);
  await d1
    .prepare(
      `INSERT OR IGNORE INTO apps
         (id, slug, name, type, category, theme_color, background_color,
          github_branch, source_type, source_kind, upstream_config,
          conflict_policy, maker_id, visibility_scope, is_archived,
          upvote_count, comment_count, install_count,
          active_users_30d, feedback_open_count, github_verified, surface)
       VALUES (?, ?, ?, 'app', ?, '#14120f', '#f5efe4',
               'main', 'first-party', 'static', '{}',
               'shippie', ?, ?, 0, 0, 0, 0, 0, 0, 0, ?)`,
    )
    .bind(seed.id, seed.slug, seed.name, seed.category, SHELL_USER_ID, seed.visibilityScope, seed.surface)
    .run();

  return true;
}

function titleFromSlug(slug: string): string {
  return slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
