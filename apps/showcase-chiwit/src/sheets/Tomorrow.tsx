import { useState } from 'react';
import type { ChiwitState, MoodWord } from '../lib/store';
import { todayLocal } from '../lib/store';

interface TomorrowSheetProps {
  state: ChiwitState;
  setState: React.Dispatch<React.SetStateAction<ChiwitState>>;
  onClose: () => void;
  onNavigate: (sub: 'today' | 'tomorrow' | 'yourwords') => void;
}

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const INTENTIONS = [
  'water before coffee',
  'step outside early',
  'lights out by eleven',
] as const;

type Intention = typeof INTENTIONS[number];

function moodCarryForward(mood: MoodWord | undefined): string {
  if (!mood || mood === 'okay') {
    return 'tomorrow is its own day.';
  }
  if (mood === 'heavy' || mood === 'low') {
    return 'today was heavier — tomorrow doesn\'t have to match it.';
  }
  return 'today felt lighter — worth carrying that feeling forward.';
}

function movementCarryForward(hasMoved: boolean): string {
  if (hasMoved) return 'you walked today. tomorrow is already a possibility.';
  return 'no walk today — tomorrow is still open.';
}

export function TomorrowSheet({ state, setState, onClose, onNavigate }: TomorrowSheetProps) {
  const today = todayLocal();
  const todayLog = state.days[today];
  const todayMood = todayLog?.mood;
  const hasMoved = Object.values(todayLog?.things ?? {}).some(
    (t) => t.kind === 'movement' && t.action === 'done'
  );

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowName = DAY_NAMES[tomorrow.getDay()];

  const currentIntention = todayLog?.intention;
  const [selected, setSelected] = useState<Intention | null>(
    (INTENTIONS.includes(currentIntention as Intention) ? currentIntention : null) as Intention | null
  );

  function handleSelect(intention: Intention) {
    const next = selected === intention ? null : intention;
    setSelected(next);
    setState((prev) => {
      const days = { ...prev.days };
      const day = days[today] ?? { date: today, things: {}, journal: [] };
      days[today] = { ...day, intention: next ?? undefined };
      return { ...prev, days };
    });
  }

  return (
    <div className="chiwit-sheet-overlay" role="dialog" aria-modal="true" aria-label="Tomorrow">
      <div className="chiwit-sheet chiwit-tomorrow">
        <button type="button" className="chiwit-sheet__close" onClick={onClose} aria-label="Close">×</button>

        <h2 className="chiwit-tomorrow__title">tomorrow, {tomorrowName}.</h2>

        <p className="chiwit-tomorrow__mood-line">{moodCarryForward(todayMood)}</p>
        <p className="chiwit-tomorrow__walk-line">{movementCarryForward(hasMoved)}</p>
        <p className="chiwit-tomorrow__words-line">
          your words will be waiting — nothing more is asked.
        </p>

        <p className="chiwit-tomorrow__intention-label">ONE SMALL INTENTION?</p>
        <ul className="chiwit-tomorrow__options">
          {INTENTIONS.map((intention) => (
            <li key={intention}>
              <button
                type="button"
                className={`chiwit-tomorrow__option ${selected === intention ? 'is-selected' : ''}`}
                onClick={() => handleSelect(intention)}
              >
                {intention}
              </button>
            </li>
          ))}
        </ul>
        <p className="chiwit-tomorrow__hint">just one. small is the point.</p>

        <div className="chiwit-tomorrow__nav">
          <button type="button" onClick={() => onNavigate('today')}>today</button>
          <span className="chiwit-tomorrow__nav-active">tomorrow</span>
          <button type="button" onClick={() => onNavigate('yourwords')}>your words</button>
        </div>
      </div>
    </div>
  );
}
