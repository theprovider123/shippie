import type { Person, Touch } from '../db/schema.ts';
import { peopleBlob, touchesBlob } from '../lib/csv.ts';

interface Props {
  people: Person[];
  touches: Touch[];
  onOpenYourData: () => void;
}

function downloadBlob(blob: Blob, filename: string): void {
  if (typeof URL === 'undefined' || typeof document === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function Settings({ people, touches, onOpenYourData }: Props) {
  return (
    <div className="page">
      <div className="page-header">
        <h2>Settings</h2>
      </div>

      <div className="privacy-banner">
        <strong>Your Rolodex stays yours.</strong>
        Touch is local-first. The 30 people you care about live on this device only — no
        server holds them, no salesperson sees them, no algorithm scores them. Pipedrive and
        HubSpot are loss-leaders into paid plans and lock-in. This is the version that
        doesn't try to upsell you. Pull a CSV any time and walk away.
      </div>

      <div className="card">
        <h3>Export</h3>
        <p className="muted small">Two CSVs — people and touches separately.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="ghost"
            onClick={() => downloadBlob(peopleBlob(people), 'touch-people.csv')}
          >
            people.csv ({people.length})
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => downloadBlob(touchesBlob(touches), 'touch-touches.csv')}
          >
            touches.csv ({touches.length})
          </button>
        </div>
      </div>

      <div className="card">
        <h3>Backup</h3>
        <p className="muted small">
          Touch piggybacks on Shippie's encrypted-backup spine. Open Your Data to see what
          this app holds and export the encrypted bundle.
        </p>
        <button type="button" className="ghost" onClick={onOpenYourData}>
          Open Your Data
        </button>
      </div>

      <div className="card">
        <h3>What this is not</h3>
        <p className="small">
          Not a sales CRM. Not an "engagement score". Not a pipeline. No leads, no deals, no
          forecasts. Just a memory aid for a small set of people you actually care about.
        </p>
      </div>
    </div>
  );
}
