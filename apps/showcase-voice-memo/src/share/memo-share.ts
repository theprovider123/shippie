/**
 * Share a transcript via @shippie/share. We share the TRANSCRIPT, not
 * the audio — Whisper is a one-way trust transfer; we don't want to
 * leak someone's voice biometric to the recipient by default.
 */
import { buildShareUrl, createSignedBlob, type ShareBlob } from '@shippie/share';
import type { Memo } from '../lib/store.ts';

export interface MemoSharePayload {
  title: string;
  transcript: string;
  language: string;
  duration_s: number;
  recorded_at: string;
  tags: string[];
}

export interface MemoForShare {
  id: string;
  title: string;
  transcript: string;
  language: string;
  duration_s: number;
  recorded_at: string;
  tags: string[];
}

export async function buildMemoShare(memo: MemoForShare): Promise<{
  blob: ShareBlob<MemoSharePayload>;
  url: string;
}> {
  const payload: MemoSharePayload = {
    title: memo.title,
    transcript: memo.transcript,
    language: memo.language,
    duration_s: memo.duration_s,
    recorded_at: memo.recorded_at,
    tags: [...memo.tags],
  };
  const blob = await createSignedBlob({ type: 'voice-memo.transcript.v1', payload });
  const base =
    typeof location !== 'undefined'
      ? location.origin + location.pathname
      : 'https://shippie.app/run/voice-memo/';
  const url = await buildShareUrl(blob, base);
  return { blob, url };
}

/** Convert a Memo to the share-ready surface. */
export function memoForShare(memo: Memo): MemoForShare {
  return {
    id: memo.id,
    title: memo.title,
    transcript: memo.transcript,
    language: memo.language,
    duration_s: memo.duration_s,
    recorded_at: memo.recorded_at,
    tags: [...memo.tags],
  };
}
