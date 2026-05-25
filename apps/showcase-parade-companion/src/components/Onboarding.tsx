import { useState } from 'react';
import { cleanDisplayName } from '../lib/display-name';

interface OnboardingProps {
  open: boolean;
  initialName: string;
  supporterTag: string;
  onFinish: (name: string) => void;
  onSkip: () => void;
}

/**
 * Two-slide first-run flow.
 *
 * Slide 1 explains what the app is BEFORE asking for a name (round-8 fix: a
 * cold first slide that only asked for a name left users without context).
 * Slide 2 is the practical orientation.
 */
export function Onboarding({ open, initialName, supporterTag, onFinish, onSkip }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(initialName);

  if (!open) return null;

  const finish = () => onFinish(cleanDisplayName(name));

  return (
    <div className="onboarding" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <div className="onboarding__surface">
        <p className="onboarding__progress" aria-hidden>
          {step + 1} / 2
        </p>
        {step === 0 ? (
          <>
            <p className="eyebrow">Parade Companion</p>
            <h2 id="onboarding-title">Offline map. Group plan. No account.</h2>
            <p className="onboarding__lede">
              Made for the Islington parade. Works without signal once it's saved on this phone.
            </p>
            <label className="name-field">
              And what should we call you?
              <input
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
                maxLength={24}
                autoFocus
                placeholder="Your name"
              />
            </label>
            <p className="supporter-tag">
              Parade tag <strong>#{supporterTag}</strong> keeps duplicate names apart.
            </p>
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
            <p className="eyebrow">How it works</p>
            <h2 id="onboarding-title">Set it once. Use it in the crowd.</h2>
            <ol className="onboarding__steps">
              <li>
                <strong>Save offline</strong>
                <span>Map, fonts, and route pack stay on this phone.</span>
              </li>
              <li>
                <strong>Start or join group</strong>
                <span>Use the Group tab: start a plan or open an invite link.</span>
              </li>
              <li>
                <strong>Tap the map</strong>
                <span>I am here, Bus here, or Toilet here.</span>
              </li>
            </ol>
            <div className="onboarding__privacy" aria-label="What gets shared">
              <div>
                <strong>Private</strong>
                <span>Your name, saved plan, and emergency/help taps stay here.</span>
              </div>
              <div>
                <strong>Group</strong>
                <span>Invite links share the plan only with people you choose.</span>
              </div>
              <div>
                <strong>Public pulse</strong>
                <span>Map taps are anonymous place signals and expire after the parade.</span>
              </div>
            </div>
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
