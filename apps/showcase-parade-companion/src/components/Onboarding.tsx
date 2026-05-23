import { useState } from 'react';
import { cleanDisplayName } from '../lib/display-name';

interface OnboardingProps {
  open: boolean;
  initialName: string;
  onFinish: (name: string) => void;
  onSkip: () => void;
}

export function Onboarding({ open, initialName, onFinish, onSkip }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(initialName);

  if (!open) return null;

  const finish = () => onFinish(cleanDisplayName(name));

  return (
    <div className="onboarding" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <div className="onboarding__surface">
        {step === 0 ? (
          <>
            <p className="eyebrow">First run</p>
            <h2 id="onboarding-title">Hey, what should we call you?</h2>
            <label className="name-field">
              Display name
              <input
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
                maxLength={24}
                autoFocus
                placeholder="Me"
              />
            </label>
            <div className="onboarding__actions">
              <button type="button" className="secondary-action" onClick={onSkip}>
                Skip
              </button>
              <button type="button" className="primary-action" onClick={() => setStep(1)}>
                Continue
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="eyebrow">Parade mode</p>
            <h2 id="onboarding-title">Set it once. Use it in the crowd.</h2>
            <ol className="onboarding__steps">
              <li>
                <strong>Save offline</strong>
                <span>Map, fonts, and route pack stay on this phone.</span>
              </li>
              <li>
                <strong>Make a group</strong>
                <span>Share the QR before signal drops.</span>
              </li>
              <li>
                <strong>Tap the map</strong>
                <span>I am here, Bus is here, or Report.</span>
              </li>
            </ol>
            <div className="onboarding__actions">
              <button type="button" className="secondary-action" onClick={() => setStep(0)}>
                Back
              </button>
              <button type="button" className="primary-action" onClick={finish}>
                Get started
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
