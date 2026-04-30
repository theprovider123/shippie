import { useState } from 'react';
import type * as Y from 'yjs';
import { Button } from '@/components/ui/button.tsx';
import {
  mutualOverlap,
  progressFor,
  readYnm,
  setYnm,
  YNM_BANK,
  type YnmAnswer,
  type YnmItem,
} from './ynm-state.ts';
import { useYjs } from '@/sync/useYjs.ts';
import { cn } from '@/lib/cn.ts';

interface Props {
  doc: Y.Doc;
  myDeviceId: string;
  partnerId: string | null;
}

const CATEGORIES: ReadonlyArray<{ key: YnmItem['category']; label: string }> = [
  { key: 'sweet', label: 'Sweet' },
  { key: 'playful', label: 'Playful' },
  { key: 'spicy', label: 'Spicy' },
  { key: 'fantasy', label: 'Fantasy' },
];

export function YnmList({ doc, myDeviceId, partnerId }: Props) {
  const state = useYjs(doc, readYnm);
  const [mode, setMode] = useState<'answer' | 'overlap'>('answer');
  const [cat, setCat] = useState<YnmItem['category']>('sweet');

  const my = state.byDevice[myDeviceId] ?? {};
  const progress = progressFor(state, myDeviceId);
  const overlap = partnerId ? mutualOverlap(state, myDeviceId, partnerId) : { bothYes: [], bothMaybe: [] };
  const items = YNM_BANK.filter((i) => i.category === cat);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--gold)]">
          Yes / No / Maybe
        </p>
        <span className="font-mono text-[10px] text-[var(--muted-foreground)]">
          {progress.answered} / {progress.total}
        </span>
      </div>

      <div className="flex gap-2 -mx-1">
        <Tab active={mode === 'answer'} onClick={() => setMode('answer')}>
          Answer privately
        </Tab>
        <Tab active={mode === 'overlap'} onClick={() => setMode('overlap')}>
          Mutual {overlap.bothYes.length + overlap.bothMaybe.length > 0 ? `· ${overlap.bothYes.length + overlap.bothMaybe.length}` : ''}
        </Tab>
      </div>

      {mode === 'answer' && (
        <>
          <div className="flex gap-2 flex-wrap">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setCat(c.key)}
                className={cn(
                  'px-3 py-1 rounded-full text-[11px] font-mono uppercase tracking-wider border',
                  cat === c.key
                    ? 'border-[var(--gold)] bg-[var(--gold-wash)]'
                    : 'border-[var(--border)] text-[var(--muted-foreground)]',
                )}
              >
                {c.label}
              </button>
            ))}
          </div>

          <ul className="flex flex-col gap-2">
            {items.map((item) => {
              const ans = my[item.id];
              return (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-xl border border-[var(--border)] bg-[var(--background)]"
                >
                  <p className="font-serif text-sm leading-snug flex-1">{item.text}</p>
                  <div className="flex gap-1">
                    {(['yes', 'maybe', 'no'] as const).map((a) => (
                      <button
                        key={a}
                        type="button"
                        onClick={() => setYnm(doc, myDeviceId, item.id, ans === a ? null : a)}
                        className={cn(
                          'px-2 py-1 rounded-md text-[10px] font-mono uppercase tracking-wider border',
                          ans === a
                            ? answerColor(a)
                            : 'border-[var(--border)] text-[var(--muted-foreground)]',
                        )}
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {mode === 'overlap' && (
        <div className="flex flex-col gap-3">
          {!partnerId && (
            <p className="text-xs text-[var(--muted-foreground)]">
              Pair both phones to see mutual answers.
            </p>
          )}
          {partnerId && overlap.bothYes.length === 0 && overlap.bothMaybe.length === 0 && (
            <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">
              Nothing to reveal yet — keep answering. The list only shows
              what you BOTH said yes (or maybe) to. No one ever sees a
              one-sided answer.
            </p>
          )}
          {overlap.bothYes.length > 0 && (
            <Section title={`Both yes · ${overlap.bothYes.length}`} tone="gold">
              <ul className="flex flex-col gap-1.5">
                {overlap.bothYes.map((item) => (
                  <li key={item.id} className="font-serif text-sm">
                    · {item.text}
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {overlap.bothMaybe.length > 0 && (
            <Section title={`Both maybe (or one yes) · ${overlap.bothMaybe.length}`} tone="muted">
              <ul className="flex flex-col gap-1.5">
                {overlap.bothMaybe.map((item) => (
                  <li
                    key={item.id}
                    className="font-serif text-sm text-[var(--muted-foreground)]"
                  >
                    · {item.text}
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function answerColor(a: YnmAnswer): string {
  if (a === 'yes') return 'border-[var(--gold)] bg-[var(--gold)] text-[var(--background)]';
  if (a === 'maybe') return 'border-[var(--gold)] bg-[var(--gold-wash)] text-[var(--foreground)]';
  return 'border-[var(--border)] bg-[var(--muted)] text-[var(--muted-foreground)]';
}

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-3 py-1.5 rounded-lg text-xs font-mono uppercase tracking-wider border flex-1',
        active
          ? 'border-[var(--gold)] bg-[var(--gold-wash)] text-[var(--foreground)]'
          : 'border-[var(--border)] text-[var(--muted-foreground)]',
      )}
    >
      {children}
    </button>
  );
}

function Section({
  title,
  tone,
  children,
}: {
  title: string;
  tone: 'gold' | 'muted';
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border p-3',
        tone === 'gold' ? 'border-[var(--gold)] bg-[var(--gold-wash)]' : 'border-[var(--border)]',
      )}
    >
      <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--gold)] mb-1.5">
        {title}
      </p>
      {children}
    </div>
  );
}
