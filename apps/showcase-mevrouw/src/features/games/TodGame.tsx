import { useState } from 'react';
import type * as Y from 'yjs';
import { Button } from '@/components/ui/button.tsx';
import {
  partnerOf,
  readCoupleMeta,
} from '@/features/couple/couple-state.ts';
import {
  clearTod,
  readTod,
  rollTod,
  type TodKind,
  type TodLevel,
} from './tod-state.ts';
import { useYjs } from '@/sync/useYjs.ts';
import { cn } from '@/lib/cn.ts';

interface Props {
  doc: Y.Doc;
  myDeviceId: string;
  onExit: () => void;
}

const HEARTS: Record<TodLevel, string> = {
  1: '🤍',
  2: '💛',
  3: '🌶',
};

const HEART_LABEL: Record<TodLevel, string> = {
  1: 'Soft',
  2: 'Warm',
  3: 'Spicy',
};

export function TodGame({ doc, myDeviceId, onExit }: Props) {
  const meta = useYjs(doc, readCoupleMeta);
  const rec = useYjs(doc, readTod);
  const partner = partnerOf(meta, myDeviceId);

  const [level, setLevel] = useState<TodLevel | 0>(0);
  const [kind, setKind] = useState<TodKind | 'either'>('either');

  const cur = rec.current;
  const rolledByMe = cur && cur.rolledBy === myDeviceId;

  function roll() {
    rollTod(doc, myDeviceId, {
      ...(level !== 0 ? { level } : {}),
      ...(kind !== 'either' ? { kind } : {}),
    });
  }

  return (
    <div className="flex flex-col gap-4 px-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onExit}>
          ← Games
        </Button>
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
          Truth or Dare
        </span>
      </div>

      <header className="flex flex-col gap-1.5 px-1">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--gold)]">
          Roll one.
        </p>
        <h1 className="font-serif text-3xl leading-tight tracking-tight">
          Both phones see the same prompt.
        </h1>
      </header>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 flex flex-col gap-3">
        <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--gold)]">
          Heat
        </p>
        <div className="flex gap-2">
          {([0, 1, 2, 3] as const).map((lv) => (
            <button
              key={lv}
              type="button"
              onClick={() => setLevel(lv)}
              className={cn(
                'flex-1 rounded-xl border px-3 py-2 text-xs font-mono uppercase tracking-wider',
                level === lv
                  ? 'border-[var(--gold)] bg-[var(--gold-wash)] text-[var(--foreground)]'
                  : 'border-[var(--border)] text-[var(--muted-foreground)]',
              )}
            >
              {lv === 0 ? 'Any' : `${HEARTS[lv]} ${HEART_LABEL[lv]}`}
            </button>
          ))}
        </div>

        <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--gold)] mt-1">
          Kind
        </p>
        <div className="flex gap-2">
          {(['either', 'truth', 'dare'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={cn(
                'flex-1 rounded-xl border px-3 py-2 text-xs font-mono uppercase tracking-wider',
                kind === k
                  ? 'border-[var(--gold)] bg-[var(--gold-wash)] text-[var(--foreground)]'
                  : 'border-[var(--border)] text-[var(--muted-foreground)]',
              )}
            >
              {k}
            </button>
          ))}
        </div>

        <Button onClick={roll} className="self-stretch">
          {cur ? 'Roll again' : 'Roll'}
        </Button>
      </section>

      {cur && (
        <section className="rounded-2xl border border-[var(--gold)] bg-[var(--gold-wash)] p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--gold)]">
              {cur.kind === 'truth' ? 'Truth' : 'Dare'} · {HEARTS[cur.level]}{' '}
              {HEART_LABEL[cur.level]}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
              {cur.for === 'me'
                ? rolledByMe
                  ? 'for you'
                  : `for ${partner?.display_name ?? 'them'}`
                : cur.for === 'them'
                  ? rolledByMe
                    ? `for ${partner?.display_name ?? 'them'}`
                    : 'for you'
                  : 'for both'}
            </span>
          </div>
          <p className="font-serif text-2xl leading-snug">{cur.text}</p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => clearTod(doc)}>
              Clear
            </Button>
            <Button size="sm" onClick={roll}>
              Re-roll →
            </Button>
          </div>
        </section>
      )}

      {!cur && (
        <p className="text-xs text-[var(--muted-foreground)] text-center px-4">
          Pick a heat level and roll. Whatever lands, both phones see it. No
          chickening out — but you can always re-roll together.
        </p>
      )}

      {rec.history.length > 0 && (
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 flex flex-col gap-2">
          <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--gold)]">
            Recent
          </p>
          <ul className="flex flex-col gap-1.5">
            {rec.history
              .slice(-6)
              .reverse()
              .map((r) => (
                <li
                  key={r.id + r.rolledAt}
                  className="text-xs text-[var(--muted-foreground)] flex gap-2"
                >
                  <span className="font-mono">{HEARTS[r.level]}</span>
                  <span className="truncate">{r.text}</span>
                </li>
              ))}
          </ul>
        </section>
      )}
    </div>
  );
}
