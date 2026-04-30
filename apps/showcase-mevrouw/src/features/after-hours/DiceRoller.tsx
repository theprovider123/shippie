import type * as Y from 'yjs';
import { Button } from '@/components/ui/button.tsx';
import { clearDice, readDice, rollDice } from './dice-state.ts';
import { useYjs } from '@/sync/useYjs.ts';

interface Props {
  doc: Y.Doc;
  myDeviceId: string;
}

export function DiceRoller({ doc, myDeviceId }: Props) {
  const state = useYjs(doc, readDice);
  const cur = state.current;
  const rolledByMe = cur && cur.rolledBy === myDeviceId;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--gold)]">
          Sex dice
        </p>
        <span className="font-mono text-[10px] text-[var(--muted-foreground)]">
          Three dice. One roll. Both phones.
        </span>
      </div>

      {cur ? (
        <div className="rounded-xl border border-[var(--gold)] bg-[var(--gold-wash)] p-4 flex flex-col gap-3">
          <Die label="Place" value={cur.location} />
          <Die label="Position" value={cur.position} />
          <Die label="Twist" value={cur.extra} />
          <p className="font-mono text-[9px] uppercase tracking-wider text-[var(--muted-foreground)]">
            Rolled by {rolledByMe ? 'you' : 'them'} · {new Date(cur.rolledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => clearDice(doc)}>
              Clear
            </Button>
            <Button size="sm" onClick={() => rollDice(doc, myDeviceId)}>
              Re-roll →
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-6 flex flex-col items-center gap-3">
          <span className="font-serif text-3xl">🎲 🎲 🎲</span>
          <p className="text-sm text-[var(--muted-foreground)] text-center">
            Tap to roll. Both phones see the same three dice.
          </p>
          <Button onClick={() => rollDice(doc, myDeviceId)}>Roll the dice</Button>
        </div>
      )}

      {state.history.length > 1 && (
        <div className="rounded-xl border border-[var(--border)] p-3 flex flex-col gap-1.5">
          <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--gold)]">
            Last few
          </p>
          <ul className="flex flex-col gap-1">
            {state.history
              .slice(-5, -1)
              .reverse()
              .map((r) => (
                <li
                  key={r.rolledAt}
                  className="text-[11px] text-[var(--muted-foreground)] truncate"
                >
                  {r.location} · {r.position} · {r.extra}
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Die({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="font-mono text-[9px] uppercase tracking-wider text-[var(--muted-foreground)]">
        {label}
      </p>
      <p className="font-serif text-xl leading-snug">{value}</p>
    </div>
  );
}
