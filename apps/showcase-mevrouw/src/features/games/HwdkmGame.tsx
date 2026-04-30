import { useState } from 'react';
import type * as Y from 'yjs';
import { Button } from '@/components/ui/button.tsx';
import {
  partnerOf,
  readCoupleMeta,
} from '@/features/couple/couple-state.ts';
import {
  addHwdkmRound,
  deleteHwdkmRound,
  guessHwdkm,
  hwdkmStreak,
  readHwdkmRounds,
  type HwdkmRound,
} from './hwdkm-state.ts';
import { useYjs } from '@/sync/useYjs.ts';
import { cn } from '@/lib/cn.ts';
import { relativePast } from '@/lib/dates.ts';

interface Props {
  doc: Y.Doc;
  myDeviceId: string;
  onExit: () => void;
}

export function HwdkmGame({ doc, myDeviceId, onExit }: Props) {
  const meta = useYjs(doc, readCoupleMeta);
  const rounds = useYjs(doc, readHwdkmRounds);
  const partner = partnerOf(meta, myDeviceId);
  const [composing, setComposing] = useState(false);

  const myStreak = hwdkmStreak(rounds, myDeviceId);
  const theirStreak = partner ? hwdkmStreak(rounds, partner.device_id) : { right: 0, wrong: 0 };

  return (
    <div className="flex flex-col gap-4 px-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onExit}>
          ← Games
        </Button>
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
          you {myStreak.right}–{myStreak.wrong} · {partner?.display_name ?? 'them'}{' '}
          {theirStreak.right}–{theirStreak.wrong}
        </span>
      </div>

      <header className="flex flex-col gap-1.5 px-1">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--gold)]">
          How well do you know me
        </p>
        <h1 className="font-serif text-3xl leading-tight tracking-tight">
          Test them.
        </h1>
      </header>

      {!composing && (
        <Button onClick={() => setComposing(true)}>+ Set a question</Button>
      )}

      {composing && (
        <Composer
          onSave={(q, ans, distractors) => {
            addHwdkmRound(doc, myDeviceId, q, ans, distractors);
            setComposing(false);
          }}
          onCancel={() => setComposing(false)}
        />
      )}

      <ul className="flex flex-col gap-3">
        {rounds.length === 0 && !composing && (
          <li className="text-[var(--muted-foreground)] text-sm">
            No rounds yet. Make one — they'll see it on their next visit.
          </li>
        )}
        {rounds.map((r) => (
          <RoundCard
            key={r.id}
            r={r}
            myDeviceId={myDeviceId}
            partnerName={partner?.display_name ?? 'them'}
            onGuess={(idx) => guessHwdkm(doc, r.id, myDeviceId, idx)}
            onDelete={() => deleteHwdkmRound(doc, r.id)}
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
  onSave: (question: string, answer: string, distractors: string[]) => void;
  onCancel: () => void;
}) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [distractors, setDistractors] = useState<string[]>(['', '', '']);

  const cleanDistractors = distractors.filter((d) => d.trim().length > 0);
  const ready = question.trim() && answer.trim() && cleanDistractors.length >= 1;

  return (
    <div className="rounded-2xl border border-[var(--gold-glow)] bg-[var(--card)] p-4 flex flex-col gap-3">
      <p className="text-sm text-[var(--muted-foreground)]">
        Ask something only you'd know. Pick the true answer, plus a few plausible decoys.
      </p>
      <Field label="Question">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="What was on the table when we first sat down?"
          className={inputCls}
        />
      </Field>
      <Field label="True answer">
        <input
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="A jug of mint water"
          className={inputCls}
        />
      </Field>
      <Field label="Distractors (1–3, plausible)">
        <div className="flex flex-col gap-2">
          {distractors.map((d, i) => (
            <input
              key={i}
              value={d}
              onChange={(e) => setDistractors((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
              placeholder={`#${i + 1}`}
              className={inputCls}
            />
          ))}
        </div>
      </Field>
      <div className="flex justify-end gap-2 mt-1">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button disabled={!ready} onClick={() => onSave(question.trim(), answer.trim(), cleanDistractors)}>
          Set the question
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
  onDelete,
}: {
  r: HwdkmRound;
  myDeviceId: string;
  partnerName: string;
  onGuess: (idx: number) => void;
  onDelete: () => void;
}) {
  const fromMe = r.author_device === myDeviceId;
  const myGuess = r.guesses[myDeviceId];
  const settled = myGuess !== undefined;

  return (
    <article
      className={cn(
        'rounded-2xl border bg-[var(--card)] p-4 flex flex-col gap-3',
        fromMe ? 'border-[var(--border)]' : 'border-[var(--gold-glow)]',
      )}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
          {fromMe ? 'You set' : `From ${partnerName}`} · {relativePast(r.created_at)}
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

      <p className="font-serif text-lg">{r.question}</p>

      <ul className="flex flex-col gap-2">
        {r.options.map((opt, i) => {
          const isCorrect = i === r.correct_index;
          const iPicked = myGuess === i;
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => !fromMe && !settled && onGuess(i)}
                disabled={fromMe || settled}
                className={cn(
                  'w-full text-left p-3 rounded-xl border bg-[var(--background)] flex items-center justify-between gap-3',
                  iPicked && isCorrect && 'border-[var(--gold)] bg-[var(--gold)]/10',
                  iPicked && !isCorrect && 'border-[var(--destructive)] bg-[var(--destructive)]/10',
                  settled && !iPicked && isCorrect && 'border-[var(--gold-glow)]',
                  !settled && !iPicked && 'border-[var(--border)] hover:border-[var(--gold-glow)]',
                  fromMe && isCorrect && 'border-[var(--gold-glow)]',
                  !fromMe && !settled && 'cursor-pointer',
                )}
              >
                <span className="font-serif text-sm">{opt}</span>
                {fromMe && isCorrect && (
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--gold)]">
                    truth
                  </span>
                )}
                {settled && i === r.correct_index && !iPicked && (
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--gold)]">
                    truth
                  </span>
                )}
                {iPicked && (
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
                    your guess
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {!fromMe && !settled && (
        <p className="text-xs text-[var(--muted-foreground)]">Pick one.</p>
      )}
      {settled && !fromMe && (
        <p className={cn(
          'text-xs font-mono uppercase tracking-wider',
          myGuess === r.correct_index ? 'text-[var(--gold)]' : 'text-[var(--destructive)]',
        )}>
          {myGuess === r.correct_index ? '✓ you got it' : '✗ not quite'}
        </p>
      )}
    </article>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--muted-foreground)]">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputCls =
  'w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--gold)]';
