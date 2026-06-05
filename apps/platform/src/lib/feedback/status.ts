/**
 * Feedback status vocabulary (Slice C).
 *
 * Two audiences, two label sets:
 *  - Makers triage with a calm pipeline: open → planned → fixed → closed.
 *  - Moderation may hold an item as `reviewing`/`spam` (set by the system, not
 *    the maker). Legacy rows may carry `hidden`/`resolved`.
 *  - Users see a SAFE label for their own item — the moderation/spam verdict is
 *    never exposed.
 */

/** The only statuses a maker may set by hand. */
export const MAKER_STATUSES = ['open', 'planned', 'fixed', 'closed'] as const;
export type MakerStatus = (typeof MAKER_STATUSES)[number];

export const MAX_MAKER_REPLY_LEN = 500;

export function isMakerStatus(value: unknown): value is MakerStatus {
  return typeof value === 'string' && (MAKER_STATUSES as readonly string[]).includes(value);
}

/** Maker-facing label — makers may see the real moderation state. */
export function makerStatusLabel(status: string): string {
  switch (status) {
    case 'open':
      return 'Open';
    case 'planned':
      return 'Planned';
    case 'fixed':
      return 'Fixed';
    case 'closed':
      return 'Closed';
    case 'reviewing':
    case 'spam':
      return 'In review';
    case 'hidden':
      return 'Hidden';
    case 'resolved':
      return 'Resolved';
    default:
      return status;
  }
}

export type StatusTone = 'open' | 'progress' | 'done' | 'pending';

/**
 * User-facing label for the submitter's own item. Moderation states
 * (`reviewing`/`spam`) and `hidden` collapse to a neutral "Submitted" — we
 * never tell a user their note was flagged.
 */
export function userStatusLabel(status: string): { label: string; tone: StatusTone } {
  switch (status) {
    case 'open':
      return { label: 'Open', tone: 'open' };
    case 'planned':
      return { label: 'Planned', tone: 'progress' };
    case 'fixed':
      return { label: 'Fixed', tone: 'done' };
    case 'resolved':
      return { label: 'Resolved', tone: 'done' };
    case 'closed':
      return { label: 'Closed', tone: 'done' };
    default:
      // reviewing · spam · hidden · anything unknown → safe, neutral.
      return { label: 'Submitted', tone: 'pending' };
  }
}
