/**
 * Tag helpers — flat tags, user-managed, with optional on-device
 * classification suggestion.
 *
 * The fixed label set lets `shippie.ai.run({ task: 'classify' })` map
 * an article body to one of six common reading-list buckets. The user
 * is free to ignore the suggestion, edit the list manually, or add
 * their own freeform tags; nothing is auto-applied without confirmation.
 */
import type { ShippieIframeSdk } from '@shippie/iframe-sdk';
import type { SavedArticle } from './types.ts';

export const SUGGESTED_LABELS = [
  'tech',
  'business',
  'science',
  'culture',
  'personal',
  'news',
] as const;

export type SuggestedLabel = (typeof SUGGESTED_LABELS)[number];

/** Strip whitespace + lowercase + dedupe, capping length defensively. */
export function normaliseTag(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24);
}

export function dedupeTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of tags) {
    const t = normaliseTag(tag);
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export function addTag(article: SavedArticle, raw: string): SavedArticle {
  const t = normaliseTag(raw);
  if (!t) return article;
  const existing = article.tags ?? [];
  if (existing.includes(t)) return article;
  return { ...article, tags: dedupeTags([...existing, t]) };
}

export function removeTag(article: SavedArticle, raw: string): SavedArticle {
  const t = normaliseTag(raw);
  const existing = article.tags ?? [];
  if (!existing.includes(t)) return article;
  return { ...article, tags: existing.filter((x) => x !== t) };
}

/** Roll up every tag in use across the library, sorted by frequency desc. */
export function aggregateTags(articles: readonly SavedArticle[]): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>();
  for (const a of articles) {
    for (const tag of a.tags ?? []) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/**
 * Filter the queue by a single tag. `null` returns the input unchanged
 * — used by the page when no filter is active.
 */
export function filterByTag(articles: readonly SavedArticle[], tag: string | null): SavedArticle[] {
  if (!tag) return [...articles];
  const t = normaliseTag(tag);
  return articles.filter((a) => (a.tags ?? []).includes(t));
}

/**
 * Try to classify an article into one of SUGGESTED_LABELS using the
 * container's on-device classifier. Returns `null` when the worker is
 * unavailable — the UI hides the suggestion chip in that case.
 *
 * We pass the title + first 1000 chars of body. Classifier latency
 * scales with input length, and the head of an article almost always
 * carries enough signal to bin it.
 */
export async function suggestLabel(
  shippie: Pick<ShippieIframeSdk, 'ai'>,
  article: Pick<SavedArticle, 'title' | 'plainText'>,
): Promise<SuggestedLabel | null> {
  const head = article.plainText.slice(0, 1000);
  const input = `${article.title}\n\n${head}`.trim();
  if (!input) return null;
  try {
    const result = await shippie.ai.run({
      task: 'classify',
      input,
      options: { labels: [...SUGGESTED_LABELS] },
    });
    if (result.source === 'unavailable') return null;
    const out = result.output as { label?: string } | null;
    if (!out || typeof out.label !== 'string') return null;
    return SUGGESTED_LABELS.includes(out.label as SuggestedLabel)
      ? (out.label as SuggestedLabel)
      : null;
  } catch {
    return null;
  }
}
