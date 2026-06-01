/**
 * Canvas resume/insight strip selector (spec §7). Pure + framework-free so
 * it can be unit-tested. One item, actionable-only: a cross-tool insight
 * beats a resume hint. Nothing actionable → null (the strip disappears).
 */
import type { Insight } from '@shippie/agent';

export interface CanvasStripItem {
  id: string;
  kind: 'insight' | 'resume';
  title: string;
  body: string;
  targetSlug: string;
  /** Other actionable insights not shown — drives the collapsed badge. */
  remaining: number;
}

const URGENCY_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };

export function selectCanvasStripItem(input: {
  insights: readonly Insight[];
  recents: { slug: string; lastOpened: string }[];
  catalog: { slug: string; name: string }[];
  activeSlug: string | null;
  openSlugs: string[];
  dismissedIds: Set<string>;
  now: number;
}): CanvasStripItem | null {
  const live = input.insights.filter(
    (i) => !input.dismissedIds.has(i.id) && !(i.expiresAt != null && i.expiresAt < input.now),
  );
  if (live.length > 0) {
    const sorted = [...live].sort(
      (a, b) =>
        (URGENCY_RANK[b.urgency] ?? 0) - (URGENCY_RANK[a.urgency] ?? 0) || b.generatedAt - a.generatedAt,
    );
    const top = sorted[0]!;
    return {
      id: top.id,
      kind: 'insight',
      title: top.title,
      body: top.body,
      targetSlug: top.target.app,
      remaining: sorted.length - 1,
    };
  }

  const open = new Set(input.openSlugs);
  const bySlug = new Map(input.catalog.map((c) => [c.slug, c]));
  const resume = [...input.recents]
    .sort((a, b) => (a.lastOpened < b.lastOpened ? 1 : -1))
    .find(
      (r) =>
        r.slug !== input.activeSlug &&
        !open.has(r.slug) &&
        bySlug.has(r.slug) &&
        !input.dismissedIds.has(`resume:${r.slug}`),
    );
  if (resume) {
    const name = bySlug.get(resume.slug)!.name;
    return { id: `resume:${resume.slug}`, kind: 'resume', title: `Resume ${name}`, body: '', targetSlug: resume.slug, remaining: 0 };
  }
  return null;
}
