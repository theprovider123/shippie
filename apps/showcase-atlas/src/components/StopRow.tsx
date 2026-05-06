import type { Stop } from '../db/schema.ts';

interface Props {
  stop: Stop;
  onDelete: (id: string) => void;
}

function fmtCoord(n: number): string {
  return n.toFixed(5);
}

export function StopRow({ stop, onDelete }: Props) {
  return (
    <li className="atlas-stop-row">
      <div>
        <strong>{stop.label || 'Untitled stop'}</strong>
        <div className="atlas-stop-coord">
          {fmtCoord(stop.lat)}, {fmtCoord(stop.lon)}
          {stop.captured_at ? ` · ${new Date(stop.captured_at).toLocaleString()}` : ''}
        </div>
        {stop.note ? <p className="atlas-stop-note">{stop.note}</p> : null}
      </div>
      <button type="button" className="atlas-btn atlas-btn-ghost" onClick={() => onDelete(stop.id)}>
        Remove
      </button>
    </li>
  );
}
