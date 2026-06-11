import { useMemo } from 'react';
import { BackupCard } from '@shippie/showcase-kit-v2';
import type { ChiwitState } from '../lib/store';
import type { BackupableStore } from '@shippie/showcase-kit-v2';

interface DataScreenProps {
  state: ChiwitState;
  setState: React.Dispatch<React.SetStateAction<ChiwitState>>;
  backupStore: BackupableStore;
}

function therapyExportText(state: ChiwitState): string {
  const lines: string[] = [];
  lines.push('CHIWIT THERAPY EXPORT');
  lines.push(`Generated: ${new Date().toLocaleDateString('en-GB', { dateStyle: 'long' })}`);
  lines.push('');
  lines.push('MOOD LOG');

  const sortedDates = Object.keys(state.days).sort();
  for (const date of sortedDates) {
    const day = state.days[date];
    if (!day) continue;
    const parts: string[] = [date];
    if (day.mood) parts.push(`mood: ${day.mood}`);
    const things = Object.values(day.things).map((t) => `${t.kind}: ${t.action}`);
    if (things.length > 0) parts.push(things.join(', '));
    if (day.journal.length > 0) {
      parts.push(`journal: ${day.journal.map((j) => j.text).join(' | ')}`);
    }
    lines.push(parts.join(' — '));
  }

  lines.push('');
  lines.push('LETTERS');
  for (const letter of state.letters) {
    lines.push(`Week ending ${letter.weekEnding}:`);
    lines.push(letter.body);
    lines.push('');
  }

  return lines.join('\n');
}

export function DataScreen({ state, setState, backupStore }: DataScreenProps) {
  const moodCount = useMemo(
    () => Object.values(state.days).filter((d) => d.mood).length,
    [state.days]
  );
  const journalCount = useMemo(
    () => Object.values(state.days).reduce((sum, d) => sum + d.journal.length, 0),
    [state.days]
  );
  const medCount = useMemo(
    () => Object.values(state.days).filter((d) => d.things['medication']).length,
    [state.days]
  );

  function downloadTherapyExport() {
    const text = therapyExportText(state);
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chiwit-export-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);

    setState((prev) => ({
      ...prev,
      exports: [...prev.exports, { kind: 'therapy-export', at: Date.now() }],
    }));
  }

  return (
    <div className="chiwit-screen chiwit-data">
      <h2 className="chiwit-data__title">nothing hidden,{'\n'}not even from you</h2>

      {/* Legend */}
      <div className="chiwit-data__legend">
        <div className="chiwit-data__legend-row">
          <span className="chiwit-data__dot" style={{ background: '#A84136' }} />
          <span>on this phone, always yours, never shared</span>
        </div>
        <div className="chiwit-data__legend-row">
          <span className="chiwit-data__dot" style={{ background: '#8A5470' }} />
          <span>sealed — only you hold the key</span>
        </div>
        <div className="chiwit-data__legend-row">
          <span className="chiwit-data__dot" style={{ background: '#9A5F30' }} />
          <span>shared with someone you chose</span>
        </div>
      </div>

      {/* Items */}
      <ul className="chiwit-data__items">
        <li className="chiwit-data__item">
          <span className="chiwit-data__item-label">mood entries</span>
          <span className="chiwit-data__badge chiwit-data__badge--coral">on this phone</span>
          <span className="chiwit-data__item-count">{moodCount}</span>
        </li>
        <li className="chiwit-data__item">
          <span className="chiwit-data__item-label">journal &amp; voice notes</span>
          <span className="chiwit-data__badge chiwit-data__badge--coral">on this phone</span>
          <span className="chiwit-data__item-count">{journalCount}</span>
        </li>
        <li className="chiwit-data__item">
          <span className="chiwit-data__item-label">medication logs</span>
          <span className="chiwit-data__badge chiwit-data__badge--coral">on this phone</span>
          <span className="chiwit-data__item-count">{medCount}</span>
        </li>
        <li className="chiwit-data__item">
          <span className="chiwit-data__item-label">sunday letters</span>
          <span className="chiwit-data__badge chiwit-data__badge--coral">on this phone</span>
          <span className="chiwit-data__item-count">{state.letters.length}</span>
        </li>
        <li className="chiwit-data__item">
          <span className="chiwit-data__item-label">pattern observations</span>
          <span className="chiwit-data__badge chiwit-data__badge--coral">on this phone</span>
          <span className="chiwit-data__item-count">{state.dismissedObservations.length}</span>
        </li>
        <li className="chiwit-data__item">
          <span className="chiwit-data__item-label">encrypted backup</span>
          <span className="chiwit-data__badge chiwit-data__badge--plum">sealed</span>
        </li>
        {state.exports.length > 0 && (
          <li className="chiwit-data__item">
            <span className="chiwit-data__item-label">therapy exports</span>
            <span className="chiwit-data__badge chiwit-data__badge--amber">was shared</span>
            <span className="chiwit-data__item-count">{state.exports.length}</span>
          </li>
        )}
      </ul>

      {/* BackupCard */}
      <BackupCard store={backupStore} appSlug="chiwit" />

      {/* Therapy export */}
      <div className="chiwit-data__export">
        <button
          type="button"
          className="chiwit-btn-ghost"
          onClick={downloadTherapyExport}
        >
          download therapy export
        </button>
      </div>

      {/* Footer */}
      <p className="chiwit-data__footer">
        <em>
          the key that unlocks your backup lives only on your devices. we hold an envelope we cannot open.
        </em>
      </p>
    </div>
  );
}
