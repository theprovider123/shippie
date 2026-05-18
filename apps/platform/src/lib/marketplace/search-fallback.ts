/**
 * Nearest-neighbour suggestions for empty search results.
 *
 * Pure function. Takes the user's query plus a haystack of apps and
 * returns the apps most likely to be what they meant. Scoring is naive
 * on purpose — token overlap across name + tagline + category — and
 * leaves room for a smarter resolver later without changing the call
 * site.
 */

type Suggestable = {
  slug: string;
  name: string;
  tagline?: string | null;
  description?: string | null;
  category?: string | null;
};

function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((token) => token.length > 1);
}

function scoreApp(queryTokens: Set<string>, app: Suggestable): number {
  const haystack = tokenise(
    [app.name, app.tagline ?? '', app.description ?? '', app.category ?? ''].join(' '),
  );
  let hits = 0;
  for (const token of haystack) {
    if (queryTokens.has(token)) hits += 1;
    else {
      for (const q of queryTokens) {
        if (q.length >= 3 && (token.includes(q) || q.includes(token))) {
          hits += 0.5;
          break;
        }
      }
    }
  }
  return hits;
}

export function suggestApps<T extends Suggestable>(
  query: string,
  pool: readonly T[],
  limit = 4,
): T[] {
  const queryTokens = new Set(tokenise(query));
  if (queryTokens.size === 0 || pool.length === 0) return [];
  const scored = pool
    .map((app) => ({ app, score: scoreApp(queryTokens, app) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(({ app }) => app);
}

export function suggestCategories(
  query: string,
  categories: readonly string[],
  limit = 3,
): string[] {
  if (categories.length === 0) return [];
  const queryTokens = new Set(tokenise(query));
  if (queryTokens.size === 0) return categories.slice(0, limit);
  const scored = categories
    .map((cat) => ({
      cat,
      score: tokenise(cat).reduce((sum, token) => {
        if (queryTokens.has(token)) return sum + 2;
        for (const q of queryTokens) {
          if (q.length >= 3 && (token.includes(q) || q.includes(token))) return sum + 1;
        }
        return sum;
      }, 0),
    }))
    .sort((a, b) => b.score - a.score);
  const hits = scored.filter(({ score }) => score > 0).map(({ cat }) => cat);
  if (hits.length > 0) return hits.slice(0, limit);
  return categories.slice(0, limit);
}
