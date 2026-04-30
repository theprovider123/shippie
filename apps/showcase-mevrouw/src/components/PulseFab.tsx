import { useState } from 'react';
import type * as Y from 'yjs';
import { sendPulse } from '@/features/pulses/pulses-state.ts';
import { cn } from '@/lib/cn.ts';

interface Props {
  doc: Y.Doc;
  myDeviceId: string;
}

const QUICK_EMOJIS = ['💛', '🌙', '☕', '🌿', '✨', '🫠'] as const;

export function PulseFab({ doc, myDeviceId }: Props) {
  const [open, setOpen] = useState(false);
  const [flash, setFlash] = useState(false);

  function send(emoji: string | null) {
    sendPulse(doc, myDeviceId, emoji);
    setFlash(true);
    setOpen(false);
    setTimeout(() => setFlash(false), 600);
  }

  return (
    <>
      {open && (
        <button
          type="button"
          aria-hidden="true"
          className="fixed inset-0 z-30 bg-[var(--background)]/40 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}
      <div
        className="fixed right-4 z-40 flex flex-col items-end gap-3"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 5.5rem)' }}
      >
        {open && (
          <ul className="flex flex-col gap-2 mb-1">
            {QUICK_EMOJIS.map((e) => (
              <li key={e}>
                <button
                  type="button"
                  onClick={() => send(e)}
                  className="w-12 h-12 rounded-full bg-[var(--card)] border border-[var(--border)] flex items-center justify-center text-2xl hover:bg-[var(--forest-light)] active:scale-95 transition-all"
                  aria-label={`Send ${e}`}
                >
                  {e}
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            'w-14 h-14 rounded-full bg-[var(--gold)] text-[var(--background)] flex items-center justify-center text-2xl shadow-lg shadow-[var(--gold-glow)] active:scale-95 transition-transform',
            !open && 'fab-pulse',
            flash && 'animate-ping',
          )}
          aria-label={open ? 'Close pulse picker' : 'Send a pulse'}
        >
          ♡
        </button>
      </div>
    </>
  );
}
