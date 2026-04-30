import { useState } from 'react';
import type * as Y from 'yjs';
import { ScreenHeader } from '@/components/ScreenHeader.tsx';
import { Button } from '@/components/ui/button.tsx';
import {
  partnerOf,
  readCoupleMeta,
} from '@/features/couple/couple-state.ts';
import {
  addGift,
  deleteGift,
  isUnlocked,
  openGift as markGiftOpened,
  readGifts,
  type GiftLetterFields,
} from '@/features/gifts/gifts-state.ts';
import { useYjs, useTick } from '@/sync/useYjs.ts';
import { cn } from '@/lib/cn.ts';
import { formatDateLong, formatDateShort } from '@/lib/dates.ts';

interface Props {
  doc: Y.Doc;
  myDeviceId: string;
}

export function GiftsPage({ doc, myDeviceId }: Props) {
  const meta = useYjs(doc, readCoupleMeta);
  const gifts = useYjs(doc, readGifts);
  useTick(60_000); // re-render once a minute so countdowns update
  const partner = partnerOf(meta, myDeviceId);

  const [composing, setComposing] = useState(false);

  return (
    <div className="flex flex-col gap-4 px-4">
      <ScreenHeader
        eyebrow="Gift letters"
        title="Sealed and open."
        lede={
          gifts.length === 0
            ? 'No letters yet. Write the first one.'
            : `${gifts.length} letter${gifts.length === 1 ? '' : 's'} between you.`
        }
        right={
          <Button size="sm" onClick={() => setComposing(true)}>
            + Letter
          </Button>
        }
      />

      <ul className="flex flex-col gap-3">
        {gifts.map((gift) => (
          <GiftCard
            key={gift.id}
            gift={gift}
            myDeviceId={myDeviceId}
            partnerName={partner?.display_name ?? 'them'}
            onOpen={() => markGiftOpened(doc, gift.id)}
            onDelete={() => deleteGift(doc, gift.id)}
          />
        ))}
      </ul>

      {composing && (
        <ComposeGift
          doc={doc}
          myDeviceId={myDeviceId}
          partnerDeviceId={partner?.device_id ?? null}
          anniversary={meta.anniversary_date}
          onClose={() => setComposing(false)}
        />
      )}
    </div>
  );
}

function GiftCard({
  gift,
  myDeviceId,
  partnerName,
  onOpen,
  onDelete,
}: {
  gift: GiftLetterFields;
  myDeviceId: string;
  partnerName: string;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const unlocked = isUnlocked(gift);
  const fromMe = gift.authorDevice === myDeviceId;
  const forMe = gift.recipientDevice === myDeviceId || gift.recipientDevice === null;
  const canOpen = unlocked && forMe && !gift.openedAt;

  if (!unlocked) {
    return (
      <article
        className={cn(
          'rounded-2xl p-5 border bg-[var(--card)] flex flex-col gap-2 sealed-sheen',
          fromMe ? 'border-[var(--border)]' : 'border-[var(--gold-glow)]',
        )}
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
          {fromMe ? 'You wrote' : `From ${partnerName}`} · sealed
        </span>
        <h2 className="font-serif text-xl">{gift.headline || 'A letter'}</h2>
        <p className="text-[var(--muted-foreground)] text-sm">
          Opens {formatDateLong(gift.unlockAt)}
        </p>
      </article>
    );
  }

  return (
    <article
      className={cn(
        'rounded-2xl p-5 border bg-[var(--card)] flex flex-col gap-3',
        canOpen ? 'border-[var(--gold)]' : 'border-[var(--border)]',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--gold)]">
          {fromMe ? 'You wrote' : `From ${partnerName}`} ·{' '}
          {gift.openedAt ? 'opened' : 'unsealed'}
        </span>
        <button
          type="button"
          onClick={onDelete}
          className="text-[var(--muted-foreground)] hover:text-[var(--destructive)] text-sm"
          aria-label="Delete"
        >
          ×
        </button>
      </div>
      {gift.headline && <h2 className="font-serif text-2xl">{gift.headline}</h2>}
      <p className="font-serif text-base leading-relaxed whitespace-pre-wrap">
        {gift.body}
      </p>
      {canOpen && (
        <Button onClick={onOpen} size="sm" className="self-start">
          Mark as opened
        </Button>
      )}
      <p className="text-xs font-mono text-[var(--muted-foreground)]">
        {gift.openedAt ? `Opened ${formatDateShort(gift.openedAt)}` : null}
      </p>
    </article>
  );
}

function ComposeGift({
  doc,
  myDeviceId,
  partnerDeviceId,
  anniversary,
  onClose,
}: {
  doc: Y.Doc;
  myDeviceId: string;
  partnerDeviceId: string | null;
  anniversary: string | null;
  onClose: () => void;
}) {
  const [headline, setHeadline] = useState('');
  const [body, setBody] = useState('');
  const [unlockAt, setUnlockAt] = useState(defaultUnlockLocal(anniversary));

  const canSeal = body.trim().length > 0 && unlockAt.length > 0;

  function save() {
    if (!canSeal) return;
    addGift(doc, myDeviceId, {
      recipientDevice: partnerDeviceId,
      headline: headline.trim(),
      body: body.trim(),
      unlockAt: new Date(unlockAt).toISOString(),
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-[var(--background)]/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
      <div className="w-full max-w-md bg-[var(--card)] border border-[var(--border)] rounded-3xl p-5 flex flex-col gap-3">
        <h3 className="font-serif text-xl">Seal a letter</h3>
        <input
          type="text"
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          placeholder="Headline (optional)"
          className="bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--gold)]"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={10}
          placeholder="Write what you want them to read on that day."
          className="bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm font-serif focus:outline-none focus:border-[var(--gold)] min-h-[180px]"
        />
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--muted-foreground)]">
            Opens at
          </span>
          <input
            type="datetime-local"
            value={unlockAt}
            onChange={(e) => setUnlockAt(e.target.value)}
            className="bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--gold)]"
          />
        </label>
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!canSeal} onClick={save}>
            Seal it
          </Button>
        </div>
      </div>
    </div>
  );
}

function defaultUnlockLocal(anniversary: string | null): string {
  if (anniversary) {
    const ann = new Date(anniversary);
    const now = new Date();
    let year = now.getFullYear();
    const candidate = new Date(year, ann.getMonth(), ann.getDate(), 9, 0);
    if (candidate.getTime() < now.getTime()) year++;
    const next = new Date(year, ann.getMonth(), ann.getDate(), 9, 0);
    return localDatetime(next);
  }
  // default: next May 9 09:00
  const now = new Date();
  const year = now > new Date(`${now.getFullYear()}-05-09T09:00`) ? now.getFullYear() + 1 : now.getFullYear();
  return `${year}-05-09T09:00`;
}

function localDatetime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
