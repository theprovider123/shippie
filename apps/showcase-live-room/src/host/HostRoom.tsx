import { useEffect, useState, useSyncExternalStore } from 'react';
import * as Y from 'yjs';
import { createGroup, type Group } from '@shippie/proximity';
import { ShareCode } from './ShareCode.tsx';
import { next, reveal, startQuiz } from './quiz-controller.ts';
import {
  firstBuzzerForQuestion,
  getCurrentIndex,
  getPhase,
} from '../shared/quiz-state.ts';
import { QUESTIONS } from '../shared/questions.ts';
import { Scoreboard } from '../shared/Scoreboard.tsx';

const APP_SLUG = 'live-room';

interface RoomReady {
  joinCode: string;
  group: Group;
  doc: Y.Doc;
}

export function HostRoom() {
  const [room, setRoom] = useState<RoomReady | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const group = await createGroup({ appSlug: APP_SLUG });
        const shared = group.sharedState('quiz');
        if (cancelled) {
          group.leave();
          return;
        }
        // Seed defaults on the host doc so guests sync them on join.
        const meta = shared.doc.getMap('meta');
        if (!meta.has('currentIndex')) meta.set('currentIndex', 0);
        if (!meta.has('phase')) meta.set('phase', 'lobby');
        setRoom({ joinCode: group.joinCode, group, doc: shared.doc });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      room?.group.leave();
    };
  }, [room]);

  if (error) return <ErrorScreen message={error} />;
  if (!room) return <LoadingScreen text="Creating room…" />;
  return <HostRoomReady room={room} />;
}

function HostRoomReady({ room }: { room: RoomReady }) {
  const phase = useYjsField(room.doc, getPhase);
  const index = useYjsField(room.doc, getCurrentIndex);
  const winner = useYjsField(room.doc, (d) => firstBuzzerForQuestion(d, index));
  const question = QUESTIONS[index];

  return (
    <main className="host-room">
      {phase === 'lobby' && (
        <>
          <ShareCode code={room.joinCode} />
          <button
            type="button"
            onClick={() => startQuiz(room.doc)}
            style={{
              height: 48,
              borderRadius: 999,
              border: 'none',
              background: 'var(--accent)',
              color: 'white',
              fontWeight: 600,
            }}
          >
            Start quiz
          </button>
        </>
      )}
      {phase === 'question' && question && (
        <>
          <h2 style={{ margin: 0 }}>
            Q{index + 1}: {question.prompt}
          </h2>
          {winner ? (
            <p>
              Buzzed: <strong>{winner.peerId.slice(0, 6)}</strong>
            </p>
          ) : (
            <p style={{ color: 'var(--muted)' }}>Waiting for someone to buzz…</p>
          )}
          <button type="button" onClick={() => reveal(room.doc)} disabled={!winner}>
            Reveal answer
          </button>
        </>
      )}
      {phase === 'reveal' && question && (
        <>
          <h2>{question.answer}</h2>
          <button type="button" onClick={() => next(room.doc)}>
            Next
          </button>
          <Scoreboard doc={room.doc} />
        </>
      )}
      {phase === 'finished' && (
        <>
          <h2>Final scores</h2>
          <Scoreboard doc={room.doc} highlightWinner />
        </>
      )}
    </main>
  );
}

function LoadingScreen({ text }: { text: string }) {
  return (
    <main className="host-room">
      <p>{text}</p>
    </main>
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <main className="host-room">
      <h2>Could not start</h2>
      <p style={{ color: 'var(--muted)' }}>{message}</p>
    </main>
  );
}

function useYjsField<T>(doc: Y.Doc, read: (doc: Y.Doc) => T): T {
  return useSyncExternalStore(
    (cb) => {
      const handler = () => cb();
      doc.on('update', handler);
      return () => doc.off('update', handler);
    },
    () => read(doc),
    () => read(doc),
  );
}
