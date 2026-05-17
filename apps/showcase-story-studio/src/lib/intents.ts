/**
 * Story Studio's intent emissions.
 *
 * - `story-made` fires the moment a story has at least one page and
 *   stable metadata. Useful for the local agent + ambient surfaces.
 * - `story-shared` fires when the parent successfully sends a story
 *   to a paired grandparent (or generates a signed-blob link they
 *   pass via WhatsApp). Errors don't fire `story-shared` — the wire
 *   has to be confirmed.
 *
 * We consume nothing — Story Studio is pure creation, not aggregation.
 */
import { createShippieIframeSdk } from '@shippie/iframe-sdk';

const APP_ID = 'app_story_studio';

export const shippie = createShippieIframeSdk({ appId: APP_ID });

export interface StoryMadePayload {
  storyId: string;
  title: string;
  pageCount: number;
  hasAudio: boolean;
  madeBy: string;
}

export interface StorySharedPayload {
  storyId: string;
  title: string;
  channel: 'mesh' | 'signed-link';
  /** Display name of the recipient as the parent set it ("Granny"). */
  recipientLabel: string;
}

export function emitStoryMade(payload: StoryMadePayload): void {
  shippie.intent.broadcast('story-made', [payload]);
}

export function emitStoryShared(payload: StorySharedPayload): void {
  shippie.intent.broadcast('story-shared', [payload]);
}
