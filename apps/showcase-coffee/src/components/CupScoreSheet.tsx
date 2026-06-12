// "Log a cup" — the five-axis score sheet. Quick score without a full brew
// session, or attached to a just-finished brew.

import { useState } from 'react';
import { C, F } from '../tokens.ts';
import { CUP_AXES, CUP_AXIS_LABELS, type Bag, type CupAxis, type CupScore } from '../types.ts';
import { Sheet } from './Sheet.tsx';
import { Chip, primaryBtnStyle } from './form.tsx';

const TASTE_SUGGESTIONS = [
  'floral', 'citric', 'berry', 'stone fruit', 'tropical', 'chocolate',
  'caramel', 'nutty', 'winey', 'tea-like', 'jasmine', 'honey', 'spice', 'clean',
];

export interface CupScoreDraft {
  axes: Record<CupAxis, number>;
  tasteNotes: string[];
  publish: boolean;
}

export interface CupScoreSheetProps {
  bag: Bag;
  brewLogId?: string;
  onClose: () => void;
  onSave: (draft: CupScoreDraft) => void;
}

const START: Record<CupAxis, number> = { brightness: 6, body: 6, sweetness: 6, complexity: 6, clean: 6 };

export function CupScoreSheet({ bag, onClose, onSave }: CupScoreSheetProps) {
  const [axes, setAxes] = useState<Record<CupAxis, number>>(START);
  const [notes, setNotes] = useState<string[]>([]);
  const [publish, setPublish] = useState(false);

  const toggleNote = (n: string) =>
    setNotes((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]));

  return (
    <Sheet title="Log a cup" onClose={onClose} meta={bag.name}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 18 }}>
        {CUP_AXES.map((axis) => (
          <div key={axis}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <span style={{ fontFamily: F.sans, fontSize: 12, color: C.espressoMid }}>{CUP_AXIS_LABELS[axis]}</span>
              <span style={{ fontFamily: F.mono, fontSize: 13, color: C.terracotta }}>{axes[axis]}</span>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={axes[axis]}
              onChange={(e) => setAxes((prev) => ({ ...prev, [axis]: Number(e.target.value) }))}
              aria-label={CUP_AXIS_LABELS[axis]}
              style={{ width: '100%', accentColor: C.terracotta, height: 32, display: 'block' }}
            />
          </div>
        ))}
      </div>

      <div style={{ fontFamily: F.sans, fontSize: 9, letterSpacing: '0.09em', textTransform: 'uppercase', color: C.espressoLight, marginBottom: 8 }}>
        Taste notes
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 18 }}>
        {TASTE_SUGGESTIONS.map((n) => (
          <Chip key={n} active={notes.includes(n)} onClick={() => toggleNote(n)}>
            {n}
          </Chip>
        ))}
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, cursor: 'pointer', minHeight: 44 }}>
        <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} style={{ accentColor: C.sage, width: 16, height: 16 }} />
        <span style={{ fontFamily: F.sans, fontSize: 13, color: C.espressoMid }}>
          Publish anonymously to the community cup score
        </span>
      </label>

      <button type="button" onClick={() => onSave({ axes, tasteNotes: notes, publish })} style={primaryBtnStyle('sage')}>
        Save score
      </button>
    </Sheet>
  );
}

/** Build a CupScore record from a draft. */
export function draftToScore(
  draft: CupScoreDraft,
  bagId: string,
  ids: { id: string; createdAt: string },
  brewLogId?: string,
): CupScore {
  return {
    id: ids.id,
    bagId,
    brewLogId,
    brightness: draft.axes.brightness,
    body: draft.axes.body,
    sweetness: draft.axes.sweetness,
    complexity: draft.axes.complexity,
    clean: draft.axes.clean,
    tasteNotes: draft.tasteNotes,
    published: draft.publish,
    publishedAt: draft.publish ? ids.createdAt : undefined,
    createdAt: ids.createdAt,
  };
}
