import { useState } from 'react';
import type * as Y from 'yjs';
import { Button } from '@/components/ui/button.tsx';
import {
  partnerOf,
  readCoupleMeta,
} from '@/features/couple/couple-state.ts';
import {
  addRound,
  deleteRound,
  guess,
  readRounds,
  reveal,
  streakOf,
  type Idx,
  type TtolRound,
} from './ttol-state.ts';
import { useYjs } from '@/sync/useYjs.ts';
import { cn } from '@/lib/cn.ts';
import { relativePast } from '@/lib/dates.ts';

interface Props {
  doc: Y.Doc;
  myDeviceId: string;
  onExit: () => void;
}

export function TtolGame({ doc, myDeviceId, onExit }: Props) {
  const meta = useYjs(doc, readCoupleMeta);
  const rounds = useYjs(doc, readRounds);
  const partner = partnerOf(meta, myDeviceId);
  const [composing, setComposing] = useState(false);

  const myStreak = streakOf(rounds, myDeviceId);
  const theirStreak = partner ? streakOf(rounds, partner.device_id) : { wins: 0, losses: 0 };

  return (
    <div className="flex flex-col gap-4 px-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onExit}>
          ← Games
        </Button>
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
          you {myStreak.wins}–{myStreak.losses} · {partner?.display_name ?? 'them'}{' '}
          {theirStreak.wins}–{theirStreak.losses}
        </span>
      </div>

      <header className="flex flex-col gap-1.5 px-1">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--gold)]">
          Two truths, one lie
        </p>
        <h1 className="font-serif text-3xl leading-tight tracking-tight">
          Catch them out.
        </h1>
      </header>

      {!composing && (
        <Button onClick={() => setComposing(true)}>+ New round</Button>
      )}

      {composing && (
        <Composer
          myDeviceId={myDeviceId}
          onSave={(stmts, lie) => {
            addRound(doc, myDeviceId, stmts, lie);
            setComposing(false);
          }}
          onCancel={() => setComposing(false)}
        />
      )}

      <ul className="flex flex-col gap-3">
        {rounds.length === 0 && !composing && (
          <li className="text-[var(--muted-foreground)] text-sm">
            No rounds yet. Write three things — two true, one false.
          </li>
        )}
        {rounds.map((r) => (
          <RoundCard
            key={r.id}
            r={r}
            myDeviceId={myDeviceId}
            partnerName={partner?.display_name ?? 'them'}
            onGuess={(idx) => guess(doc, r.id, myDeviceId, idx)}
            onReveal={() => reveal(doc, r.id)}
            onDelete={() => deleteRound(doc, r.id)}
          />
        ))}
      </ul>
    </div>
  );
}

function Composer({
  onSave,
  onCancel,
}: {
  myDeviceId: string;
  onSave: (statements: [string, string, string], lieIndex: Idx) => void;
  onCancel: () => void;
}) {
  const [s, setS] = useState<[string, string, string]>(['', '', '']);
  const [lie, setLie] = useState<Idx>(0);
  const ready = s.every((x) => x.trim().length > 0);

  return (
    <div className="rounded-2xl border border-[var(--gold-glow)] bg-[var(--card)] p-4 flex flex-col gap-3">
      <p className="text-sm text-[var(--muted-foreground)]">
        Three statements. Pick which is the lie. They have to guess it.
      </p>
      {([0, 1, 2] as const).map((i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--muted-foreground)]">
              #{i + 1}
            </span>
            <button
              type="button"
              onClick={() => setLie(i)}
              className={cn(
                'text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-md border',
                lie === i
                  ? 'bg-[var(--gold)] text-[var(--background)] border-[var(--gold)]'
                  : 'bg-transparent text-[var(--muted-foreground)] border-[var(--border)]',
              )}
            >
              {lie === i ? '✓ this is the lie' : 'mark as lie'}
            </button>
          </div>
          <input
            type="text"
            value={s[i]}
            onChange={(e) => setS((arr) => arr.map((x, j) => (j === i ? e.target.value : x)) as [string, string, string])}
            className="bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--gold)]"
            placeholder={
              i === 0
                ? 'Something true about you'
                : i === 1
                  ? 'Another truth'
                  : 'A plausible lie'
            }
          />
        </div>
      ))}
      <div className="flex justify-end gap-2 mt-1">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button disabled={!ready} onClick={() => onSave(s, lie)}>
          Submit round
        </Button>
      </div>
    </div>
  );
}

function RoundCard({
  r,
  myDeviceId,
  partnerName,
  onGuess,
  onReveal,
  onDelete,
}: {
  r: TtolRound;
  myDeviceId: string;
  partnerName: string;
  onGuess: (idx: Idx) => void;
  onReveal: () => void;
  onDelete: () => void;
}) {
  const fromMe = r.author_device === myDeviceId;
  const myGuess = r.guesses[myDeviceId];
  const revealed = !!r.revealed_at;

  return (
    <article
      className={cn(
        'rounded-2xl border bg-[var(--card)] p-4 flex flex-col gap-3',
        fromMe ? 'border-[var(--border)]' : 'border-[var(--gold-glow)]',
      )}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
          {fromMe ? 'You wrote' : `From ${partnerName}`} · {relativePast(r.created_at)}
        </span>
        <button
          type="button"
          onClick={onDelete}
          className="text-[var(--muted-foreground)] hover:text-[var(--destructive)] text-sm"
          aria-label="Delete round"
        >
          ×
        </button>
      </div>

      <ol className="flex flex-col gap-2">
        {r.statements.map((stmt, i) => {
          const isLie = i === r.lie_index;
          const iPicked = myGuess === i;
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => !fromMe && myGuess === undefined && onGuess(i as Idx)}
                disabled={fromMe || myGuess !== undefined}
                className={cn(
                  'w-full text-left p-3 rounded-xl border bg-[var(--background)] flex items-start gap-3',
                  iPicked && !revealed && 'border-[var(--gold)]',
                  revealed && isLie && 'border-[var(--destructive)] bg-[var(--destructive)]/10',
                  revealed && !isLie && 'border-[var(--gold-glow)]',
                  !iPicked && !revealed && 'border-[var(--border)] hover:border-[var(--gold-glow)]',
                  !fromMe && myGuess === undefined && 'cursor-pointer',
                  (fromMe || myGuess !== undefined) && 'cursor-default',
                )}
              >
                <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] mt-0.5">
                  {i + 1}
                </span>
                <span className="font-serif flex-1">{stmt}</span>
                {revealed && isLie && (
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--destructive)]">
                    lie
                  </span>
                )}
                {iPicked && !revealed && (
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--gold)]">
                    your guess
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>

      {!fromMe && myGuess === undefined && !revealed && (
        <p className="text-xs text-[var(--muted-foreground)]">Tap one to guess.</p>
      )}
      {!fromMe && myGuess !== undefined && !revealed && (
        <p className="text-xs text-[var(--muted-foreground)]">
          You guessed #{myGuess + 1}. Waiting on {partnerName} to reveal.
        </p>
      )}
      {fromMe && !revealed && (
        <Button size="sm" onClick={onReveal}>
          Reveal
        </Button>
      )}
      {revealed && !fromMe && myGuess !== undefined && (
        <p className={cn(
          'text-xs font-mono uppercase tracking-wider',
          myGuess === r.lie_index ? 'text-[var(--gold)]' : 'text-[var(--destructive)]',
        )}>
          {myGuess === r.lie_index ? '✓ you caught it' : '✗ you fell for it'}
        </p>
      )}
    </article>
  );
}
