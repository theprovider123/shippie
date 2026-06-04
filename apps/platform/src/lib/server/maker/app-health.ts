import type { CapabilityBadge } from '$server/proof/taxonomy';

export const OPEN_EVENTS = ['app_open', 'opened'] as const;

export type OpensDay = {
  date: string;
  opens: number;
};

export type FeedbackPreviewRow = {
  id: string;
  type: string;
  title: string | null;
  body: string | null;
  voteCount: number;
  createdAt: string;
};

export type FeedbackPreview = {
  id: string;
  label: string;
  voteCount: number;
  createdAt: string;
};

export type EmptyStateKind = 'hidden' | 'prompt';

export function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function lastNDays(today: Date, count: number): string[] {
  return Array.from({ length: count }, (_, index) => {
    const offset = count - index - 1;
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - offset));
    return utcDayKey(d);
  });
}

export function zeroFillOpens(rows: OpensDay[], today = new Date(), count = 30): OpensDay[] {
  const byDate = new Map(rows.map((row) => [row.date, Number(row.opens) || 0]));
  return lastNDays(today, count).map((date) => ({ date, opens: byDate.get(date) ?? 0 }));
}

export function feedbackPreviewLabel(row: Pick<FeedbackPreviewRow, 'title' | 'body' | 'type'>): string {
  const title = row.title?.trim();
  if (title) return title;
  const body = row.body?.trim().replace(/\s+/g, ' ');
  if (body) return body.length > 84 ? `${body.slice(0, 81)}...` : body;
  return row.type;
}

export function compareFeedbackPreviewRows(a: FeedbackPreviewRow, b: FeedbackPreviewRow): number {
  const byVotes = b.voteCount - a.voteCount;
  if (byVotes !== 0) return byVotes;
  const byCreated = Date.parse(b.createdAt) - Date.parse(a.createdAt);
  if (byCreated !== 0) return byCreated;
  return b.id.localeCompare(a.id);
}

export function sortFeedbackPreviewRows(rows: FeedbackPreviewRow[]): FeedbackPreviewRow[] {
  return [...rows].sort(compareFeedbackPreviewRows);
}

export function toFeedbackPreview(rows: FeedbackPreviewRow[]): FeedbackPreview[] {
  return rows.map((row) => ({
    id: row.id,
    label: feedbackPreviewLabel(row),
    voteCount: row.voteCount,
    createdAt: row.createdAt,
  }));
}

export function feedbackPromptKind(openFeedbackCount: number): EmptyStateKind {
  return openFeedbackCount > 0 ? 'hidden' : 'prompt';
}

export function usagePromptKind(totalEvents: number): EmptyStateKind {
  return totalEvents > 0 ? 'hidden' : 'prompt';
}

export function proofSummary(input: {
  earnedBadges: readonly CapabilityBadge[];
  proofEventCount: number;
  totalBadges: number;
}): { show: boolean; earned: number; total: number; glyphs: string } {
  const earned = input.earnedBadges.length;
  const total = input.totalBadges;
  const show = earned > 0 || input.proofEventCount > 0;
  const filled = Math.min(earned, total);
  const glyphs = `${'◆'.repeat(filled)}${'◇'.repeat(Math.max(0, total - filled))}`;
  return { show, earned, total, glyphs };
}
