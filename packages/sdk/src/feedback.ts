/**
 * shippie.feedback.*
 *
 * Attaches the current auth token (if available) so the platform can
 * identify the end-user via the BYO backend identity bridge.
 *
 * Spec v6 §7.1, §17.3.
 */
import { post } from './http.ts';
import { getToken } from './auth.ts';
import type { FeedbackItem } from './types.ts';

/**
 * Submission response includes `status` so callers can render the right
 * soft-ack to the user:
 *   - 'open'      — submitted and publicly visible right away
 *   - 'reviewing' — submitted, held for moderator review (auto-flagged)
 *   - 'spam'      — submitted, held; will be reviewed but probably blocked
 *   - 'hidden' / 'resolved' — only appear on later reads, not on submit
 * The submit itself never fails for moderation reasons — only network /
 * rate-limit failures throw.
 */
export interface FeedbackSubmitResult {
  id: string;
  status?: 'open' | 'reviewing' | 'spam' | 'hidden' | 'resolved';
}

export async function submit(item: FeedbackItem): Promise<FeedbackSubmitResult> {
  const token = await getToken().catch(() => null);
  const headers: Record<string, string> = {};
  if (token) headers['authorization'] = `Bearer ${token}`;
  return post<FeedbackSubmitResult>('/feedback', item, { headers });
}

export async function open(_type?: FeedbackItem['type']): Promise<void> {
  if (typeof window === 'undefined') return;
  window.open('/__shippie/feedback', '_blank', 'noopener');
}
