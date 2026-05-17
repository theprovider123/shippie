import { useEffect, useState } from 'react';
import { DiffView } from '../components/DiffView.tsx';
import type { Section } from '../lib/store.ts';
import type { Version } from '../lib/versions.ts';

export interface ComparePageProps {
  versions: Version[];
  initialBeforeId: string | null;
  initialAfterId: string | null;
  currentSections: Section[];
  onRestore: (versionId: string) => void;
  onBack: () => void;
}

const CURRENT_OPTION_ID = '__current__';

export function ComparePage({
  versions,
  initialBeforeId,
  initialAfterId,
  currentSections,
  onRestore,
  onBack,
}: ComparePageProps) {
  const [beforeId, setBeforeId] = useState<string | null>(
    initialBeforeId ?? versions[1]?.id ?? null,
  );
  const [afterId, setAfterId] = useState<string | null>(
    initialAfterId ?? versions[0]?.id ?? CURRENT_OPTION_ID,
  );

  // Make sure picks remain valid when versions change.
  useEffect(() => {
    if (beforeId && beforeId !== CURRENT_OPTION_ID && !versions.find((v) => v.id === beforeId)) {
      setBeforeId(versions[1]?.id ?? null);
    }
    if (afterId && afterId !== CURRENT_OPTION_ID && !versions.find((v) => v.id === afterId)) {
      setAfterId(versions[0]?.id ?? CURRENT_OPTION_ID);
    }
  }, [versions, beforeId, afterId]);

  const before = pickSnapshot(beforeId, versions, currentSections);
  const after = pickSnapshot(afterId, versions, currentSections);

  return (
    <section className="page">
      <header className="page-header">
        <button type="button" className="ghost" onClick={onBack}>
          ← Back
        </button>
        <h2>Compare versions</h2>
      </header>
      <div className="compare-pickers">
        <label className="field">
          <span>Before</span>
          <select value={beforeId ?? ''} onChange={(e) => setBeforeId(e.target.value || null)}>
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>After</span>
          <select value={afterId ?? ''} onChange={(e) => setAfterId(e.target.value || null)}>
            <option value={CURRENT_OPTION_ID}>Current draft</option>
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {before && after ? (
        <>
          <DiffView
            before={renderSections(before.sections)}
            after={renderSections(after.sections)}
            beforeLabel={before.label}
            afterLabel={after.label}
          />
          {before.id !== CURRENT_OPTION_ID ? (
            <div className="page-footer">
              <button type="button" className="primary" onClick={() => onRestore(before.id)}>
                Restore "{before.label}"
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <p className="empty">Snapshot a version first to compare.</p>
      )}
    </section>
  );
}

interface ComparableSnapshot {
  id: string;
  label: string;
  sections: Section[];
}

function pickSnapshot(
  id: string | null,
  versions: Version[],
  current: Section[],
): ComparableSnapshot | null {
  if (!id) return null;
  if (id === CURRENT_OPTION_ID) {
    return { id, label: 'Current draft', sections: current };
  }
  const v = versions.find((x) => x.id === id);
  if (!v) return null;
  return { id: v.id, label: v.label, sections: v.sections };
}

function renderSections(sections: Section[]): string {
  return sections
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((s) => `## ${s.title}\n\n${s.body_md.trim()}`)
    .join('\n\n');
}
