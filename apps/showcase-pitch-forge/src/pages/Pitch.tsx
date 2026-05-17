import { useMemo, useState } from 'react';
import { MarkdownEditor } from '../components/MarkdownEditor.tsx';
import { SectionList } from '../components/SectionList.tsx';
import { DraftAssistant } from '../components/DraftAssistant.tsx';
import { BriefInput } from '../components/BriefInput.tsx';
import {
  PITCH_STATUSES,
  PITCH_STATUS_LABEL,
  type Pitch,
  type Section,
} from '../lib/store.ts';
import { PITCH_TYPE_LABEL, SECTION_KIND_LABEL, type SectionKind } from '../lib/templates.ts';

export interface PitchPageProps {
  pitch: Pitch;
  sections: Section[];
  brief: string;
  onUpdatePitch: (patch: Partial<Pitch>) => void;
  onUpdateSection: (id: string, patch: Partial<Section>) => void;
  onAddSection: (title: string, kind: SectionKind) => void;
  onRemoveSection: (id: string) => void;
  onReorderSections: (orderedIds: string[]) => void;
  onSaveBrief: (brief: string) => void;
  onSnapshot: (label?: string) => void;
  onPrint: () => void;
  onVersions: () => void;
  onSent: () => void;
  onBack: () => void;
}

export function PitchPage({
  pitch,
  sections,
  brief,
  onUpdatePitch,
  onUpdateSection,
  onAddSection,
  onRemoveSection,
  onReorderSections,
  onSaveBrief,
  onSnapshot,
  onPrint,
  onVersions,
  onSent,
  onBack,
}: PitchPageProps) {
  const [selectedId, setSelectedId] = useState<string | null>(sections[0]?.id ?? null);
  const [briefDraft, setBriefDraft] = useState(brief);
  const [showBrief, setShowBrief] = useState(false);
  const [snapshotLabel, setSnapshotLabel] = useState('');
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [newSectionKind, setNewSectionKind] = useState<SectionKind>('custom');

  const selected = useMemo(
    () => sections.find((s) => s.id === selectedId) ?? null,
    [sections, selectedId],
  );

  function onApplyDraft(text: string, source: 'ai' | 'fallback') {
    if (!selected) return;
    onUpdateSection(selected.id, { body_md: text });
    void source; // surfaced inside DraftAssistant; pitch page doesn't need it
  }

  return (
    <section className="page">
      <header className="page-header">
        <button type="button" className="ghost" onClick={onBack}>
          ← All pitches
        </button>
        <button type="button" className="ghost" onClick={onPrint}>
          Print / PDF
        </button>
      </header>

      <div className="pitch-summary">
        <input
          className="pitch-title-input"
          type="text"
          value={pitch.title}
          onChange={(e) => onUpdatePitch({ title: e.target.value })}
          placeholder="Pitch title"
        />
        <p className="muted small">
          {PITCH_TYPE_LABEL[pitch.type]}
          {pitch.target ? ` · ${pitch.target}` : ''}
          {pitch.deadline ? ` · due ${pitch.deadline}` : ''}
        </p>
        <div className="field-row">
          <div className="field">
            <span>Target</span>
            <input
              type="text"
              value={pitch.target}
              onChange={(e) => onUpdatePitch({ target: e.target.value })}
            />
          </div>
          <div className="field">
            <span>Deadline</span>
            <input
              type="date"
              value={pitch.deadline}
              onChange={(e) => onUpdatePitch({ deadline: e.target.value })}
            />
          </div>
          <div className="field">
            <span>Status</span>
            <select
              value={pitch.status}
              onChange={(e) => {
                const next = e.target.value as Pitch['status'];
                onUpdatePitch({ status: next });
                if (next === 'sent') onSent();
              }}
            >
              {PITCH_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {PITCH_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="brief-toggle">
        <button
          type="button"
          className="ghost small"
          onClick={() => {
            setBriefDraft(brief);
            setShowBrief((v) => !v);
          }}
        >
          {showBrief ? 'Hide brief' : 'Show brief'} ({wordCount(brief)} words)
        </button>
      </div>
      {showBrief ? (
        <BriefInput
          value={briefDraft}
          onChange={setBriefDraft}
          onSave={() => {
            onSaveBrief(briefDraft);
            setShowBrief(false);
          }}
        />
      ) : null}

      <div className="pitch-grid">
        <div className="pitch-sections">
          <h3>Sections</h3>
          <SectionList
            sections={sections}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onReorder={onReorderSections}
            onDelete={(id) => {
              onRemoveSection(id);
              if (selectedId === id) setSelectedId(null);
            }}
          />
          <div className="add-section">
            <input
              type="text"
              placeholder="Section title"
              value={newSectionTitle}
              onChange={(e) => setNewSectionTitle(e.target.value)}
            />
            <select
              value={newSectionKind}
              onChange={(e) => setNewSectionKind(e.target.value as SectionKind)}
            >
              {(Object.keys(SECTION_KIND_LABEL) as SectionKind[]).map((k) => (
                <option key={k} value={k}>
                  {SECTION_KIND_LABEL[k]}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                if (newSectionTitle.trim().length === 0) return;
                onAddSection(newSectionTitle.trim(), newSectionKind);
                setNewSectionTitle('');
              }}
            >
              Add
            </button>
          </div>
        </div>

        <div className="pitch-editor">
          {selected ? (
            <>
              <header className="editor-head">
                <input
                  className="section-title-input"
                  type="text"
                  value={selected.title}
                  onChange={(e) => onUpdateSection(selected.id, { title: e.target.value })}
                />
                <span className="muted small">{SECTION_KIND_LABEL[selected.kind]}</span>
              </header>
              <MarkdownEditor
                value={selected.body_md}
                onChange={(value) => onUpdateSection(selected.id, { body_md: value })}
                placeholder={`Draft your ${SECTION_KIND_LABEL[selected.kind].toLowerCase()} in markdown…`}
              />
              <DraftAssistant
                brief={brief}
                kind={selected.kind}
                title={selected.title}
                currentBody={selected.body_md}
                onApply={onApplyDraft}
              />
            </>
          ) : (
            <p className="empty">Pick a section to edit, or add one.</p>
          )}
        </div>
      </div>

      <div className="snapshot-bar">
        <input
          type="text"
          placeholder="Version label (optional)"
          value={snapshotLabel}
          onChange={(e) => setSnapshotLabel(e.target.value)}
        />
        <button
          type="button"
          className="primary"
          onClick={() => {
            onSnapshot(snapshotLabel.trim() || undefined);
            setSnapshotLabel('');
          }}
        >
          Snapshot version
        </button>
        <button type="button" className="ghost" onClick={onVersions}>
          Versions
        </button>
      </div>
    </section>
  );
}

function wordCount(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}
