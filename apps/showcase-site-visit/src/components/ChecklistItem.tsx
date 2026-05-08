/**
 * One row in the checklist. Status toggles, photo strip, freeform
 * notes. A row never sits on a single line — the inspector can scroll
 * through ten items on a phone screen and tap-tap-tap.
 */

import { useState } from 'react';
import type { ShippieLocalFiles } from '@shippie/local-runtime-contract';
import type { Check, CheckStatus } from '../db/schema.ts';
import { PhotoCapture } from './PhotoCapture.tsx';

const STATUS_OPTIONS: ReadonlyArray<{ value: CheckStatus; label: string; tone: string }> = [
  { value: 'pass', label: 'Pass', tone: 'pass' },
  { value: 'fail', label: 'Fail', tone: 'fail' },
  { value: 'na', label: 'N/A', tone: 'na' },
  { value: 'needs-attention', label: 'Attention', tone: 'attn' },
];

export interface ChecklistItemProps {
  check: Check;
  files: ShippieLocalFiles | null;
  disabled: boolean;
  onSetStatus: (status: CheckStatus) => void;
  onSetNotes: (notes: string) => void;
  onAddPhoto: (path: string) => void;
  onRemovePhoto: (path: string) => void;
  onDelete: () => void;
}

export function ChecklistItem(props: ChecklistItemProps) {
  const { check, files, disabled, onSetStatus, onSetNotes, onAddPhoto, onRemovePhoto, onDelete } = props;
  const [openNotes, setOpenNotes] = useState<boolean>(Boolean(check.notes));

  return (
    <li className={`check check--${check.status}`}>
      <div className="check__head">
        <span className="check__label">{check.label}</span>
        {!disabled ? (
          <button type="button" className="link-button check__delete" onClick={onDelete} aria-label={`delete ${check.label}`}>
            remove
          </button>
        ) : null}
      </div>

      <div className="check__statuses" role="radiogroup" aria-label={`status for ${check.label}`}>
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={check.status === opt.value}
            disabled={disabled}
            className={`status-pill status-pill--${opt.tone} ${check.status === opt.value ? 'is-active' : ''}`}
            onClick={() => onSetStatus(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <PhotoCapture
        files={files}
        paths={check.photo_paths}
        onAdd={onAddPhoto}
        onRemove={onRemovePhoto}
        prefix={`checks/${check.visit_id}/${check.id}`}
      />

      {openNotes || check.notes ? (
        <textarea
          className="check__notes"
          value={check.notes ?? ''}
          onChange={(e) => onSetNotes(e.target.value)}
          placeholder="notes — site conditions, exact reading, follow-up trade"
          disabled={disabled}
          rows={2}
        />
      ) : (
        <button
          type="button"
          className="link-button"
          onClick={() => setOpenNotes(true)}
          disabled={disabled}
        >
          add note
        </button>
      )}
    </li>
  );
}
