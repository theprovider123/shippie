/**
 * Share moments — every hero surface can leave the app as text + a deep link.
 * Native share sheet where the platform has one, clipboard everywhere else.
 * Links are canonical app URLs (/cannon?…) so they unfurl with the Cannon's
 * own OG card, not a generic Shippie one.
 */

export const CANONICAL = 'https://shippie.app/cannon';

export function matchLink(matchId: string): string {
  return `${CANONICAL}?m=${encodeURIComponent(matchId)}`;
}

export function playerLink(playerId: string): string {
  return `${CANONICAL}?p=${encodeURIComponent(playerId)}`;
}

export interface ShareMoment {
  title: string;
  text: string;
  url: string;
}

export async function share(moment: ShareMoment): Promise<'shared' | 'copied' | 'failed'> {
  const payload = `${moment.text}\n${moment.url}`;
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      await navigator.share({ title: moment.title, text: moment.text, url: moment.url });
      return 'shared';
    }
  } catch (err) {
    // AbortError = user closed the sheet; treat as done, not failure.
    if (err instanceof DOMException && err.name === 'AbortError') return 'shared';
  }
  try {
    await navigator.clipboard.writeText(payload);
    return 'copied';
  } catch {
    return 'failed';
  }
}
