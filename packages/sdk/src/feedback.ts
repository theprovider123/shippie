/**
 * shippie.feedback.*
 *
 * Spec v6 §7.1, §17.3.
 */
import { post } from './http.ts';
import type { FeedbackItem } from './types.ts';

export async function submit(item: FeedbackItem): Promise<{ id: string }> {
  return post<{ id: string }>('/feedback', item);
}

export async function open(_type?: FeedbackItem['type']): Promise<void> {
  // Opens the platform-hosted feedback modal. Week 10 wires this to a
  // real overlay; for now, navigate to the platform feedback page.
  if (typeof window === 'undefined') return;
  window.open('/__shippie/feedback', '_blank', 'noopener');
}
