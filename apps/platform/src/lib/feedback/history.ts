/**
 * Shaping a stored feedback row into the safe view a submitter sees in their
 * "Your feedback" history (on /you or via the capability read endpoint).
 * Pure + dependency-free so it can be unit-tested and shared server/client.
 */
import { userStatusLabel, type StatusTone } from './status';

export type FeedbackRowInput = {
  id: string;
  appSlug: string;
  appName: string;
  type: string;
  title: string | null;
  body: string | null;
  status: string;
  makerReply: string | null;
  makerReplyAt: string | null;
  createdAt: string;
};

export type UserFeedbackView = {
  id: string;
  appSlug: string;
  appName: string;
  type: string;
  preview: string;
  status: string;
  tone: StatusTone;
  makerReply: string | null;
  makerReplyAt: string | null;
  createdAt: string;
};

/** A short single-line preview of what the user wrote (their body, then title). */
export function feedbackPreview(body: string | null, title: string | null, max = 140): string {
  const text = (body ?? title ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + '…';
}

export function toUserFeedbackView(row: FeedbackRowInput): UserFeedbackView {
  const { label, tone } = userStatusLabel(row.status);
  return {
    id: row.id,
    appSlug: row.appSlug,
    appName: row.appName,
    type: row.type,
    preview: feedbackPreview(row.body, row.title),
    status: label,
    tone,
    makerReply: row.makerReply,
    makerReplyAt: row.makerReplyAt,
    createdAt: row.createdAt,
  };
}
