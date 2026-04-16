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

export async function submit(item: FeedbackItem): Promise<{ id: string }> {
  const token = await getToken().catch(() => null);
  const headers: Record<string, string> = {};
  if (token) headers['authorization'] = `Bearer ${token}`;
  return post<{ id: string }>('/feedback', item, { headers });
}

export async function open(_type?: FeedbackItem['type']): Promise<void> {
  if (typeof window === 'undefined') return;
  window.open('/__shippie/feedback', '_blank', 'noopener');
}
