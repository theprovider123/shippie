/**
 * IntensityScale — 1-5 stepper or present/absent toggle, depending on
 * the symptom's `default_scale`.
 *
 * The 1-5 scale renders 5 segmented buttons. The stored intensity for
 * present-absent is 1 (present) or 0 (absent); the toggle just reads
 * and writes that.
 *
 * Accessibility: each scale step is a real button with an aria-pressed
 * boolean so VoiceOver/TalkBack announce the change. No "1 out of 5"
 * voiceover text — the visible label is the truth.
 */
import type { SymptomScale } from '../db/schema.ts';

interface Props {
  scale: SymptomScale;
  value: number;
  onChange: (next: number) => void;
  ariaLabel?: string;
}

export function IntensityScale({ scale, value, onChange, ariaLabel }: Props) {
  if (scale === 'present-absent') {
    const isPresent = value > 0;
    return (
      <div className="intensity-toggle" role="radiogroup" aria-label={ariaLabel ?? 'Present or absent'}>
        <button
          type="button"
          className={`toggle-pill ${!isPresent ? 'toggle-pill-active' : ''}`}
          aria-pressed={!isPresent}
          onClick={() => onChange(0)}
        >
          Absent
        </button>
        <button
          type="button"
          className={`toggle-pill ${isPresent ? 'toggle-pill-active' : ''}`}
          aria-pressed={isPresent}
          onClick={() => onChange(1)}
        >
          Present
        </button>
      </div>
    );
  }

  // 1-5
  return (
    <div className="intensity-stepper" role="radiogroup" aria-label={ariaLabel ?? 'Intensity 1 to 5'}>
      {[1, 2, 3, 4, 5].map((n) => {
        const active = value === n;
        return (
          <button
            key={n}
            type="button"
            className={`intensity-step intensity-step-${n} ${active ? 'intensity-step-active' : ''}`}
            aria-pressed={active}
            onClick={() => onChange(n)}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}
