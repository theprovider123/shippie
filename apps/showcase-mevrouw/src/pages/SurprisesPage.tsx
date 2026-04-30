import { useState } from 'react';
import type * as Y from 'yjs';
import { ScreenHeader } from '@/components/ScreenHeader.tsx';
import { Button } from '@/components/ui/button.tsx';
import { VoiceRecorder } from '@/components/VoiceRecorder.tsx';
import {
  partnerOf,
  readCoupleMeta,
} from '@/features/couple/couple-state.ts';
import {
  addSurprise,
  deleteSurprise,
  markSurpriseRead,
  readSurprises,
  type SurpriseKind,
  type UnlockMode,
} from '@/features/surprises/surprises-state.ts';
import { useYjs } from '@/sync/useYjs.ts';
import { isSurpriseUnlocked } from '@/lib/surprises.ts';
import { cn } from '@/lib/cn.ts';
import { formatDateLong, relativePast } from '@/lib/dates.ts';

interface Props {
  doc: Y.Doc;
  myDeviceId: string;
}

export function SurprisesPage({ doc, myDeviceId }: Props) {
  const meta = useYjs(doc, readCoupleMeta);
  const all = useYjs(doc, readSurprises);
  const partner = partnerOf(meta, myDeviceId);

  const [composing, setComposing] = useState(false);

  const received = all.filter((s) => s.author_device !== myDeviceId);
  const sent = all.filter((s) => s.author_device === myDeviceId);

  return (
    <div className="flex flex-col gap-4 px-4">
      <ScreenHeader
        eyebrow="Surprises"
        title="Sealed by you, opened by them."
        lede="Pick a moment. Sit on it. Let them find it later."
        right={
          <Button size="sm" onClick={() => setComposing(true)}>
            + Surprise
          </Button>
        }
      />

      <h2 className="font-serif text-xl mt-2">For you</h2>
      <ul className="flex flex-col gap-2">
        {received.length === 0 && (
          <li className="text-[var(--muted-foreground)] text-sm">
            Nothing waiting from {partner?.display_name ?? 'them'} — yet.
          </li>
        )}
        {received.map((s) => (
          <SurpriseRow
            key={s.id}
            s={s}
            unlocked={isSurpriseUnlocked(s, meta.next_visit_date)}
            isMine={false}
            partnerName={partner?.display_name ?? 'them'}
            onOpen={() => markSurpriseRead(doc, s.id)}
            onDelete={() => deleteSurprise(doc, s.id)}
          />
        ))}
      </ul>

      <h2 className="font-serif text-xl mt-4">From you</h2>
      <ul className="flex flex-col gap-2">
        {sent.length === 0 && (
          <li className="text-[var(--muted-foreground)] text-sm">No surprises sent.</li>
        )}
        {sent.map((s) => (
          <SurpriseRow
            key={s.id}
            s={s}
            unlocked={isSurpriseUnlocked(s, meta.next_visit_date)}
            isMine
            partnerName={partner?.display_name ?? 'them'}
            onDelete={() => deleteSurprise(doc, s.id)}
          />
        ))}
      </ul>

      {composing && (
        <SurpriseComposer
          doc={doc}
          myDeviceId={myDeviceId}
          partnerDeviceId={partner?.device_id ?? null}
          onClose={() => setComposing(false)}
        />
      )}
    </div>
  );
}

function SurpriseRow({
  s,
  unlocked,
  isMine,
  partnerName,
  onOpen,
  onDelete,
}: {
  s: ReturnType<typeof readSurprises>[number];
  unlocked: boolean;
  isMine: boolean;
  partnerName: string;
  onOpen?: (() => void) | undefined;
  onDelete: () => void;
}) {
  const sealed = !unlocked;
  return (
    <li
      className={cn(
        'rounded-2xl p-4 border bg-[var(--card)] flex flex-col gap-2',
        sealed && !isMine ? 'border-[var(--gold-glow)] sealed-sheen' : 'border-[var(--border)]',
        unlocked && !s.read_at && !isMine && 'border-[var(--gold)]',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
          {sealed ? 'Sealed' : unlocked ? 'Open' : 'Sealed'} ·{' '}
          {s.unlock_mode === 'at_next_visit'
            ? 'next visit'
            : s.deliver_at
              ? formatDateLong(s.deliver_at)
              : ''}
        </span>
        <button
          type="button"
          onClick={onDelete}
          aria-label="Delete"
          className="text-[var(--muted-foreground)] hover:text-[var(--destructive)] text-sm"
        >
          ×
        </button>
      </div>
      {unlocked ? (
        <SurpriseBody s={s} onOpen={onOpen} isMine={isMine} />
      ) : (
        <p className="font-serif text-base text-[var(--muted-foreground)] italic">
          {isMine ? 'You sealed this for them.' : `From ${partnerName}. Sealed.`}
        </p>
      )}
      <p className="text-[10px] font-mono text-[var(--muted-foreground)]">
        {relativePast(s.created_at)}
      </p>
    </li>
  );
}

function SurpriseBody({
  s,
  isMine,
  onOpen,
}: {
  s: ReturnType<typeof readSurprises>[number];
  isMine: boolean;
  onOpen?: (() => void) | undefined;
}) {
  if (s.kind === 'image') {
    return (
      <div className="flex flex-col gap-2">
        <img
          src={s.body}
          alt=""
          className="w-full max-h-80 object-cover rounded-xl"
          onClick={!isMine && !s.read_at ? onOpen : undefined}
        />
      </div>
    );
  }
  if (s.kind === 'audio') {
    return (
      <audio
        controls
        src={s.body}
        onPlay={!isMine && !s.read_at ? onOpen : undefined}
        className="w-full"
      />
    );
  }
  return (
    <p
      className="font-serif text-base whitespace-pre-wrap"
      onClick={!isMine && !s.read_at ? onOpen : undefined}
    >
      {s.body}
    </p>
  );
}

function SurpriseComposer({
  doc,
  myDeviceId,
  partnerDeviceId,
  onClose,
}: {
  doc: Y.Doc;
  myDeviceId: string;
  partnerDeviceId: string | null;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<SurpriseKind>('text');
  const [body, setBody] = useState('');
  const [unlockMode, setUnlockMode] = useState<UnlockMode>('at_time');
  const [deliverAt, setDeliverAt] = useState('');

  const canSave =
    body.trim().length > 0 && (unlockMode === 'at_next_visit' || deliverAt.length > 0);

  function save() {
    if (!canSave) return;
    addSurprise(doc, myDeviceId, {
      recipient_device: partnerDeviceId,
      kind,
      body: body.trim(),
      unlock_mode: unlockMode,
      deliver_at: unlockMode === 'at_time' ? new Date(deliverAt).toISOString() : null,
    });
    onClose();
  }

  function onPickImage(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      setBody(typeof reader.result === 'string' ? reader.result : '');
      setKind('image');
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="fixed inset-0 z-50 bg-[var(--background)]/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
      <div className="w-full max-w-md bg-[var(--card)] border border-[var(--border)] rounded-3xl p-5 flex flex-col gap-3">
        <h3 className="font-serif text-xl">A surprise for them</h3>

        <div className="flex gap-2">
          {(['text', 'image', 'audio'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setKind(k);
                if (k !== kind) setBody('');
              }}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-mono uppercase tracking-wider border',
                kind === k
                  ? 'bg-[var(--gold)] text-[var(--background)] border-[var(--gold)]'
                  : 'bg-transparent border-[var(--border)]',
              )}
            >
              {k}
            </button>
          ))}
        </div>

        {kind === 'text' && (
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            placeholder="What would mean something to them later?"
            className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm font-serif focus:outline-none focus:border-[var(--gold)]"
            autoFocus
          />
        )}
        {kind === 'image' && (
          <div className="flex flex-col gap-2">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onPickImage(f);
              }}
              className="text-xs"
            />
            {body && <img src={body} alt="" className="w-full max-h-60 object-cover rounded-lg" />}
          </div>
        )}
        {kind === 'audio' && (
          <div className="flex flex-col gap-2">
            <VoiceRecorder onRecorded={(dataUrl) => setBody(dataUrl)} maxSeconds={120} />
            {body && (
              <>
                <audio controls src={body} className="w-full" />
                <button
                  type="button"
                  onClick={() => setBody('')}
                  className="text-xs text-[var(--muted-foreground)] self-start hover:text-[var(--destructive)]"
                >
                  re-record
                </button>
              </>
            )}
          </div>
        )}

        <fieldset className="flex flex-col gap-2">
          <legend className="text-[11px] font-mono uppercase tracking-wider text-[var(--muted-foreground)]">
            Opens
          </legend>
          <div className="flex gap-2">
            {(['at_time', 'at_next_visit'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setUnlockMode(m)}
                className={cn(
                  'flex-1 px-3 py-1.5 rounded-lg text-xs font-mono uppercase tracking-wider border',
                  unlockMode === m
                    ? 'bg-[var(--gold)] text-[var(--background)] border-[var(--gold)]'
                    : 'bg-transparent border-[var(--border)]',
                )}
              >
                {m === 'at_time' ? 'on date' : 'next visit'}
              </button>
            ))}
          </div>
          {unlockMode === 'at_time' && (
            <input
              type="datetime-local"
              value={deliverAt}
              onChange={(e) => setDeliverAt(e.target.value)}
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--gold)]"
            />
          )}
        </fieldset>

        <div className="flex justify-end gap-2 mt-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!canSave} onClick={save}>
            Seal it
          </Button>
        </div>
      </div>
    </div>
  );
}
