/**
 * Capture an incident: severity, description, optional photo, follow-up
 * flag. Incidents are deliberately separate from checks — a check is
 * routine ("smoke alarm: pass"); an incident is something that needs
 * escalating ("CO alarm missing in boiler room — high, follow-up").
 */

import { useState } from 'react';
import type { ShippieLocalFiles } from '@shippie/local-runtime-contract';
import type { IncidentSeverity } from '../db/schema.ts';
import { PhotoCapture } from './PhotoCapture.tsx';

export interface IncidentDraft {
  severity: IncidentSeverity;
  description: string;
  photo_path: string | null;
  follow_up: boolean;
}

export interface IncidentFormProps {
  files: ShippieLocalFiles | null;
  visitId: string;
  onCreate: (draft: IncidentDraft) => void;
}

const SEVERITIES: ReadonlyArray<{ value: IncidentSeverity; label: string }> = [
  { value: 'low', label: 'Low' },
  { value: 'med', label: 'Medium' },
  { value: 'high', label: 'High' },
];

export function IncidentForm({ files, visitId, onCreate }: IncidentFormProps) {
  const [severity, setSeverity] = useState<IncidentSeverity>('med');
  const [description, setDescription] = useState<string>('');
  const [followUp, setFollowUp] = useState<boolean>(true);
  const [photoPath, setPhotoPath] = useState<string | null>(null);

  function reset() {
    setSeverity('med');
    setDescription('');
    setFollowUp(true);
    setPhotoPath(null);
  }

  function submit() {
    if (!description.trim()) return;
    onCreate({ severity, description: description.trim(), photo_path: photoPath, follow_up: followUp });
    reset();
  }

  return (
    <div className="incident-form">
      <div className="incident-form__row">
        <span className="field-label">severity</span>
        <div className="status-pills">
          {SEVERITIES.map((s) => (
            <button
              key={s.value}
              type="button"
              className={`status-pill status-pill--${s.value} ${severity === s.value ? 'is-active' : ''}`}
              onClick={() => setSeverity(s.value)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <textarea
        className="incident-form__desc"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="what's wrong, where, what's the recommended fix"
        rows={3}
      />

      <PhotoCapture
        files={files}
        paths={photoPath ? [photoPath] : []}
        onAdd={(p) => setPhotoPath(p)}
        onRemove={() => setPhotoPath(null)}
        prefix={`incidents/${visitId}`}
      />

      <label className="incident-form__follow-up">
        <input type="checkbox" checked={followUp} onChange={(e) => setFollowUp(e.target.checked)} />
        <span>follow-up needed</span>
      </label>

      <button
        type="button"
        className="primary"
        disabled={!description.trim()}
        onClick={submit}
      >
        log incident
      </button>
    </div>
  );
}
