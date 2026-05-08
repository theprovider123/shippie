export interface FeedbackModerationInput {
  type: string;
  title: string | null;
  body: string | null;
  rating: number | null;
}

export interface FeedbackModerationResult {
  status: 'open' | 'reviewing' | 'spam';
  flags: string[];
}

const HARD_SPAM = [
  /\bfree\s+crypto\b/i,
  /\bcasino\b/i,
  /\btelegram\b/i,
  /\bwhatsapp\b/i,
  /\bseo\s+backlinks?\b/i,
];

const REVIEW = [
  /\bscam\b/i,
  /\bugs?\b/i,
  /\bhate\b/i,
  /\bkill\b/i,
  /\bmedical\b/i,
  /\bdiagnos/i,
  /\binvest(?:ment|ing)?\b/i,
  /\bguaranteed\b/i,
];

export function moderateFeedback(input: FeedbackModerationInput): FeedbackModerationResult {
  const text = `${input.title ?? ''}\n${input.body ?? ''}`.trim();
  const flags: string[] = [];

  if (text.length === 0 && input.type !== 'rating') flags.push('empty');
  if (urlCount(text) > 2) flags.push('many-links');
  if (/[A-Za-z0-9+/=_-]{32,}/.test(text)) flags.push('secret-like-token');
  if (HARD_SPAM.some((pattern) => pattern.test(text))) flags.push('spam-language');
  if (REVIEW.some((pattern) => pattern.test(text))) flags.push('review-language');
  if (input.rating != null && input.rating <= 2 && text.length < 12) flags.push('low-rating-no-context');

  if (flags.some((flag) => flag === 'spam-language' || flag === 'many-links')) {
    return { status: 'spam', flags };
  }
  if (flags.length > 0) return { status: 'reviewing', flags };
  return { status: 'open', flags };
}

function urlCount(value: string): number {
  return value.match(/https?:\/\/|www\./gi)?.length ?? 0;
}
