import { useState } from 'react';
import { TemplatePicker } from '../components/TemplatePicker.tsx';
import { BriefInput } from '../components/BriefInput.tsx';
import { templateFor, type PitchType } from '../lib/templates.ts';

export interface NewPitchPayload {
  type: PitchType;
  title: string;
  target: string;
  deadline: string;
  brief: string;
}

export interface NewPitchPageProps {
  onCreate: (payload: NewPitchPayload) => void;
  onCancel: () => void;
}

type Step = 'template' | 'details';

export function NewPitchPage({ onCreate, onCancel }: NewPitchPageProps) {
  const [step, setStep] = useState<Step>('template');
  const [type, setType] = useState<PitchType>('grant');
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState('');
  const [deadline, setDeadline] = useState('');
  const [brief, setBrief] = useState('');

  const tmpl = templateFor(type);

  function submit() {
    if (title.trim().length === 0) return;
    onCreate({ type, title: title.trim(), target: target.trim(), deadline, brief });
  }

  if (step === 'template') {
    return (
      <section className="page">
        <header className="page-header">
          <h2>New pitch</h2>
          <button type="button" className="ghost" onClick={onCancel}>
            Cancel
          </button>
        </header>
        <p className="muted small">Pick a starting shape. You can edit, reorder, or remove sections later.</p>
        <TemplatePicker selected={type} onSelect={setType} />
        <div className="page-footer">
          <button type="button" className="primary" onClick={() => setStep('details')}>
            Continue · {tmpl.name}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="page">
      <header className="page-header">
        <h2>{tmpl.name}</h2>
        <button type="button" className="ghost" onClick={() => setStep('template')}>
          Back
        </button>
      </header>
      <div className="field">
        <span>Title</span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={
            type === 'grant'
              ? 'FarmConnect → Ford Foundation'
              : type === 'rfp'
                ? 'ACME Corp · checkout redesign'
                : type === 'sponsorship'
                  ? 'Patagonia · Q3 conference'
                  : 'Working title'
          }
        />
      </div>
      <div className="field-row">
        <div className="field">
          <span>Target</span>
          <input
            type="text"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder={type === 'rfp' || type === 'proposal' ? 'Client name' : 'Funder or sponsor'}
          />
        </div>
        <div className="field">
          <span>Deadline</span>
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
        </div>
      </div>
      <BriefInput value={brief} onChange={setBrief} onSave={submit} />
      <div className="page-footer">
        <button
          type="button"
          className="primary"
          onClick={submit}
          disabled={title.trim().length === 0}
        >
          Create pitch
        </button>
      </div>
    </section>
  );
}
