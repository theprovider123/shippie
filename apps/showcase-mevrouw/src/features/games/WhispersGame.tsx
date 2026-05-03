/**
 * WhispersGame — soft conversation prompts. Both phones see the same
 * thread of rounds; each round has a prompt and one response per
 * partner. Real-time sync, no scoring.
 */
import type * as Y from 'yjs';
import { Button } from '@/components/ui/button.tsx';
import { partnerOf, readCoupleMeta } from '@/features/couple/couple-state.ts';
import {
  deleteWhisper,
  newWhisper,
  promptFor,
  readWhispers,
  setWhisperResponse,
  type WhisperRound,
} from './whispers-state.ts';
import { useYjs } from '@/sync/useYjs.ts';
import { relativePast } from '@/lib/dates.ts';

interface Props {
  doc: Y.Doc;
  myDeviceId: string;
  onExit: () => void;
}

export function WhispersGame({ doc, myDeviceId, onExit }: Props) {
  const meta = useYjs(doc, readCoupleMeta);
  const partner = partnerOf(meta, myDeviceId);
  const rec = useYjs(doc, readWhispers);

  // Most recent first.
  const ordered = [...rec.order].reverse();

  return (
    <div className="flex flex-col gap-4 px-4 pb-8">
      <header className="flex items-center justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--gold)]">Whispers</p>
          <h2 className="font-serif text-2xl">Soft prompts. Just talking.</h2>
        </div>
        <Button variant="ghost" size="sm" onClick={onExit}>
          ← Back
        </Button>
      </header>

      <Button onClick={() => newWhisper(doc)} className="self-start">
        + New whisper
      </Button>

      {ordered.length === 0 ? (
        <p className="text-[var(--muted-foreground)] text-sm">
          Tap New whisper to draw a prompt. Both of you can write a response in your own time;
          they sync as you type.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {ordered.map((rid) => {
            const round = rec.rounds[rid];
            if (!round) return null;
            return (
              <RoundCard
                key={rid}
                doc={doc}
                round={round}
                myDeviceId={myDeviceId}
                partnerDeviceId={partner?.device_id ?? null}
                partnerName={partner?.display_name ?? 'them'}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}

function RoundCard({
  doc,
  round,
  myDeviceId,
  partnerDeviceId,
  partnerName,
}: {
  doc: Y.Doc;
  round: WhisperRound;
  myDeviceId: string;
  partnerDeviceId: string | null;
  partnerName: string;
}) {
  const prompt = promptFor(round.promptId);
  const myResponse = round.responses[myDeviceId] ?? '';
  const partnerResponse = partnerDeviceId ? (round.responses[partnerDeviceId] ?? '') : '';

  return (
    <li className="rounded-2xl border border-[var(--gold-glow)] bg-[var(--card)] p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <p className="font-serif text-base leading-snug">{prompt.text}</p>
        <button
          type="button"
          onClick={() => {
            if (window.confirm('Delete this whisper for both of us?')) {
              deleteWhisper(doc, round.id);
            }
          }}
          aria-label="Delete whisper"
          className="text-[var(--muted-foreground)] hover:text-[var(--destructive)] text-xs px-2"
        >
          ×
        </button>
      </div>
      <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
        {relativePast(new Date(round.startedAt).toISOString())}
      </p>

      <label className="flex flex-col gap-1">
        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--gold)]">You</span>
        <textarea
          rows={2}
          value={myResponse}
          onChange={(e) => setWhisperResponse(doc, round.id, myDeviceId, e.target.value)}
          placeholder="Anything you want to say…"
          className="bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm font-serif focus:outline-none focus:border-[var(--gold)] resize-none"
        />
      </label>

      <div className="flex flex-col gap-1">
        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
          {partnerName}
        </span>
        {partnerResponse ? (
          <p className="text-sm font-serif italic text-[var(--foreground)] whitespace-pre-wrap">
            {partnerResponse}
          </p>
        ) : (
          <p className="text-xs text-[var(--muted-foreground)] italic">
            Waiting for them…
          </p>
        )}
      </div>
    </li>
  );
}
