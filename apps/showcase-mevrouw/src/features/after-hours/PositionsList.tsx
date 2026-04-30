import { useState } from 'react';
import type * as Y from 'yjs';
import {
  bothTried,
  mutualWant,
  POSITIONS,
  readPositions,
  toggleTried,
  toggleWant,
  type Position,
} from './positions-state.ts';
import { useYjs } from '@/sync/useYjs.ts';
import { cn } from '@/lib/cn.ts';

interface Props {
  doc: Y.Doc;
  myDeviceId: string;
  partnerId: string | null;
}

const HEARTS: Record<1 | 2 | 3, string> = { 1: '🤍', 2: '💛', 3: '🌶' };

export function PositionsList({ doc, myDeviceId, partnerId }: Props) {
  const state = useYjs(doc, readPositions);
  const [filter, setFilter] = useState<'all' | 'mutual_want' | 'both_tried'>('all');

  const myTried = state.tried[myDeviceId] ?? {};
  const myWant = state.want[myDeviceId] ?? {};
  const partnerWant = partnerId ? state.want[partnerId] ?? {} : {};
  const mWant = partnerId ? mutualWant(state, myDeviceId, partnerId) : [];
  const bTried = partnerId ? bothTried(state, myDeviceId, partnerId) : [];

  let visible: Position[];
  if (filter === 'mutual_want') visible = mWant;
  else if (filter === 'both_tried') visible = bTried;
  else visible = [...POSITIONS];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--gold)]">
          Position library
        </p>
        <span className="font-mono text-[10px] text-[var(--muted-foreground)]">
          {Object.keys(myTried).length} tried · {Object.keys(myWant).length} want
        </span>
      </div>

      <div className="flex gap-1.5">
        <Pill active={filter === 'all'} onClick={() => setFilter('all')}>
          All
        </Pill>
        <Pill
          active={filter === 'mutual_want'}
          onClick={() => setFilter('mutual_want')}
          count={mWant.length}
        >
          Both want
        </Pill>
        <Pill
          active={filter === 'both_tried'}
          onClick={() => setFilter('both_tried')}
          count={bTried.length}
        >
          Both tried
        </Pill>
      </div>

      {visible.length === 0 && (
        <p className="text-xs text-[var(--muted-foreground)]">Nothing here yet.</p>
      )}

      <ul className="grid grid-cols-1 gap-2">
        {visible.map((p) => {
          const tried = !!myTried[p.id];
          const want = !!myWant[p.id];
          const partnerWants = !!partnerWant[p.id];
          return (
            <li
              key={p.id}
              className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 flex gap-3"
            >
              <svg
                viewBox="0 0 120 80"
                className="w-20 h-14 flex-shrink-0 text-[var(--gold)] opacity-70"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d={p.glyph} />
              </svg>
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-serif text-base truncate">{p.name}</p>
                  <span className="font-mono text-[10px] text-[var(--muted-foreground)]">
                    {HEARTS[p.level]}
                  </span>
                </div>
                <p className="text-[11px] text-[var(--muted-foreground)] leading-snug">
                  {p.description}
                </p>
                <div className="flex gap-1.5 mt-1">
                  <Toggle
                    on={tried}
                    onClick={() => toggleTried(doc, myDeviceId, p.id)}
                    label="Tried"
                  />
                  <Toggle
                    on={want}
                    onClick={() => toggleWant(doc, myDeviceId, p.id)}
                    label={want && partnerWants ? 'Want · they too' : 'Want'}
                    accent={want && partnerWants}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Pill({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-3 py-1 rounded-full text-[10px] font-mono uppercase tracking-wider border flex items-center gap-1',
        active
          ? 'border-[var(--gold)] bg-[var(--gold-wash)] text-[var(--foreground)]'
          : 'border-[var(--border)] text-[var(--muted-foreground)]',
      )}
    >
      <span>{children}</span>
      {count !== undefined && count > 0 && <span className="opacity-70">· {count}</span>}
    </button>
  );
}

function Toggle({
  on,
  onClick,
  label,
  accent = false,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-2 py-1 rounded-md text-[10px] font-mono uppercase tracking-wider border',
        on
          ? accent
            ? 'border-[var(--gold)] bg-[var(--gold)] text-[var(--background)]'
            : 'border-[var(--gold)] bg-[var(--gold-wash)] text-[var(--foreground)]'
          : 'border-[var(--border)] text-[var(--muted-foreground)]',
      )}
    >
      {label}
    </button>
  );
}
