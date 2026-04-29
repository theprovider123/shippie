import { useEffect, useState, useSyncExternalStore } from 'react';
import * as Y from 'yjs';
import { joinGroup, type Group } from '@shippie/proximity';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { Buzzer } from './Buzzer.tsx';
import { Scoreboard } from '../shared/Scoreboard.tsx';
import {
  firstBuzzerForQuestion,
  getCurrentIndex,
  getPhase,
  getQuestionStartedAt,
  recordBuzz,
} from '../shared/quiz-state.ts';
import { QUESTIONS } from '../shared/questions.ts';
import { generatePeerId } from '../shared/peer-id.ts';

const APP_SLUG = 'live-room';
const peerId = generatePeerId();
const shippie = createShippieIframeSdk({ appId: 'app_live_room' });

interface RoomReady {
  group: Group;
  doc: Y.Doc;
}

interface GuestRoomProps {
  joinCode: string;
}

export function GuestRoom({ joinCode }: GuestRoomProps) {
  const [room, setRoom] = useState<RoomReady | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const group = await joinGroup({ appSlug: APP_SLUG, joinCode });
        const shared = group.sharedState('quiz');
        if (cancelled) {
          group.leave();
          return;
        }
        setRoom({ group, doc: shared.doc });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [joinCode]);

  useEffect(() => {
    return () => {
      room?.group.leave();
    };
  }, [room]);

  if (error) {
    return (
      <main className="guest-room">
        <h2>Couldn&rsquo;t join</h2>
        <p style={{ color: 'var(--muted)' }}>{error}</p>
      </main>
    );
  }
  if (!room) {
    return (
      <main className="guest-room">
        <p>Joining…</p>
      </main>
    );
  }
  return <GuestRoomReady doc={room.doc} group={room.group} />;
}

function GuestRoomReady({ doc, group }: { doc: Y.Doc; group: Group }) {
  const phase = useYjsField(doc, getPhase);
  const index = useYjsField(doc, getCurrentIndex);
  const winner = useYjsField(doc, (d) => firstBuzzerForQuestion(d, index));
  const startedAt = useYjsField(doc, getQuestionStartedAt);
  const question = QUESTIONS[index];

  // P3 — mesh-status badge polls group.members() at 1Hz. Cheap;
  // members() is a synchronous read against the local PeerLink table.
  const [memberCount, setMemberCount] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => {
      setMemberCount(group.members().length);
    }, 1000);
    return () => window.clearInterval(id);
  }, [group]);

  // P3 — latency = first-buzz timestamp minus question-start
  // timestamp. Shown only after a buzz lands and the host has
  // stamped the start. Sub-30ms is the headline number we want
  // visible; >100ms means a slow link to the host.
  const latencyMs =
    winner && startedAt !== null ? Math.max(0, winner.ts - startedAt) : null;

  const meshBadge = (
    <div className="mesh-badge" aria-label="Mesh status">
      <span className="mesh-dot" aria-hidden="true" />
      <span>{memberCount + 1} on the mesh</span>
    </div>
  );

  if (phase === 'lobby')
    return (
      <main className="guest-room">
        {meshBadge}
        <h2>Waiting for the host to start…</h2>
      </main>
    );

  if (phase === 'finished')
    return (
      <main className="guest-room">
        {meshBadge}
        <h2>Final scores</h2>
        <Scoreboard doc={doc} highlightWinner />
      </main>
    );

  if (phase === 'reveal' && question)
    return (
      <main className="guest-room">
        {meshBadge}
        <h2>Answer</h2>
        <p>
          <strong>{question.answer}</strong>
        </p>
        {latencyMs !== null && (
          <p className="latency" aria-label="Buzz latency">
            First buzz: <strong>{latencyMs} ms</strong>
            {latencyMs <= 30 ? ' ⚡' : latencyMs <= 100 ? '' : ' (slow link)'}
          </p>
        )}
        <Scoreboard doc={doc} />
      </main>
    );

  if (phase === 'question' && question) {
    const myWin = winner?.peerId === peerId;
    const someoneElseBuzzed = winner !== null && winner.peerId !== peerId;
    return (
      <main className="guest-room">
        {meshBadge}
        <h2>
          Q{index + 1}: {question.prompt}
        </h2>
        {latencyMs !== null && (
          <p className="latency live" aria-live="polite">
            {latencyMs} ms since the question
          </p>
        )}
        <Buzzer
          locked={someoneElseBuzzed || myWin}
          isMine={myWin}
          onBuzz={() => {
            recordBuzz(doc, { peerId, ts: Date.now(), questionIndex: index });
            shippie.feel.texture('confirm');
          }}
        />
      </main>
    );
  }

  return null;
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
