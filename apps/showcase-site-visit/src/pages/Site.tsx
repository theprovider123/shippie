/**
 * Single-site page. Address + contact at the top, "start a visit"
 * button, then visit history. From here the inspector either pulls up
 * the last walkthrough for context or kicks off a new one.
 */

import { useState } from 'react';
import type { Site, Visit } from '../db/schema.ts';
import { TEMPLATES, type TemplateId } from '../lib/templates.ts';
import { VisitCard } from '../components/VisitCard.tsx';

export interface SitePageProps {
  site: Site;
  visits: ReadonlyArray<Visit>;
  visitHasIssues: (visitId: string) => boolean;
  onBack: () => void;
  onOpenVisit: (visitId: string) => void;
  onStartVisit: (input: { templateId: TemplateId | 'blank'; weather: string }) => void;
  onUpdateSite: (patch: Partial<Site>) => void;
  onDeleteSite: () => void;
}

export function SitePage({
  site,
  visits,
  visitHasIssues,
  onBack,
  onOpenVisit,
  onStartVisit,
  onUpdateSite,
  onDeleteSite,
}: SitePageProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(site.name);
  const [address, setAddress] = useState(site.address ?? '');
  const [contactName, setContactName] = useState(site.contact_name ?? '');
  const [contactPhone, setContactPhone] = useState(site.contact_phone ?? '');

  const [picking, setPicking] = useState(false);
  const [templateId, setTemplateId] = useState<TemplateId | 'blank'>('fire-safety');
  const [weather, setWeather] = useState('');

  function saveEdit() {
    onUpdateSite({
      name: name.trim() || site.name,
      address: address.trim() || null,
      contact_name: contactName.trim() || null,
      contact_phone: contactPhone.trim() || null,
    });
    setEditing(false);
  }

  function startVisit() {
    onStartVisit({ templateId, weather: weather.trim() });
    setPicking(false);
    setWeather('');
  }

  return (
    <section className="page">
      <header className="page-header">
        <button type="button" className="link-button" onClick={onBack}>
          ← back
        </button>
        <button type="button" className="link-button" onClick={() => setEditing((v) => !v)}>
          {editing ? 'cancel' : 'edit'}
        </button>
      </header>

      {editing ? (
        <div className="form-card">
          <input className="text-input" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="text-input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="address" />
          <input className="text-input" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="on-site contact" />
          <input
            className="text-input"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            placeholder="phone"
            inputMode="tel"
          />
          <div className="form-card__actions">
            <button
              type="button"
              className="link-button danger"
              onClick={() => {
                if (confirm('Delete this site and every visit you logged for it?')) onDeleteSite();
              }}
            >
              delete site
            </button>
            <button type="button" className="primary" onClick={saveEdit}>
              save
            </button>
          </div>
        </div>
      ) : (
        <div className="site-summary">
          <h1>{site.name}</h1>
          {site.address ? <p className="muted">{site.address}</p> : null}
          {site.contact_name || site.contact_phone ? (
            <p className="muted">
              {site.contact_name ?? ''}
              {site.contact_name && site.contact_phone ? ' · ' : ''}
              {site.contact_phone ? <a href={`tel:${site.contact_phone}`}>{site.contact_phone}</a> : null}
            </p>
          ) : null}
        </div>
      )}

      {!picking ? (
        <button type="button" className="primary primary--big" onClick={() => setPicking(true)}>
          Start a visit
        </button>
      ) : (
        <div className="form-card">
          <span className="field-label">checklist</span>
          <select
            className="select-input"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value as TemplateId | 'blank')}
          >
            {TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
            <option value="blank">Blank — I'll add my own</option>
          </select>

          <input
            className="text-input"
            value={weather}
            onChange={(e) => setWeather(e.target.value)}
            placeholder="weather (optional)"
          />
          <div className="form-card__actions">
            <button type="button" className="link-button" onClick={() => setPicking(false)}>
              cancel
            </button>
            <button type="button" className="primary" onClick={startVisit}>
              go
            </button>
          </div>
        </div>
      )}

      <section className="page-section">
        <h2 className="page-section__title">visit history</h2>
        {visits.length === 0 ? (
          <p className="empty-state">No visits yet.</p>
        ) : (
          <div className="card-stack">
            {visits.map((v) => (
              <VisitCard
                key={v.id}
                visit={v}
                site={site}
                hasIssues={visitHasIssues(v.id)}
                onOpen={() => onOpenVisit(v.id)}
              />
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
