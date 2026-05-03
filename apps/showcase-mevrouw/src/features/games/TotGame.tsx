/**
 * TotGame — Twenty-one Truths. Turn-based slow questions, alternating
 * between partners. Each turn shows the next prompt; only the active
 * player can answer; both phones see the same state. After 21 answers
 * a "Save as memory" affordance drops the transcript into Memories.
 */
import { useState } from 'react';
import type * as Y from 'yjs';
import { Button } from '@/components/ui/button.tsx';
import { partnerOf, readCoupleMeta } from '@/features/couple/couple-state.ts';
import { addMemory } from '@/features/memories/memories-state.ts';
import {
  abandonTotSession,
  answerTot,
  currentPromptForSession,
  promptFor,
  readTot,
  startTotSession,
  TOT_BANK,
  whoseTurn,
  type TotSession,
} from './tot-state.ts';
import { useYjs } from '@/sync/useYjs.ts';

interface Props {
  doc: Y.Doc;
  myDeviceId: string;
  onExit: () => void;
}

export function TotGame({ doc, myDeviceId, onExit }: Props) {
  const meta = useYjs(doc, readCoupleMeta);
  const partner = partnerOf(meta, myDeviceId);
  const rec = useYjs(doc, readTot);

  const session = rec.currentSessionId ? rec.sessions[rec.currentSessionId] : null;

  return (
    <div className="flex flex-col gap-4 px-4 pb-8">
      <header className="flex items-center justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--gold)]">
            Twenty-one Truths
          </p>
          <h2 className="font-serif text-2xl">Slow questions, in turn.</h2>
        </div>
        <Button variant="ghost" size="sm" onClick={onExit}>
          ← Back
        </Button>
      </header>

      {!session ? (
        <Intro
          onStart={() => startTotSession(doc, myDeviceId)}
          partnerName={partner?.display_name ?? 'them'}
        />
      ) : (
        <Active
          doc={doc}
          session={session}
          myDeviceId={myDeviceId}
          partnerDeviceId={partner?.device_id ?? null}
          partnerName={partner?.display_name ?? 'them'}
        />
      )}
    </div>
  );
}

function Intro({ onStart, partnerName }: { onStart: () => void; partnerName: string }) {
  return (
    <div className="rounded-2xl border border-[var(--gold-glow)] bg-[var(--card)] p-5 flex flex-col gap-3">
      <p className="font-serif text-base">
        Twenty-one prompts. You take turns answering — one of you, then {partnerName}, then back. No
        scoring, no timer. When you reach the end, the whole conversation can be saved as a memory.
      </p>
      <p className="text-[var(--muted-foreground)] text-sm">
        Slow is the point. You can leave it half-finished and pick it up tomorrow; both phones stay
        in sync.
      </p>
      <Button onClick={onStart} className="self-start">
        Begin
      </Button>
    </div>
  );
}

function Active({
  doc,
  session,
  myDeviceId,
  partnerDeviceId,
  partnerName,
}: {
  doc: Y.Doc;
  session: TotSession;
  myDeviceId: string;
  partnerDeviceId: string | null;
  partnerName: string;
}) {
  const [draft, setDraft] = useState('');
  const total = TOT_BANK.length;
  const turnIndex = session.answers.length;
  const isComplete = session.completedAt !== null;
  const currentPrompt = currentPromptForSession(session);
  const activePlayer = isComplete ? null : whoseTurn(session);

  // Partner identity bootstraps from session.startedBy + first non-
  // starter answer. Until partner has played, whoseTurn returns the
  // starter — but if it's the partner's turn (turnIndex odd) and we
  // know our deviceId, we can fill the partner slot.
  const myTurn = !isComplete && (
    activePlayer === myDeviceId ||
    (activePlayer === session.startedBy && session.startedBy !== myDeviceId && turnIndex % 2 === 1)
  );

  function submit() {
    if (!draft.trim() || !myTurn) return;
    answerTot(doc, session.id, myDeviceId, draft);
    setDraft('');
  }

  function saveAsMemory() {
    if (!isComplete) return;
    const lines = session.answers.map((a, i) => {
      const prompt = promptFor(a.promptId);
      const who = a.by === myDeviceId ? 'me' : partnerName;
      return `${i + 1}. ${prompt.text}\n   — ${who}: ${a.text}`;
    });
    const content = `Twenty-one truths\n\n${lines.join('\n\n')}`;
    addMemory(doc, myDeviceId, {
      content,
      memory_date: new Date(session.startedAt).toISOString().slice(0, 10),
    });
    abandonTotSession(doc, session.id);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider text-[var(--muted-foreground)]">
        <span>Question {Math.min(turnIndex + 1, total)} of {total}</span>
        <button
          type="button"
          onClick={() => {
            if (window.confirm('End this session? The answers so far will be deleted on both phones.')) {
              abandonTotSession(doc, session.id);
            }
          }}
          className="hover:text-[var(--destructive)]"
        >
          End
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-[var(--border)] rounded-full overflow-hidden">
        <div
          className="h-full bg-[var(--gold)] transition-all duration-500"
          style={{ width: `${(turnIndex / total) * 100}%` }}
        />
      </div>

      {isComplete ? (
        <div className="rounded-2xl border border-[var(--gold)] bg-[var(--card)] p-5 flex flex-col gap-3">
          <p className="font-serif text-lg">All twenty-one done.</p>
          <p className="text-[var(--muted-foreground)] text-sm">
            Save it as a memory and the whole conversation lands in your Memories timeline.
          </p>
          <div className="flex gap-2">
            <Button onClick={saveAsMemory}>Save as memory</Button>
            <Button variant="ghost" onClick={() => abandonTotSession(doc, session.id)}>
              Discard
            </Button>
          </div>
        </div>
      ) : currentPrompt ? (
        <div className="rounded-2xl border border-[var(--gold-glow)] bg-[var(--card)] p-5 flex flex-col gap-3">
          <p className="font-serif text-lg leading-snug">{currentPrompt.text}</p>
          <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--gold)]">
            {myTurn ? 'Your turn' : `${partnerName}'s turn`}
          </p>
          {myTurn ? (
            <>
              <textarea
                rows={3}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Answer in your own words…"
                className="bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm font-serif focus:outline-none focus:border-[var(--gold)] resize-none"
              />
              <Button onClick={submit} disabled={!draft.trim()} className="self-start">
                Send
              </Button>
            </>
          ) : (
            <p className="text-[var(--muted-foreground)] text-sm italic">
              Waiting for {partnerName} to answer…
            </p>
          )}
        </div>
      ) : null}

      {/* Transcript so far */}
      {session.answers.length > 0 && (
        <details className="rounded-xl border border-[var(--border)] p-3" open>
          <summary className="font-mono text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] cursor-pointer">
            Conversation so far ({session.answers.length})
          </summary>
          <ul className="flex flex-col gap-3 pt-3">
            {session.answers.map((a, i) => {
              const prompt = promptFor(a.promptId);
              const who = a.by === myDeviceId ? 'me' : partnerName;
              return (
                <li key={i} className="text-sm flex flex-col gap-0.5">
                  <p className="font-serif text-[var(--foreground)]">{prompt.text}</p>
                  <p className="text-[var(--muted-foreground)]">
                    <span className="font-mono text-[10px] uppercase tracking-wider mr-2 text-[var(--gold)]">
                      {who}
                    </span>
                    {a.text}
                  </p>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </div>
  );
}
