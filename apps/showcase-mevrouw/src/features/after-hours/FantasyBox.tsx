import { useState } from 'react';
import type * as Y from 'yjs';
import { Button } from '@/components/ui/button.tsx';
import {
  addWish,
  clearOpened,
  deleteWish,
  pendingTapFrom,
  readFantasy,
  TAP_WINDOW_MS,
  tapToOpen,
} from './fantasy-state.ts';
import { useYjs } from '@/sync/useYjs.ts';
import { useTick } from '@/lib/useTick.ts';
import { cn } from '@/lib/cn.ts';

interface Props {
  doc: Y.Doc;
  myDeviceId: string;
  partnerId: string | null;
}

export function FantasyBox({ doc, myDeviceId, partnerId }: Props) {
  const state = useYjs(doc, readFantasy);
  const now = useTick(1_000);
  const [draft, setDraft] = useState('');
  const [openedNow, setOpenedNow] = useState<string | null>(null);

  const myWishes = state.wishes.filter((w) => w.author === myDeviceId);
  const partnerHasWishes = state.wishes.some((w) => w.author === partnerId && !w.openedAt);
  const partnerTapping = pendingTapFrom(state, partnerId, now);
  const myTapTs = state.tap.byDevice[myDeviceId];
  const myTapPending = myTapTs !== undefined && now - myTapTs < TAP_WINDOW_MS;
  const opened = state.tap.opened;
  const openedWish = opened ? state.wishes.find((w) => w.id === opened.wishId) ?? null : null;

  function handleTap() {
    const result = tapToOpen(doc, myDeviceId, partnerId);
    if (result) {
      setOpenedNow(result.id);
    }
  }

  function submitWish() {
    if (draft.trim()) {
      addWish(doc, myDeviceId, draft.trim());
      setDraft('');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--gold)]">
          Fantasy box
        </p>
        <span className="font-mono text-[10px] text-[var(--muted-foreground)]">
          {myWishes.length} sealed
        </span>
      </div>

      {/* Add wish */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 flex flex-col gap-2">
        <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
          Sealed for them
        </p>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          placeholder="Write something you want, sealed until you both tap together."
          className="bg-transparent border-0 resize-none focus:outline-none font-serif text-sm leading-relaxed"
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={submitWish} disabled={!draft.trim()}>
            Seal it
          </Button>
        </div>
      </div>

      {/* Tap to open */}
      <div
        className={cn(
          'rounded-xl border p-4 flex flex-col gap-3 items-center transition-colors',
          partnerTapping
            ? 'border-[var(--gold)] bg-[var(--gold-wash)]'
            : 'border-[var(--border)] bg-[var(--background)]',
        )}
      >
        <p className="font-serif text-lg text-center">
          {partnerTapping
            ? "They're tapping. Tap with them."
            : myTapPending
              ? 'Waiting for them…'
              : 'Tap together to open one.'}
        </p>
        <p className="text-[11px] text-[var(--muted-foreground)] text-center max-w-[28ch]">
          Both phones must tap within 30 seconds. A random sealed wish from the
          other person opens.
        </p>
        <button
          type="button"
          onClick={handleTap}
          disabled={!partnerId || (!partnerHasWishes && !partnerTapping)}
          className={cn(
            'h-20 w-20 rounded-full border-2 flex items-center justify-center font-serif text-2xl transition-all active:scale-95',
            myTapPending || partnerTapping
              ? 'border-[var(--gold)] bg-[var(--gold)] text-[var(--background)] animate-pulse'
              : 'border-[var(--gold)] bg-transparent text-[var(--gold)] hover:bg-[var(--gold-wash)]',
            (!partnerId || (!partnerHasWishes && !partnerTapping)) && 'opacity-40',
          )}
        >
          tap
        </button>
        {!partnerHasWishes && partnerId && (
          <p className="text-[11px] text-[var(--muted-foreground)] text-center">
            They haven't sealed a wish yet.
          </p>
        )}
      </div>

      {/* Opened display */}
      {openedWish && openedWish.author !== myDeviceId && (
        <div className="rounded-xl border border-[var(--gold)] bg-[var(--gold-wash)] p-4 flex flex-col gap-2">
          <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--gold)]">
            Just opened {openedNow === openedWish.id ? '(by you)' : ''}
          </p>
          <p className="font-serif text-lg leading-snug">{openedWish.text}</p>
          <Button variant="ghost" size="sm" onClick={() => clearOpened(doc)} className="self-end">
            Close
          </Button>
        </div>
      )}

      {/* My wishes */}
      {myWishes.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] p-3 flex flex-col gap-2">
          <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--gold)]">
            Yours, sealed
          </p>
          <ul className="flex flex-col gap-1.5">
            {myWishes.map((w) => (
              <li
                key={w.id}
                className="flex items-start justify-between gap-2 text-[11px] text-[var(--muted-foreground)]"
              >
                <span className="flex-1 truncate font-serif text-sm">
                  {w.openedAt ? '✓ ' : '· '}
                  {w.openedAt ? <s>{w.text}</s> : w.text}
                </span>
                <button
                  type="button"
                  onClick={() => deleteWish(doc, myDeviceId, w.id)}
                  className="text-[10px] uppercase tracking-wider hover:text-[var(--destructive)]"
                >
                  delete
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
