import { useMemo } from 'react';
import type { ChiwitState, DayLog, MoodWord } from '../lib/store';
import { localDate } from '../lib/store';
import { computeObservations } from '../lib/observations';
import { ObservationCard } from '../components/ObservationCard';

interface GardenProps {
  state: ChiwitState;
  setState: React.Dispatch<React.SetStateAction<ChiwitState>>;
}

const MOOD_HEIGHT: Record<MoodWord, number> = {
  heavy: 40,
  low: 50,
  okay: 64,
  light: 78,
  bright: 96,
};

const MOOD_COLOR: Record<MoodWord, string> = {
  heavy: '#CC6147',
  low: '#CC6147',
  okay: '#E9A687',
  light: '#E9A687',
  bright: '#E9A687',
};

function last14Days(): string[] {
  const dates: string[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(localDate(d));
  }
  return dates;
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDate();
  const month = d.toLocaleDateString('en-GB', { month: 'short' }).toLowerCase();
  return `${day} ${month}`;
}

export function Garden({ state, setState }: GardenProps) {
  const dates = useMemo(() => last14Days(), []);
  const observations = useMemo(
    () => computeObservations(state.days, state.ambient, state.dismissedObservations),
    [state.days, state.ambient, state.dismissedObservations]
  );

  function dismiss(id: string) {
    setState((prev) => ({
      ...prev,
      dismissedObservations: [...prev.dismissedObservations, id],
    }));
  }

  const firstDate = dates[0];
  const lastDate = dates[dates.length - 1];

  // Count logged days total
  const totalLogged = Object.keys(state.days).length;

  return (
    <div className="chiwit-screen chiwit-garden">
      <h2 className="chiwit-garden__title">your garden</h2>
      <p className="chiwit-garden__subtitle">
        {totalLogged} {totalLogged === 1 ? 'day' : 'days'} of little things · all on this phone
      </p>

      {/* 14-day arc */}
      <div className="chiwit-garden__arc-wrap">
        <div className="chiwit-garden__arc">
          {dates.map((date) => {
            const day: DayLog | undefined = state.days[date];
            const mood = day?.mood;

            if (!mood) {
              return (
                <div key={date} className="chiwit-garden__arc-day chiwit-garden__arc-day--empty">
                  <div className="chiwit-garden__arc-dot" />
                </div>
              );
            }

            const height = MOOD_HEIGHT[mood];
            const color = MOOD_COLOR[mood];

            return (
              <div key={date} className="chiwit-garden__arc-day">
                <div
                  className="chiwit-garden__arc-bar"
                  style={{ height: `${height}px`, background: color }}
                  title={`${formatShortDate(date)} — ${mood}`}
                />
              </div>
            );
          })}
        </div>
        <div className="chiwit-garden__arc-labels">
          <span>{firstDate ? formatShortDate(firstDate) : ''}</span>
          <span className="chiwit-garden__arc-quiet">a quiet day — gardens rest</span>
          <span>today</span>
        </div>
      </div>

      {/* Observation cards */}
      {observations.length > 0 && (
        <div className="chiwit-garden__observations">
          {observations.map((obs) => (
            <ObservationCard key={obs.id} observation={obs} onDismiss={dismiss} />
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="chiwit-garden__legend">
        <span className="chiwit-garden__legend-dot" style={{ background: '#8A5470' }} />
        <span>plum is body</span>
        <span className="chiwit-garden__legend-dot" style={{ background: '#A84136' }} />
        <span>coral is mood</span>
        <span className="chiwit-garden__legend-dot" style={{ background: '#9A5F30' }} />
        <span>amber is habit</span>
      </div>
    </div>
  );
}
