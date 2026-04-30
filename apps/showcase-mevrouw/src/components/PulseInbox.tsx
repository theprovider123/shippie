/**
 * PulseInbox — when the partner has sent unread pulses, surface them
 * as a soft banner pinned to the top of the active screen. Tapping
 * marks them all seen.
 */
import { useEffect, useState } from 'react';
import type * as Y from 'yjs';
import {
  markPulsesSeen,
  readPulses,
  unseenFromPartner,
} from '@/features/pulses/pulses-state.ts';
import { useYjs } from '@/sync/useYjs.ts';
import { cn } from '@/lib/cn.ts';

interface Props {
  doc: Y.Doc;
  myDeviceId: string;
}

export function PulseInbox({ doc, myDeviceId }: Props) {
  const pulses = useYjs(doc, readPulses);
  const unseen = unseenFromPartner(pulses, myDeviceId);
  const [flash, setFlash] = useState(false);

  // Re-trigger the soft halo any time a new unseen pulse arrives.
  useEffect(() => {
    if (unseen.length === 0) return;
    setFlash(true);
    const id = window.setTimeout(() => setFlash(false), 900);
    return () => window.clearTimeout(id);
  }, [unseen.length]);

  if (unseen.length === 0) return null;

  const newest = unseen[0]!;
  const more = unseen.length - 1;

  return (
    <button
      type="button"
      onClick={() => markPulsesSeen(doc, myDeviceId)}
      aria-label={`${unseen.length} new pulse${unseen.length === 1 ? '' : 's'} from them — tap to clear`}
      className={cn(
        'fixed top-0 inset-x-0 z-30 mx-auto max-w-md w-full',
        'flex items-center justify-center gap-3 px-5 py-3',
        'bg-[var(--gold-wash)] border-b border-[var(--gold-glow)]',
        'text-[var(--foreground)] text-sm font-mono uppercase tracking-wider',
        'active:opacity-80 transition-opacity',
        flash && 'animate-pulse',
      )}
      style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}
    >
      <span className="text-2xl leading-none">{newest.emoji ?? '♡'}</span>
      <span className="text-[11px]">
        {unseen.length === 1
          ? 'one from them'
          : `${unseen.length} from them${more > 0 ? ` · newest ${newest.emoji ?? '♡'}` : ''}`}
      </span>
    </button>
  );
}
