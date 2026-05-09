/**
 * Single-line PR ceremony. Fades in for ~3 seconds, palette shift to
 * accent on the burst card. Reduced-motion mode: static color flash, no
 * fade.
 */
import { useEffect, useState } from 'react';

export interface PRBurstEvent {
  /** Stable id so we can re-key when a new PR fires after dismissal. */
  id: string;
  kind: 'variant' | 'lineage' | 'rep-range';
  weight: number;
  reps: number;
  unit: string;
  /** Plain-language summary of what was beaten — copy varies by kind. */
  summary: string;
}

interface PRBurstProps {
  event: PRBurstEvent | null;
  onDismiss: () => void;
}

const SHOW_MS = 3500;

export function PRBurst({ event, onDismiss }: PRBurstProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!event) {
      setVisible(false);
      return undefined;
    }
    setVisible(true);
    const t = window.setTimeout(() => {
      setVisible(false);
      window.setTimeout(onDismiss, 300);
    }, SHOW_MS);
    return () => window.clearTimeout(t);
  }, [event?.id, onDismiss]);

  if (!event) return null;

  return (
    <div
      className={`lift-pr-burst ${visible ? 'lift-pr-burst--visible' : ''}`}
      role="status"
      aria-live="polite"
    >
      <p className="lift-pr-burst__head">PR — {kindLabel(event.kind)}</p>
      <p className="lift-pr-burst__numerals">
        {event.weight}
        {event.unit} × {event.reps}
      </p>
      <p className="lift-pr-burst__summary">{event.summary}</p>
    </div>
  );
}

function kindLabel(kind: PRBurstEvent['kind']): string {
  switch (kind) {
    case 'variant':
      return 'best ever';
    case 'lineage':
      return 'lift best';
    case 'rep-range':
      return 'rep-range best';
  }
}
