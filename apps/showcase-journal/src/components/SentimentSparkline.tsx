/**
 * P5 — sentiment sparkline rendered above QuickEntry.
 *
 * On every meaningful text change (debounced) we route through the
 * container's local AI worker via `shippie.ai.run({ task:
 * 'sentiment', input: text })`. The score lands in a 14-slot ring
 * buffer and renders as an SVG path so writers can see the sentiment
 * arc of the entry they're composing.
 *
 * Load-bearing P5 invariant: when `result.source === 'unavailable'`
 * we hide the sparkline entirely. The component never renders broken
 * AI — the writing flow keeps working without it.
 */
import { useEffect, useRef, useState } from 'react';
import type { ShippieIframeSdk } from '@shippie/iframe-sdk';

interface SentimentSparklineProps {
  text: string;
  shippie: ShippieIframeSdk;
  /** Debounce window in ms before re-querying the AI. Default 600. */
  debounceMs?: number;
}

interface SentimentPoint {
  /** -1..+1. */
  score: number;
  /** ms when this score was recorded. */
  recordedAt: number;
}

const HISTORY_LENGTH = 14;
const VIEWBOX = { width: 280, height: 56 };
const PADDING = 4;

export function SentimentSparkline({
  text,
  shippie,
  debounceMs = 600,
}: SentimentSparklineProps) {
  const [points, setPoints] = useState<SentimentPoint[]>([]);
  // `available` starts as `null` (unknown). After the first call we
  // either set it `true` (continue rendering) or `false` (hide forever
  // for this session — no point retrying every keystroke).
  const [available, setAvailable] = useState<boolean | null>(null);
  const lastQueryRef = useRef('');

  useEffect(() => {
    const trimmed = text.trim();
    if (trimmed.length < 8) return;
    if (trimmed === lastQueryRef.current) return;
    if (available === false) return;

    const timeout = window.setTimeout(async () => {
      lastQueryRef.current = trimmed;
      try {
        const result = await shippie.ai.run({
          task: 'sentiment',
          input: trimmed,
        });
        if (result.source === 'unavailable') {
          setAvailable(false);
          return;
        }
        const payload = result.output as { sentiment?: string; score?: number } | null;
        const rawScore = typeof payload?.score === 'number' ? payload.score : 0;
        const signed =
          payload?.sentiment === 'negative'
            ? -Math.abs(rawScore)
            : payload?.sentiment === 'positive'
              ? Math.abs(rawScore)
              : 0;
        setAvailable(true);
        setPoints((prev) => {
          const next = [...prev, { score: signed, recordedAt: Date.now() }];
          return next.length > HISTORY_LENGTH ? next.slice(-HISTORY_LENGTH) : next;
        });
      } catch {
        // Worker unreachable / timeout — treat as unavailable.
        setAvailable(false);
      }
    }, debounceMs);
    return () => window.clearTimeout(timeout);
  }, [text, shippie, debounceMs, available]);

  if (available === false || points.length < 2) return null;

  const innerW = VIEWBOX.width - PADDING * 2;
  const innerH = VIEWBOX.height - PADDING * 2;
  const stepX = innerW / Math.max(1, points.length - 1);
  const yFor = (score: number) =>
    PADDING + innerH - ((score + 1) / 2) * innerH;
  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${PADDING + i * stepX} ${yFor(p.score)}`)
    .join(' ');
  const latest = points[points.length - 1]!;
  const polarity =
    latest.score > 0.2 ? 'positive' : latest.score < -0.2 ? 'negative' : 'neutral';

  return (
    <figure className="sentiment-sparkline" data-polarity={polarity}>
      <svg
        viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`}
        role="img"
        aria-label={`Sentiment arc: latest ${polarity}`}
      >
        <line
          x1={PADDING}
          x2={VIEWBOX.width - PADDING}
          y1={PADDING + innerH / 2}
          y2={PADDING + innerH / 2}
          stroke="rgba(20,18,15,0.15)"
          strokeWidth={1}
        />
        <path d={path} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        <circle
          cx={PADDING + (points.length - 1) * stepX}
          cy={yFor(latest.score)}
          r={3}
          fill="currentColor"
        />
      </svg>
      <figcaption>{polarity}</figcaption>
    </figure>
  );
}
