import { useState, useCallback } from 'react';
import { useOnboardingGate } from './useFirstRun';
import type { OnboardingFlowProps } from './types';

export function OnboardingFlow({ appSlug, version, slides, onComplete }: OnboardingFlowProps) {
  const { done, complete } = useOnboardingGate(appSlug, version);
  const [idx, setIdx] = useState(0);

  const finish = useCallback(() => {
    complete();
    onComplete?.();
  }, [complete, onComplete]);

  if (done) return null;
  if (slides.length === 0) return null;

  const slide = slides[Math.min(idx, slides.length - 1)]!;
  const last = idx >= slides.length - 1;

  return (
    <div className="shippie-onboarding" role="dialog" aria-modal="true" aria-label="Welcome">
      <div className="shippie-onboarding__surface">
        <div className="shippie-onboarding__progress" aria-hidden>
          {slides.map((_, i) => (
            <span key={i} className={`shippie-onboarding__dot${i === idx ? ' is-current' : ''}`} />
          ))}
        </div>
        <h2 className="shippie-onboarding__title">{slide.title}</h2>
        <div className="shippie-onboarding__body">{slide.body}</div>
        <div className="shippie-onboarding__actions">
          {!last ? (
            <button type="button" className="shippie-onboarding__skip" onClick={finish}>
              Skip
            </button>
          ) : null}
          <button
            type="button"
            className="shippie-onboarding__next"
            onClick={() => (last ? finish() : setIdx(idx + 1))}
          >
            {slide.cta ?? (last ? 'Got it' : 'Next')}
          </button>
        </div>
      </div>
    </div>
  );
}
