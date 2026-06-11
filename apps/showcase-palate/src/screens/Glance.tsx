// palate. — Glance (cook mode)
// Colour is the interface. Tap anywhere to advance.
// Wake lock held while active.

import { useEffect, useRef, useCallback } from 'react';
import { createWakeLock } from '../utils/wake-lock.ts';
import type { ShippieIframeSdk } from '@shippie/iframe-sdk';

export type GlanceMode = 'rest' | 'hands on' | 'heat';

export interface GlanceStep {
  word: string;
  mode: GlanceMode;
  line: string;
  time: string;
}

export const COUNTRY_LOAF_WORKFLOW: GlanceStep[] = [
  { word: 'Autolyse', mode: 'rest', line: 'Flour and water, covered. Walk away.', time: '40 min' },
  { word: 'Mix', mode: 'hands on', line: 'Add levain and salt. Pinch through until even.', time: '10 min' },
  { word: 'Bulk', mode: 'rest', line: 'Covered at 24°. A fold each hour.', time: '4 h' },
  { word: 'Fold', mode: 'hands on', line: 'Stretch each side up and over the centre.', time: '2 min' },
  { word: 'Shape', mode: 'hands on', line: 'Tight boule. Seam down, drag for tension.', time: '5 min' },
  { word: 'Proof', mode: 'rest', line: 'Bannetons, seam up. Fridge overnight.', time: '12 h' },
  { word: 'Score', mode: 'hands on', line: 'One confident cut, base to tip.', time: '30 s' },
  { word: 'Bake', mode: 'heat', line: 'Lid on at 250°, twenty minutes. Lid off at 230°, twenty-two.', time: '42 min' },
  { word: 'Cool', mode: 'rest', line: 'On a rack. One hour. No cutting.', time: '1 h' },
];

type Palette = {
  bg: string;
  ink: string;
  sub: string;
  accent: string;
};

const PALETTES: Record<GlanceMode, Palette> = {
  rest: { bg: '#e9eee0', ink: '#2f4029', sub: '#5d7152', accent: '#4d6647' },
  'hands on': { bg: '#f7f3ec', ink: '#2a2118', sub: '#6b5d4f', accent: '#b85c26' },
  heat: { bg: '#c47c2b', ink: '#fdf3e3', sub: 'rgba(253,243,227,0.78)', accent: '#fdf3e3' },
};

interface Props {
  stepIndex: number;
  workflowId: string;
  shippie: ShippieIframeSdk;
  onAdvance: (nextIndex: number) => void;
  onComplete: () => void;
}

export function Glance({ stepIndex, shippie, onAdvance, onComplete }: Props) {
  const steps = COUNTRY_LOAF_WORKFLOW;
  const step = steps[Math.min(stepIndex, steps.length - 1)]!;
  const pal = PALETTES[step.mode]!
  const wakeLockRef = useRef(createWakeLock());

  // Acquire wake lock on mount; release on unmount
  useEffect(() => {
    const wl = wakeLockRef.current;
    void wl.acquire();

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        void wl.acquire();
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      void wl.release();
    };
  }, []);

  const advance = useCallback(() => {
    // Haptic
    try {
      void shippie.feel.texture('toggle');
    } catch {
      // ignore — may not be in iframe context
    }
    const next = stepIndex + 1;
    if (next >= steps.length) {
      onComplete();
    } else {
      onAdvance(next);
    }
  }, [stepIndex, steps.length, shippie, onAdvance, onComplete]);

  const modeLabel = step.mode.toUpperCase();

  return (
    <div
      className="glance-screen"
      style={{ background: pal.bg, '--glance-ink': pal.ink, '--glance-sub': pal.sub, '--glance-accent': pal.accent } as React.CSSProperties}
      onClick={advance}
    >
      <div className="glance-header">
        <span className="wordmark" style={{ color: pal.sub }}>palate.</span>
        <span className="glance-counter" style={{ color: pal.sub }}>
          {stepIndex + 1} / {steps.length}
        </span>
      </div>

      <div className="glance-body">
        <div className="glance-mode" style={{ color: pal.accent }}>{modeLabel}</div>
        <div className="glance-word" style={{ color: pal.ink }}>{step.word}</div>
        <div className="glance-line" style={{ color: pal.sub }}>{step.line}</div>
        <div className="glance-time" style={{ color: pal.ink }}>{step.time}</div>
      </div>

      <div className="glance-footer">
        <div className="glance-dots">
          {steps.map((_, i) => {
            let bg = 'transparent';
            let border = pal.sub;
            if (i < stepIndex) { bg = pal.accent; border = 'transparent'; }
            else if (i === stepIndex) { bg = pal.ink; border = 'transparent'; }
            return (
              <div
                key={i}
                className="glance-dot"
                style={{ background: bg, border: `1px solid ${border}` }}
              />
            );
          })}
        </div>
        <div className="glance-hint" style={{ color: pal.sub }}>
          tap anywhere to advance · rest is green, hands-on is cream, heat is amber
        </div>
      </div>
    </div>
  );
}

import React from 'react';
