/**
 * Active or past visit. Top: site + status + ended timestamp. Middle:
 * checklist (the bulk of the work). Section: incidents. Footer:
 * signature pad + submit. Submit is gated through `canSubmit`.
 */

import { useState } from 'react';
import type { ShippieLocalFiles } from '@shippie/local-runtime-contract';
import type { Check, Incident, Site, Visit } from '../db/schema.ts';
import type { CheckStatus } from '../db/schema.ts';
import { ChecklistItem } from '../components/ChecklistItem.tsx';
import { IncidentForm, type IncidentDraft } from '../components/IncidentForm.tsx';
import { SignaturePad } from '../components/SignaturePad.tsx';
import { canSubmit, hasOpenIssues, summariseCompletion } from '../lib/visit-status.ts';

export interface VisitPageProps {
  visit: Visit;
  site: Site | null;
  checks: ReadonlyArray<Check>;
  incidents: ReadonlyArray<Incident>;
  files: ShippieLocalFiles | null;
  onBack: () => void;
  onAddCheck: (label: string) => void;
  onSetCheckStatus: (checkId: string, status: CheckStatus) => void;
  onSetCheckNotes: (checkId: string, notes: string) => void;
  onAddCheckPhoto: (checkId: string, path: string) => void;
  onRemoveCheckPhoto: (checkId: string, path: string) => void;
  onDeleteCheck: (checkId: string) => void;
  onAddIncident: (draft: IncidentDraft) => void;
  onDeleteIncident: (id: string) => void;
  onSetSignature: (svg: string | null) => void;
  onSubmit: () => void;
  onReopen: () => void;
  onPrint: () => void;
  onDeleteVisit: () => void;
}

export function VisitPage(props: VisitPageProps) {
  const {
    visit,
    site,
    checks,
    incidents,
    files,
    onBack,
    onAddCheck,
    onSetCheckStatus,
    onSetCheckNotes,
    onAddCheckPhoto,
    onRemoveCheckPhoto,
    onDeleteCheck,
    onAddIncident,
    onDeleteIncident,
    onSetSignature,
    onSubmit,
    onReopen,
    onPrint,
    onDeleteVisit,
  } = props;

  const [newCheck, setNewCheck] = useState('');
  const [showIncident, setShowIncident] = useState(false);

  const submitGate = canSubmit(visit, checks);
  const summary = summariseCompletion(checks);
  const issues = hasOpenIssues(checks);
  const locked = visit.status === 'submitted';

  function addCheck() {
    const trimmed = newCheck.trim();
    if (!trimmed) return;
    onAddCheck(trimmed);
    setNewCheck('');
  }

  return (
    <section className="page">
      <header className="page-header">
        <button type="button" className="link-button" onClick={onBack}>
          ← back
        </button>
        <span className={`status-tag status-tag--${visit.status}`}>
          {visit.status === 'in-progress' ? 'in progress' : visit.status}
        </span>
      </header>

      <div className="visit-summary">
        <h1>{site?.name ?? 'Visit'}</h1>
        {site?.address ? <p className="muted">{site.address}</p> : null}
        <p className="muted">
          {summary.done}/{summary.total} checked
          {issues ? ' · open issue' : ''}
          {visit.weather ? ` · ${visit.weather}` : ''}
          {visit.inspector_name ? ` · ${visit.inspector_name}` : ''}
        </p>
      </div>

      <section className="page-section">
        <h2 className="page-section__title">checklist</h2>
        {checks.length === 0 ? (
          <p className="empty-state">No checks yet — add the first below.</p>
        ) : (
          <ul className="checklist">
            {checks.map((c) => (
              <ChecklistItem
                key={c.id}
                check={c}
                files={files}
                disabled={locked}
                onSetStatus={(s) => onSetCheckStatus(c.id, s)}
                onSetNotes={(n) => onSetCheckNotes(c.id, n)}
                onAddPhoto={(p) => onAddCheckPhoto(c.id, p)}
                onRemovePhoto={(p) => onRemoveCheckPhoto(c.id, p)}
                onDelete={() => onDeleteCheck(c.id)}
              />
            ))}
          </ul>
        )}

        {!locked ? (
          <div className="add-check-row">
            <input
              className="text-input"
              value={newCheck}
              onChange={(e) => setNewCheck(e.target.value)}
              placeholder="add a check (eg. emergency lighting)"
              onKeyDown={(e) => {
                if (e.key === 'Enter') addCheck();
              }}
            />
            <button type="button" className="primary" disabled={!newCheck.trim()} onClick={addCheck}>
              + add
            </button>
          </div>
        ) : null}
      </section>

      <section className="page-section">
        <div className="page-section__head-row">
          <h2 className="page-section__title">incidents</h2>
          {!locked ? (
            <button
              type="button"
              className="link-button"
              onClick={() => setShowIncident((v) => !v)}
            >
              {showIncident ? 'cancel' : '+ log'}
            </button>
          ) : null}
        </div>
        {showIncident && !locked ? (
          <IncidentForm
            files={files}
            visitId={visit.id}
            onCreate={(draft) => {
              onAddIncident(draft);
              setShowIncident(false);
            }}
          />
        ) : null}
        {incidents.length === 0 ? (
          <p className="empty-state">No incidents logged.</p>
        ) : (
          <ul className="incident-list">
            {incidents.map((i) => (
              <li key={i.id} className={`incident incident--${i.severity}`}>
                <div className="incident__head">
                  <span className={`severity severity--${i.severity}`}>{i.severity}</span>
                  {i.follow_up ? <span className="incident__follow">follow-up</span> : null}
                  {!locked ? (
                    <button
                      type="button"
                      className="link-button danger"
                      onClick={() => onDeleteIncident(i.id)}
                    >
                      remove
                    </button>
                  ) : null}
                </div>
                <p className="incident__desc">{i.description}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="page-section">
        <h2 className="page-section__title">signature</h2>
        <SignaturePad initialSvg={visit.signature_svg ?? null} onChange={onSetSignature} />
      </section>

      <footer className="visit-footer">
        {locked ? (
          <>
            <button type="button" className="primary" onClick={onPrint}>
              Print for record
            </button>
            <button type="button" className="link-button" onClick={onReopen}>
              reopen + amend
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="primary primary--big"
              disabled={!submitGate.canSubmit}
              onClick={onSubmit}
              title={submitGate.reason ?? 'submit visit'}
            >
              {visit.status === 'amended' ? 'Resubmit' : 'Submit'}
            </button>
            {submitGate.reason ? <p className="hint">{submitGate.reason}</p> : null}
            <button type="button" className="link-button" onClick={onPrint}>
              preview as PDF
            </button>
            <button
              type="button"
              className="link-button danger"
              onClick={() => {
                if (confirm('Delete this draft visit?')) onDeleteVisit();
              }}
            >
              delete draft
            </button>
          </>
        )}
      </footer>
    </section>
  );
}
