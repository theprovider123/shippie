/**
 * Curated first-run starters (spec §5 State 2). Pure + generic. Flagship
 * tools first (in flagship order), then fill from catalog order. Degrades
 * to the catalog head when the flagship slate is empty (un-baked worktree).
 */
export function pickStarters<T extends { slug: string }>(
  catalog: readonly T[],
  flagshipSlugs: readonly string[],
  limit: number,
): T[] {
  const bySlug = new Map(catalog.map((a) => [a.slug, a]));
  const picked: T[] = [];
  const seen = new Set<string>();
  for (const slug of flagshipSlugs) {
    const app = bySlug.get(slug);
    if (app && !seen.has(slug)) {
      picked.push(app);
      seen.add(slug);
      if (picked.length >= limit) return picked;
    }
  }
  for (const app of catalog) {
    if (!seen.has(app.slug)) {
      picked.push(app);
      seen.add(app.slug);
      if (picked.length >= limit) return picked;
    }
  }
  return picked;
}
