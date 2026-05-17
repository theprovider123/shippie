/**
 * Tag normalization + add/remove helpers.
 *
 * Voice-memo tags are kid-simple: comma-separated free text, lowercased,
 * trimmed, deduped. The store keeps the *display* form on each memo
 * (so `Family` stays `Family`) but lookups normalise both sides.
 */

export function normalizeTag(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').replace(/[,;]+$/u, '').slice(0, 32);
}

export function parseTags(input: string): string[] {
  return input
    .split(/[,;\n]/)
    .map(normalizeTag)
    .filter((t) => t.length > 0);
}

export function addTag(existing: readonly string[], tag: string): string[] {
  const next = normalizeTag(tag);
  if (!next) return [...existing];
  const lower = next.toLowerCase();
  if (existing.some((t) => t.toLowerCase() === lower)) return [...existing];
  return [...existing, next];
}

export function removeTag(existing: readonly string[], tag: string): string[] {
  const lower = tag.trim().toLowerCase();
  return existing.filter((t) => t.toLowerCase() !== lower);
}

export function tagDisplay(tags: readonly string[]): string {
  return tags.join(', ');
}
