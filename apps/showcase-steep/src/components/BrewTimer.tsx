/**
 * Steep timer — countdown for one infusion.
 *
 * State machine: idle → running → done. On done we fire `onComplete`
 * once; the parent decides whether to offer a re-steep.
 *
 * The wrapper's wakelock rule keeps the screen alive while
 * `[data-shippie-wakelock]` is in the DOM. We add that attribute on
 * the page wrapper, not here, so the lock holds even between brews.
 */
import { useEffect, useRef, useState } from 'react';

interface BrewTimerProps {
  /** Total seconds to count down. */
  seconds: number;
  /** Optional label prefix shown above the countdown. */
  label?: string;
  /** Fired exactly once when the timer reaches zero. */
  onComplete?: () => void;
}

type Phase = 'idle' | 'running' | 'done';

export function BrewTimer({ seconds, label, onComplete }: BrewTimerProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [remaining, setRemaining] = useState(seconds);
  const completedRef = useRef(false);

  // Reset whenever the configured length changes (e.g. switching herbs
  // mid-brew, or moving between blends with different steep times).
  useEffect(() => {
    setPhase('idle');
    setRemaining(seconds);
    completedRef.current = false;
  }, [seconds]);

  useEffect(() => {
    if (phase !== 'running') return undefined;
    const id = window.setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          window.clearInterval(id);
          setPhase('done');
          if (!completedRef.current) {
            completedRef.current = true;
            onComplete?.();
          }
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [phase, onComplete]);

  const reset = () => {
    setPhase('idle');
    setRemaining(seconds);
    completedRef.current = false;
  };

  return (
    <div className={`brew-timer brew-timer-${phase}`} role="timer" aria-live="polite">
      {label ? <p className="brew-timer-label">{label}</p> : null}
      <p className="brew-timer-readout">{formatMmSs(remaining)}</p>
      <div className="brew-timer-actions">
        {phase === 'idle' ? (
          <button type="button" className="primary" onClick={() => setPhase('running')}>
            Start
          </button>
        ) : null}
        {phase === 'running' ? (
          <>
            <button type="button" onClick={() => setPhase('idle')}>
              Pause
            </button>
            <button type="button" className="ghost" onClick={reset}>
              Reset
            </button>
          </>
        ) : null}
        {phase === 'done' ? (
          <button type="button" className="primary" onClick={reset}>
            Brew again
          </button>
        ) : null}
      </div>
    </div>
  );
}

function formatMmSs(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
