import { useEffect, useState } from 'react';
import type * as Y from 'yjs';
import { ScreenHeader } from '@/components/ScreenHeader.tsx';
import { Button } from '@/components/ui/button.tsx';
import {
  partnerOf,
  readCoupleMeta,
} from '@/features/couple/couple-state.ts';
import {
  addGlimpse,
  deleteGlimpse,
  GLIMPSE_EXPIRY_HOURS,
  markGlimpseSeen,
  pruneExpired,
  readGlimpses,
  timeLeftMs,
  type Glimpse,
} from '@/features/glimpses/glimpses-state.ts';
import { useTick, useYjs } from '@/sync/useYjs.ts';
import { cn } from '@/lib/cn.ts';
import { relativePast } from '@/lib/dates.ts';

interface Props {
  doc: Y.Doc;
  myDeviceId: string;
}

export function GlimpsesPage({ doc, myDeviceId }: Props) {
  const meta = useYjs(doc, readCoupleMeta);
  const glimpses = useYjs(doc, readGlimpses);
  useTick(60_000); // tick once a minute so countdowns + auto-prune feel live
  const partner = partnerOf(meta, myDeviceId);

  // Prune expired on mount + on tick.
  useEffect(() => {
    pruneExpired(doc);
  }, [doc, glimpses.length]);

  const [composing, setComposing] = useState(false);

  return (
    <div className="flex flex-col gap-4 px-4">
      <ScreenHeader
        eyebrow="Glimpses"
        title="A photo that doesn't stay."
        lede={`Vanishes ${GLIMPSE_EXPIRY_HOURS}h after they see it.`}
        right={
          <Button size="sm" onClick={() => setComposing(true)}>
            + Glimpse
          </Button>
        }
      />

      {composing && (
        <Composer
          myDeviceId={myDeviceId}
          onSave={(dataUrl, caption) => {
            addGlimpse(doc, myDeviceId, dataUrl, caption);
            setComposing(false);
          }}
          onCancel={() => setComposing(false)}
        />
      )}

      <ul className="flex flex-col gap-3">
        {glimpses.length === 0 && !composing && (
          <li className="text-[var(--muted-foreground)] text-sm py-6 text-center">
            Nothing right now. Send the first.
          </li>
        )}
        {glimpses.map((g) => (
          <GlimpseCard
            key={g.id}
            g={g}
            myDeviceId={myDeviceId}
            partnerName={partner?.display_name ?? 'them'}
            onSeen={() => markGlimpseSeen(doc, g.id)}
            onDelete={() => deleteGlimpse(doc, g.id)}
          />
        ))}
      </ul>
    </div>
  );
}

function GlimpseCard({
  g,
  myDeviceId,
  partnerName,
  onSeen,
  onDelete,
}: {
  g: Glimpse;
  myDeviceId: string;
  partnerName: string;
  onSeen: () => void;
  onDelete: () => void;
}) {
  const fromMe = g.author_device === myDeviceId;
  const left = timeLeftMs(g);

  return (
    <article
      className={cn(
        'rounded-2xl border bg-[var(--card)] overflow-hidden',
        fromMe ? 'border-[var(--border)]' : 'border-[var(--gold-glow)]',
      )}
    >
      <button
        type="button"
        onClick={() => !fromMe && !g.seen_at && onSeen()}
        className="block w-full"
        disabled={fromMe || !!g.seen_at}
      >
        <img
          src={g.photo_data_url}
          alt={g.caption ?? ''}
          className={cn(
            'w-full max-h-[60vh] object-cover transition-all',
            !fromMe && !g.seen_at && 'blur-md',
          )}
        />
      </button>
      <div className="p-3 flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
            {fromMe ? 'You sent' : `From ${partnerName}`} · {relativePast(g.created_at)}
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
        {!fromMe && !g.seen_at && (
          <p className="text-xs text-[var(--gold)] font-mono uppercase tracking-wider">
            tap to reveal
          </p>
        )}
        {g.caption && <p className="font-serif text-base">{g.caption}</p>}
        {left !== null && (
          <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-foreground)]">
            vanishes in {formatLeft(left)}
          </p>
        )}
      </div>
    </article>
  );
}

function Composer({
  onSave,
  onCancel,
}: {
  myDeviceId: string;
  onSave: (dataUrl: string, caption: string | null) => void;
  onCancel: () => void;
}) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [caption, setCaption] = useState('');

  function pick(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setPhoto(reader.result);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="rounded-2xl border border-[var(--gold-glow)] bg-[var(--card)] p-4 flex flex-col gap-3">
      <input
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) pick(f);
        }}
        className="text-xs"
      />
      {photo && <img src={photo} alt="" className="w-full max-h-60 object-cover rounded-lg" />}
      <input
        type="text"
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        placeholder="A line, optional"
        className="bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--gold)]"
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button disabled={!photo} onClick={() => onSave(photo!, caption.trim() || null)}>
          Send
        </Button>
      </div>
    </div>
  );
}

function formatLeft(ms: number): string {
  if (ms <= 0) return 'now';
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  return `${h}h ${min % 60}m`;
}
