/**
 * Today page — the headline view.
 *
 * Surface, top-to-bottom:
 *   1. Quick-tap buttons (water 250 ml, espresso, mug, tea) + custom.
 *   2. Smart suggestion banner (only when one applies).
 *   3. Hydration progress bar with streak badge.
 *   4. Caffeine residual curve with cutoff line + midnight prediction.
 *   5. Day timeline (water above, caffeine below).
 *   6. Recent sips list, expandable for edit/remove.
 */
import { QuickLogButtons } from '../components/QuickLogButtons.tsx';
import { HydrationBar } from '../components/HydrationBar.tsx';
import { CaffeineCurve } from '../components/CaffeineCurve.tsx';
import { DayTimeline } from '../components/DayTimeline.tsx';
import { SmartSuggestion } from '../components/SmartSuggestion.tsx';
import { DrinkRow } from '../components/DrinkRow.tsx';
import type { Sip, SipKind, Targets } from '../db.ts';
import { dayKey, todayKey } from '../db.ts';
import { hydrationProgress, streakDaysMetTarget } from '../lib/targets.ts';
import { suggestionFor } from '../lib/suggestions.ts';
import {
  classifyMidnightResidual,
  midnightResidual,
} from '../lib/caffeine-half-life.ts';

interface TodayProps {
  sips: Sip[];
  targets: Targets;
  onLog: (kind: SipKind) => void;
  onCustom: (kind: SipKind) => void;
  onUpdate: (id: string, patch: Partial<Omit<Sip, 'id'>>) => void;
  onRemove: (id: string) => void;
}

export function Today({ sips, targets, onLog, onCustom, onUpdate, onRemove }: TodayProps) {
  const today = todayKey();
  const todays = sips
    .filter((s) => dayKey(s.logged_at) === today)
    .sort((a, b) => new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime());

  const hp = hydrationProgress(sips, targets, today);
  const streak = streakDaysMetTarget(sips, targets);
  const suggestion = suggestionFor({ sips, targets });
  const midnight = midnightResidual(sips, today);
  const impact = classifyMidnightResidual(midnight);

  return (
    <div className="today">
      <QuickLogButtons targets={targets} onLog={onLog} onLongPress={onCustom} />
      <SmartSuggestion suggestion={suggestion} />
      <HydrationBar progress={hp} streak={streak} />
      <CaffeineCurve sips={sips} targets={targets} day_key={today} />
      <DailyVerdict
        midnight_mg={Math.round(midnight)}
        impact={impact}
        last_caffeine_iso={
          [...sips]
            .filter((s) => dayKey(s.logged_at) === today && s.mg > 0)
            .sort((a, b) => new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime())[0]
            ?.logged_at ?? null
        }
      />
      <DayTimeline sips={sips} day_key={today} />
      <section className="card recent-card" aria-label="Recent sips">
        <p className="eyebrow">today · recent</p>
        {todays.length === 0 ? (
          <p className="muted small">nothing logged yet today.</p>
        ) : (
          <ul className="drink-list">
            {todays.map((s) => (
              <DrinkRow key={s.id} sip={s} onUpdate={onUpdate} onRemove={onRemove} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function DailyVerdict({
  midnight_mg,
  impact,
  last_caffeine_iso,
}: {
  midnight_mg: number;
  impact: 'clear' | 'mild' | 'high';
  last_caffeine_iso: string | null;
}) {
  if (!last_caffeine_iso) {
    return (
      <p className="verdict verdict-clear">
        no caffeine logged today. predicted residual at midnight: 0 mg.
      </p>
    );
  }
  const last = new Date(last_caffeine_iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  if (impact === 'clear') {
    return (
      <p className="verdict verdict-clear">
        last caffeine at {last}. predicted residual at midnight: {midnight_mg} mg. below the threshold most people sleep through.
      </p>
    );
  }
  if (impact === 'mild') {
    return (
      <p className="verdict verdict-mild">
        last caffeine at {last}. predicted residual at midnight: {midnight_mg} mg. that's a mild nudge to sleep latency.
      </p>
    );
  }
  return (
    <p className="verdict verdict-high">
      last caffeine at {last}. predicted residual at midnight: {midnight_mg} mg. that's likely to affect your sleep.
    </p>
  );
}
