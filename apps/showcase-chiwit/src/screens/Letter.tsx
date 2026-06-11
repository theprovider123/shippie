import { useMemo } from 'react';
import type { ChiwitState, MoodWord } from '../lib/store';
import { localDate } from '../lib/store';

interface LetterProps {
  state: ChiwitState;
  setState: React.Dispatch<React.SetStateAction<ChiwitState>>;
}

const MOOD_HEIGHT_MINI: Record<MoodWord, number> = {
  heavy: 15,
  low: 20,
  okay: 28,
  light: 35,
  bright: 42,
};

const MOOD_COLOR_MINI: Record<MoodWord, string> = {
  heavy: '#CC6147',
  low: '#BDB8AC',
  okay: '#BDB8AC',
  light: '#E9A687',
  bright: '#E9A687',
};

function formatWeekLabel(weekEnding: string): string {
  const d = new Date(weekEnding + 'T00:00:00');
  // find sunday
  const sunday = new Date(d);
  sunday.setDate(d.getDate() - 6);
  const dayStr = sunday.toLocaleDateString('en-GB', { weekday: 'long' }).toLowerCase();
  const dateStr = sunday.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).toLowerCase();
  return `${dayStr} ${dateStr}`;
}

export function Letter({ state }: LetterProps) {
  const sortedLetters = useMemo(
    () => [...state.letters].sort((a, b) => b.weekEnding.localeCompare(a.weekEnding)),
    [state.letters]
  );

  const latest = sortedLetters[0];
  const earlier = sortedLetters.slice(1);

  const today = localDate();

  return (
    <div className="chiwit-screen chiwit-letter">
      <h2 className="chiwit-letter__title">your week in a letter</h2>
      <p className="chiwit-letter__subtitle">
        {latest ? formatWeekLabel(latest.weekEnding) : today} · written on this phone
      </p>

      {latest ? (
        <>
          {/* Mini mood arc */}
          <div className="chiwit-letter__arc">
            {latest.arc.map((mood, i) => {
              if (!mood) {
                return <div key={i} className="chiwit-letter__arc-dot" />;
              }
              return (
                <div
                  key={i}
                  className="chiwit-letter__arc-bar"
                  style={{
                    height: `${MOOD_HEIGHT_MINI[mood]}px`,
                    background: MOOD_COLOR_MINI[mood],
                  }}
                />
              );
            })}
          </div>

          {/* Letter body */}
          <div className="chiwit-letter__card">
            <p className="chiwit-letter__body">{latest.body}</p>
          </div>

          {/* Stat pills */}
          {latest.pills.length > 0 && (
            <div className="chiwit-letter__pills">
              {latest.pills.map((pill) => (
                <span key={pill} className="chiwit-letter__pill">{pill}</span>
              ))}
            </div>
          )}

          {/* Lock meta */}
          <div className="chiwit-letter__lock">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <rect x="2.5" y="6" width="9" height="7" rx="1.5" stroke="#9E988A" strokeWidth="1" />
              <path d="M4.5 6V4.5a2.5 2.5 0 015 0V6" stroke="#9E988A" strokeWidth="1" strokeLinecap="round" />
            </svg>
            <span>composed entirely from your local data · never sent anywhere</span>
          </div>
        </>
      ) : (
        <div className="chiwit-letter__empty">
          <p>your first letter will arrive after a full week of logging.</p>
          <p className="chiwit-letter__empty-hint">come back on sunday.</p>
        </div>
      )}

      {/* Earlier letters */}
      {earlier.length > 0 && (
        <div className="chiwit-letter__archive">
          <p className="chiwit-letter__archive-label">EARLIER LETTERS</p>
          <ul className="chiwit-letter__archive-list">
            {earlier.map((letter) => (
              <li key={letter.id} className="chiwit-letter__archive-item">
                <span className="chiwit-letter__archive-date">
                  {formatWeekLabel(letter.weekEnding)}
                </span>
                {letter.pills.length > 0 && (
                  <span className="chiwit-letter__archive-pills">
                    {letter.pills.join(' · ')}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
