/**
 * User-facing feedback submit helper (Slice B).
 *
 * Posts to the existing wrapper feedback endpoint — `/__shippie/feedback?slug=…`
 * — which moderates and inserts a `feedback_items` row. That row then surfaces
 * in the Maker Feedback tab and the Maker Home "what people say" preview. No new
 * storage model; this is a thin, testable client over the existing endpoint.
 */

export const FEEDBACK_TYPES = [
  { value: 'bug', label: 'Issue' },
  { value: 'idea', label: 'Idea' },
  { value: 'praise', label: 'Praise' },
  { value: 'help', label: 'Help' },
  { value: 'other', label: 'Other' },
] as const;

export type FeedbackType = (typeof FEEDBACK_TYPES)[number]['value'];

export type ModerationStatus = 'open' | 'reviewing' | 'spam';

export type SubmitFeedbackResult =
  | { ok: true; status: ModerationStatus; id: string }
  | { ok: false; error: string };

export const MAX_FEEDBACK_LEN = 4000;

/** The reuse path: the endpoint resolves the app from the `slug` query param. */
export function feedbackEndpoint(slug: string): string {
  return `/__shippie/feedback?slug=${encodeURIComponent(slug)}`;
}

/**
 * Soft acknowledgement copy. We never expose the raw moderation verdict to the
 * user — `reviewing`/`spam` both read as "sent for review" so a flagged note
 * doesn't tell a spammer they were caught, and an honest user isn't alarmed.
 */
export function feedbackAck(status: ModerationStatus): string {
  return status === 'open' ? 'Thanks — sent to the maker.' : 'Thanks — sent for review.';
}

function normaliseStatus(value: unknown): ModerationStatus {
  return value === 'open' || value === 'reviewing' || value === 'spam' ? value : 'reviewing';
}

export async function submitAppFeedback(input: {
  slug: string;
  type: FeedbackType;
  message: string;
  fetchImpl?: typeof fetch;
}): Promise<SubmitFeedbackResult> {
  const message = input.message.trim();
  if (!message) return { ok: false, error: 'Add a short note before sending.' };
  if (!input.slug) return { ok: false, error: 'No app selected.' };

  const doFetch = input.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(feedbackEndpoint(input.slug), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: input.type, body: message.slice(0, MAX_FEEDBACK_LEN) }),
    });
  } catch {
    return { ok: false, error: "Couldn't reach the server — check your connection and try again." };
  }

  if (res.status === 429) {
    return { ok: false, error: 'You’ve sent a few already — give it a minute.' };
  }
  if (!res.ok) {
    return { ok: false, error: 'Something went wrong sending that. Try again.' };
  }

  const data = (await res.json().catch(() => null)) as
    | { ok?: boolean; id?: string; status?: string }
    | null;
  if (!data?.ok || !data.id) {
    return { ok: false, error: 'Something went wrong sending that. Try again.' };
  }
  return { ok: true, status: normaliseStatus(data.status), id: data.id };
}
