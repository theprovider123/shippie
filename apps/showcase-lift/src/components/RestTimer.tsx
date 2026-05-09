/**
 * Ambient rest timer. Subtle ring + haptic at completion. Defaults to
 * 90 seconds; user can adjust ±15s with thumb-sized buttons.
 *
 * Auto-starts when a set is saved (parent calls start()). Cleans up on
 * unmount or when stop() is called.
 */
import { useEffect, useRef, useState } from 'react';

interface RestTimerProps {
  /** Initial seconds. Defaults to 90s. */
  defaultSeconds?: number;
  /** Auto-start trigger key — change it to start a new countdown. */
  trigger?: number;
}

export function RestTimer({ defaultSeconds = 90, trigger }: RestTimerProps) {
  const [target, setTarget] = useState(defaultSeconds);
  const [remaining, setRemaining] = useState(defaultSeconds);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<number | null>(null);
  const lastTriggerRef = useRef<number | undefined>(trigger);

  useEffect(() => {
    if (trigger !== undefined && trigger !== lastTriggerRef.current) {
      lastTriggerRef.current = trigger;
      setRemaining(target);
      setRunning(true);
    }
  }, [trigger, target]);

  useEffect(() => {
    if (!running) {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return undefined;
    }
    intervalRef.current = window.setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          if (intervalRef.current !== null) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          try {
            navigator.vibrate?.([60, 40, 60]);
          } catch {
            // ignore
          }
          setRunning(false);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
    };
  }, [running]);

  const fraction = target > 0 ? Math.max(0, Math.min(1, remaining / target)) : 0;
  const ringDash = `${Math.round(fraction * 100)}, 100`;

  function adjustTarget(delta: number) {
    const next = Math.max(15, target + delta);
    setTarget(next);
    if (!running) setRemaining(next);
  }

  return (
    <section className="lift-rest" aria-label="Rest timer">
      <div className="lift-rest__display">
        <svg
          className="lift-rest__ring"
          viewBox="0 0 36 36"
          aria-hidden="true"
        >
          <path
            className="lift-rest__ring-bg"
            d="M18 2.0845
              a 15.9155 15.9155 0 0 1 0 31.831
              a 15.9155 15.9155 0 0 1 0 -31.831"
          />
          <path
            className="lift-rest__ring-fg"
            strokeDasharray={ringDash}
            d="M18 2.0845
              a 15.9155 15.9155 0 0 1 0 31.831
              a 15.9155 15.9155 0 0 1 0 -31.831"
          />
        </svg>
        <div className="lift-rest__numeral">
          {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
        </div>
      </div>
      <div className="lift-rest__controls">
        <button
          type="button"
          className="lift-pill"
          onClick={() => adjustTarget(-15)}
          aria-label="Reduce rest by 15 seconds"
        >
          −15s
        </button>
        <button
          type="button"
          className="lift-pill"
          onClick={() => {
            if (running) {
              setRunning(false);
            } else {
              setRemaining(target);
              setRunning(true);
            }
          }}
        >
          {running ? 'Pause' : remaining > 0 && remaining < target ? 'Resume' : 'Start'}
        </button>
        <button
          type="button"
          className="lift-pill"
          onClick={() => adjustTarget(15)}
          aria-label="Add 15 seconds to rest"
        >
          +15s
        </button>
      </div>
    </section>
  );
}
