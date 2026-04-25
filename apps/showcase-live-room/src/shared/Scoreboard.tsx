import { useEffect, useRef, useSyncExternalStore } from 'react';
import * as Y from 'yjs';
import { animateSpring, fireTexture } from '@shippie/sdk/wrapper';
import type { Score } from './types.ts';

interface ScoreboardProps {
  doc: Y.Doc;
  highlightWinner?: boolean;
}

export function Scoreboard({ doc, highlightWinner }: ScoreboardProps) {
  const scores = useScores(doc);
  const sorted = [...scores].sort((a, b) => b.points - a.points);
  const max = sorted[0]?.points ?? 1;
  const winnerId = highlightWinner ? sorted[0]?.peerId ?? null : null;
  const milestoneFired = useRef(false);

  useEffect(() => {
    if (winnerId && !milestoneFired.current) {
      milestoneFired.current = true;
      try {
        fireTexture('milestone', document.body);
      } catch {
        /* Texture engine not yet ready in some test envs. */
      }
    }
  }, [winnerId]);

  if (sorted.length === 0) {
    return <p style={{ color: 'var(--muted)' }}>No scores yet.</p>;
  }

  return (
    <ol className="scoreboard">
      {sorted.map((s) => (
        <ScoreRow key={s.peerId} score={s} max={max} isWinner={s.peerId === winnerId} />
      ))}
    </ol>
  );
}

function ScoreRow({
  score,
  max,
  isWinner,
}: {
  score: Score;
  max: number;
  isWinner: boolean;
}) {
  const barRef = useRef<HTMLDivElement | null>(null);
  const target = score.points / Math.max(1, max);

  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    return animateSpring(
      ({ value }) => {
        el.style.width = `${Math.max(0, Math.min(1, value)) * 100}%`;
      },
      { from: 0, to: target, stiffness: 180, damping: 22 },
    );
  }, [target]);

  return (
    <li className={`score-row ${isWinner ? 'score-row-winner' : ''}`}>
      <span className="score-peer">{score.peerId.slice(0, 6)}</span>
      <div className="score-bar-track">
        <div ref={barRef} className="score-bar" />
      </div>
      <span className="score-points">{score.points}</span>
    </li>
  );
}

function useScores(doc: Y.Doc): Score[] {
  return useSyncExternalStore(
    (cb) => {
      const handler = () => cb();
      doc.on('update', handler);
      return () => doc.off('update', handler);
    },
    () => doc.getArray<Score>('scores').toArray(),
    () => doc.getArray<Score>('scores').toArray(),
  );
}
