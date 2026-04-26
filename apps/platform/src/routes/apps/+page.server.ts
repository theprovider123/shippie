/**
 * Marketplace browse — `/apps`.
 *
 * Empty `q` → top-of-the-marketplace browse, ordered by upvote then
 * install count. Non-empty `q` → FTS5 search. The query string is
 * sanitised in `buildFtsQuery` (see `db/queries/apps.ts`) so we never
 * concatenate user input into a MATCH predicate raw.
 *
 * Pagination strategy: simple offset paging via `?p=` (1-indexed). Cheap
 * for the current catalogue size (28 apps) and bookmarkable. Switching
 * to keyset / infinite-scroll is a Phase 4b polish if/when the catalogue
 * grows past a few hundred.
 */
import type { PageServerLoad } from './$types';
import { getDrizzleClient } from '$server/db/client';
import { browsePublic, searchPublic, listCategories } from '$server/db/queries/apps';

const PER_PAGE = 24;

export const load: PageServerLoad = async ({ platform, url }) => {
  if (!platform?.env.DB) {
    return {
      apps: [],
      query: '',
      page: 1,
      hasMore: false,
      categories: [],
    };
  }

  const db = getDrizzleClient(platform.env.DB);
  const query = (url.searchParams.get('q') ?? '').trim();
  const page = Math.max(1, Number.parseInt(url.searchParams.get('p') ?? '1', 10) || 1);
  const offset = (page - 1) * PER_PAGE;

  const [apps, categories] = await Promise.all([
    query
      ? searchPublic(db, query, { limit: PER_PAGE + 1, offset })
      : browsePublic(db, { limit: PER_PAGE + 1, offset }),
    listCategories(db),
  ]);

  const hasMore = apps.length > PER_PAGE;
  return {
    apps: apps.slice(0, PER_PAGE),
    query,
    page,
    hasMore,
    categories,
  };
};
