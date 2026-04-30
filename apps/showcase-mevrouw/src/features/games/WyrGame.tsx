import type * as Y from 'yjs';
import { Button } from '@/components/ui/button.tsx';
import {
  partnerOf,
  readCoupleMeta,
} from '@/features/couple/couple-state.ts';
import {
  answerWYR,
  bothAnswered,
  nextWYR,
  questionFor,
  readWYR,
  WYR_BANK,
  type Choice,
} from './wyr-state.ts';
import { useYjs } from '@/sync/useYjs.ts';
import { cn } from '@/lib/cn.ts';

interface Props {
  doc: Y.Doc;
  myDeviceId: string;
  onExit: () => void;
}

export function WyrGame({ doc, myDeviceId, onExit }: Props) {
  const meta = useYjs(doc, readCoupleMeta);
  const rec = useYjs(doc, readWYR);
  const partner = partnerOf(meta, myDeviceId);

  const q = questionFor(rec.current);
  const answersForQ = rec.answers[q.id] ?? {};
  const myChoice = answersForQ[myDeviceId];
  const partnerChoice = partner ? answersForQ[partner.device_id] : undefined;
  const reveal = bothAnswered(rec, myDeviceId, partner?.device_id ?? null);
  const idx = WYR_BANK.findIndex((x) => x.id === rec.current);

  return (
    <div className="flex flex-col gap-4 px-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onExit}>
          ← Games
        </Button>
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
          Round {idx + 1} / {WYR_BANK.length}
        </span>
      </div>

      <header className="flex flex-col gap-1.5 px-1">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--gold)]">
          Would you rather
        </p>
        <h1 className="font-serif text-3xl leading-tight tracking-tight">
          Pick one.
        </h1>
      </header>

      <ul className="flex flex-col gap-3">
        {(['a', 'b'] as const).map((side) => {
          const text = side === 'a' ? q.a : q.b;
          const iPicked = myChoice === side;
          const theyPicked = partnerChoice === side;
          const showAgree = reveal && iPicked && theyPicked;
          const showSplit = reveal && iPicked !== theyPicked && (iPicked || theyPicked);
          return (
            <li key={side}>
              <button
                type="button"
                onClick={() => answerWYR(doc, myDeviceId, side as Choice)}
                disabled={!!myChoice && !reveal}
                className={cn(
                  'w-full text-left p-5 rounded-2xl border bg-[var(--card)] flex flex-col gap-2',
                  'active:scale-[0.99] transition-all',
                  iPicked
                    ? 'border-[var(--gold)] bg-[var(--gold-wash)]'
                    : 'border-[var(--border)] hover:border-[var(--gold-glow)]',
                  showAgree && 'border-[var(--gold)] bg-[var(--gold)]/15',
                )}
              >
                <p className="font-serif text-xl">{text}</p>
                {reveal && (
                  <div className="flex gap-2 flex-wrap">
                    {iPicked && (
                      <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--gold)]">
                        you
                      </span>
                    )}
                    {theyPicked && (
                      <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--gold)]">
                        {partner?.display_name ?? 'them'}
                      </span>
                    )}
                    {showAgree && (
                      <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--gold)]">
                        · same
                      </span>
                    )}
                    {showSplit && (
                      <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
                        · split
                      </span>
                    )}
                  </div>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
          {!partner
            ? 'Pair to see their answer'
            : !myChoice
              ? 'Tap to answer'
              : !partnerChoice
                ? `Waiting on ${partner.display_name}…`
                : 'Both in.'}
        </span>
        <Button size="sm" onClick={() => nextWYR(doc)}>
          Next →
        </Button>
      </div>
    </div>
  );
}
