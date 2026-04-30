import { useState } from 'react';
import type * as Y from 'yjs';
import { Button } from '@/components/ui/button.tsx';
import {
  partnerOf,
  readCoupleMeta,
} from '@/features/couple/couple-state.ts';
import { answerDaily, questionForDate, readDaily } from './daily-state.ts';
import { useYjs } from '@/sync/useYjs.ts';
import { toLocalDateString } from '@/lib/dates.ts';

interface Props {
  doc: Y.Doc;
  myDeviceId: string;
  onExit: () => void;
}

export function DailyGame({ doc, myDeviceId, onExit }: Props) {
  const meta = useYjs(doc, readCoupleMeta);
  const rec = useYjs(doc, readDaily);
  const partner = partnerOf(meta, myDeviceId);

  const today = toLocalDateString(new Date());
  const q = questionForDate(today);
  const todayAnswers = rec.answers[today] ?? {};
  const myAnswer = todayAnswers[myDeviceId];
  const partnerAnswer = partner ? todayAnswers[partner.device_id] : undefined;

  const [draft, setDraft] = useState('');
  const reveal = !!myAnswer && !!partnerAnswer;

  return (
    <div className="flex flex-col gap-4 px-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onExit}>
          ← Games
        </Button>
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
          {today}
        </span>
      </div>

      <header className="flex flex-col gap-1.5 px-1">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--gold)]">
          Today's question
        </p>
        <h1 className="font-serif text-2xl leading-tight tracking-tight">{q.text}</h1>
        <p className="text-xs text-[var(--muted-foreground)] mt-1">
          You both answer in private. The answers unlock once both are in.
        </p>
      </header>

      {!myAnswer && (
        <section className="rounded-2xl border border-[var(--gold-glow)] bg-[var(--card)] p-4 flex flex-col gap-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={5}
            placeholder="Take your time."
            className="w-full bg-transparent border-0 resize-none focus:outline-none font-serif text-base leading-relaxed"
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => {
                if (draft.trim()) {
                  answerDaily(doc, today, myDeviceId, draft.trim());
                  setDraft('');
                }
              }}
              disabled={!draft.trim()}
            >
              Submit
            </Button>
          </div>
        </section>
      )}

      {myAnswer && !reveal && (
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 flex flex-col gap-2">
          <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--gold)]">
            Your answer (sealed)
          </p>
          <p className="font-serif text-base whitespace-pre-wrap">{myAnswer}</p>
          <p className="text-xs text-[var(--muted-foreground)] mt-1">
            Waiting on {partner?.display_name ?? 'them'}…
          </p>
        </section>
      )}

      {reveal && (
        <>
          <section className="rounded-2xl border border-[var(--gold)] bg-[var(--gold-wash)] p-4 flex flex-col gap-2">
            <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--gold)]">
              You wrote
            </p>
            <p className="font-serif text-base whitespace-pre-wrap">{myAnswer}</p>
          </section>
          <section className="rounded-2xl border border-[var(--gold-glow)] bg-[var(--card)] p-4 flex flex-col gap-2">
            <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--gold)]">
              {partner?.display_name ?? 'They'} wrote
            </p>
            <p className="font-serif text-base whitespace-pre-wrap">{partnerAnswer}</p>
          </section>
          <p className="text-xs font-mono text-[var(--muted-foreground)] text-center">
            New question tomorrow.
          </p>
        </>
      )}
    </div>
  );
}
