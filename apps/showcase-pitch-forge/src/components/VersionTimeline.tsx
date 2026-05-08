import type { Version } from '../lib/versions.ts';

export interface VersionTimelineProps {
  versions: Version[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCompare: (a: string, b: string) => void;
  onRestore: (id: string) => void;
}

export function VersionTimeline({
  versions,
  selectedId,
  onSelect,
  onCompare,
  onRestore,
}: VersionTimelineProps) {
  if (versions.length === 0) {
    return <p className="empty">No versions yet. Snapshot a version to start tracking changes.</p>;
  }
  return (
    <ul className="version-list">
      {versions.map((v, i) => (
        <li key={v.id} className={`version-row ${selectedId === v.id ? 'active' : ''}`}>
          <button type="button" className="version-row-main" onClick={() => onSelect(v.id)}>
            <span className="version-label">{v.label}</span>
            <span className="version-meta">
              {new Date(v.created_at).toLocaleString()} · {v.sections.length} sections
            </span>
          </button>
          <div className="version-actions">
            {versions[i + 1] ? (
              <button
                type="button"
                className="ghost small"
                onClick={() => onCompare(versions[i + 1]!.id, v.id)}
              >
                Compare
              </button>
            ) : null}
            <button type="button" className="ghost small" onClick={() => onRestore(v.id)}>
              Restore
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
