import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { formatTimer } from '../lib/ratio.ts';

interface SimpleTimerProps {
  /** Show extra hint text below the clock. */
  hint?: string;
  /** Called whenever the run-state flips. */
  onRunStateChange?: (running: boolean, seconds: number) => void;
  /** Called once when "Reset" is pressed. */
  onReset?: () => void;
}

/**
 * Tiny start/stop/reset timer. Shared by Brew (target seconds) and
 * Cook (open-ended). No method-specific copy lives here — the parent
 * passes a `hint` string.
 */
export function SimpleTimer({ hint, onRunStateChange, onReset }: SimpleTimerProps): ReactElement {
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const tickRef = useRef<number | null>(null);

  useEffect(() => {
    if (!running) {
      if (tickRef.current !== null) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
      return;
    }
    tickRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => {
      if (tickRef.current !== null) window.clearInterval(tickRef.current);
    };
  }, [running]);

  function start() {
    setRunning(true);
    onRunStateChange?.(true, seconds);
  }
  function stop() {
    setRunning(false);
    onRunStateChange?.(false, seconds);
  }
  function reset() {
    setRunning(false);
    setSeconds(0);
    onReset?.();
  }

  return (
    <div className="simple-timer">
      <div className="timer-clock" aria-live="polite">
        {formatTimer(seconds)}
      </div>
      {hint ? <div className="timer-hint">{hint}</div> : null}
      <div className="timer-actions">
        {!running ? (
          <button type="button" className="primary" onClick={start}>
            Start
          </button>
        ) : (
          <button type="button" onClick={stop}>
            Stop
          </button>
        )}
        <button type="button" className="ghost" onClick={reset}>
          Reset
        </button>
      </div>
    </div>
  );
}
