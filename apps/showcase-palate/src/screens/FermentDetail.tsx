// palate. — Ferment Detail screen
// Three types: bulk (Q10 remaining + fold schedule), levain (status words), long (day x/y + burp)

import { useState } from 'react';
import type { Ferment } from '../lib/types.ts';
import { q10Remaining, fmtSeconds } from '../lib/engine.ts';
import React from 'react';

type LevainPhase = 'flat' | 'building' | 'peaked' | 'falling';

function getLevainPhase(f: Ferment, now: number): LevainPhase {
  if (f.fed_at == null) return 'flat';
  const hoursSinceFeed = (now - f.fed_at) / 3_600_000;
  if (hoursSinceFeed < 2) return 'flat';
  if (hoursSinceFeed < 5) return 'building';
  if (hoursSinceFeed < 8) return 'peaked';
  return 'falling';
}

interface Props {
  ferment: Ferment;
  now: number;
  onTempUpdate: (id: string, dough_temp_c: number) => void;
  onFold: (id: string) => void;
  onFeed: (id: string) => void;
  onComplete: (id: string) => void;
  onBack: () => void;
}

export function FermentDetail({ ferment, now, onTempUpdate, onFold, onFeed, onComplete, onBack }: Props) {
  const [doughTempInput, setDoughTempInput] = useState(
    ferment.dough_temp_c != null ? String(ferment.dough_temp_c) : '24'
  );

  const elapsed_s = (now - ferment.started_at) / 1000;
  const dough_temp = parseFloat(doughTempInput) || 24;

  const remaining_s = ferment.type === 'bulk' || ferment.type === 'proof'
    ? q10Remaining(ferment.target_duration_s, elapsed_s, dough_temp)
    : Math.max(0, ferment.target_duration_s - elapsed_s);

  const dayCount = Math.floor(elapsed_s / 86400) + 1;
  const totalDays = Math.ceil(ferment.target_duration_s / 86400);

  const foldCount = ferment.folds?.length ?? 0;
  const hoursSinceStart = elapsed_s / 3600;
  const targetFolds = Math.floor(hoursSinceStart); // one fold per hour in bulk
  const nextFoldIn = foldCount < 4 ? Math.max(0, (foldCount + 1) * 3600 - elapsed_s) : null;

  const levainPhase = ferment.type === 'levain' ? getLevainPhase(ferment, now) : null;
  const nextFeedHours = ferment.fed_at != null
    ? Math.max(0, (ferment.fed_at + 12 * 3_600_000 - now) / 3_600_000)
    : null;

  const PHASE_LABELS: Record<LevainPhase, string> = {
    flat: 'flat',
    building: 'building',
    peaked: 'peaked',
    falling: 'falling',
  };

  return (
    <div className="ferment-detail">
      <div className="ferment-detail-header">
        <button className="back-btn" onClick={onBack}>← back</button>
        <span className="ferment-detail-name">{ferment.name}</span>
        <span className="ferment-type-badge">{ferment.type}</span>
      </div>

      {/* Bulk / Proof */}
      {(ferment.type === 'bulk' || ferment.type === 'proof') && (
        <div className="ferment-section">
          <div className="ferment-remaining-label">Q10-adjusted remaining</div>
          <div className="ferment-remaining">{fmtSeconds(remaining_s)}</div>

          <div className="ferment-temp-row">
            <label className="ferment-temp-label">dough temp</label>
            <input
              className="ferment-temp-input"
              type="number"
              step="0.5"
              value={doughTempInput}
              onChange={(e) => {
                setDoughTempInput(e.target.value);
                const val = parseFloat(e.target.value);
                if (!isNaN(val)) onTempUpdate(ferment.id, val);
              }}
            />
            <span className="ferment-temp-unit">°C</span>
          </div>

          <div className="fold-schedule">
            <div className="fold-title">fold schedule</div>
            {[1, 2, 3, 4].map((n) => {
              const done = foldCount >= n;
              const active = !done && n === foldCount + 1;
              return (
                <div key={n} className={`fold-row${done ? ' fold-done' : active ? ' fold-active' : ' fold-pending'}`}>
                  <span className="fold-dot">{done ? '●' : '○'}</span>
                  <span>Fold {n} {done ? `· done` : active && nextFoldIn != null ? `· in ${fmtSeconds(nextFoldIn)}` : `· hour ${n}`}</span>
                  {active && (
                    <button className="fold-btn" onClick={() => onFold(ferment.id)}>record fold</button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Levain */}
      {ferment.type === 'levain' && levainPhase && (
        <div className="ferment-section">
          <div className="levain-phase">{PHASE_LABELS[levainPhase]}</div>
          {ferment.fed_at && (
            <div className="levain-fed">
              last fed {Math.floor((now - ferment.fed_at) / 3_600_000)}h ago
            </div>
          )}
          {nextFeedHours != null && nextFeedHours > 0 && (
            <div className="levain-next-feed">
              next feed in ~{nextFeedHours.toFixed(1)}h
            </div>
          )}
          {(levainPhase === 'falling' || nextFeedHours === 0) && (
            <div className="levain-warn">time to feed</div>
          )}
          <button className="feed-btn" onClick={() => onFeed(ferment.id)}>record feed</button>
        </div>
      )}

      {/* Long ferment (kimchi, miso, kombucha) */}
      {(ferment.type === 'kimchi' || ferment.type === 'miso' || ferment.type === 'kombucha') && (
        <div className="ferment-section">
          <div className="long-ferment-day">day {dayCount} of {totalDays}</div>
          <div className="long-ferment-remaining">{fmtSeconds(remaining_s)} remaining</div>

          <div className="long-timeline">
            <div className="long-progress-bar">
              <div
                className="long-progress-fill"
                style={{ width: `${Math.min(100, (elapsed_s / ferment.target_duration_s) * 100)}%` }}
              />
            </div>
          </div>

          {/* Burp prompt for kimchi/kombucha */}
          {(ferment.type === 'kimchi' || ferment.type === 'kombucha') && (
            <div className="burp-prompt">burp the jar today</div>
          )}
        </div>
      )}

      {ferment.notes && (
        <div className="ferment-notes">{ferment.notes}</div>
      )}

      <button className="ferment-complete-btn" onClick={() => onComplete(ferment.id)}>
        mark complete
      </button>
    </div>
  );
}
