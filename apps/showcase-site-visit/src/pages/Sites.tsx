/**
 * Sites — the address book. Search + create + tap-through to
 * site history. Order alphabetical so muscle memory holds.
 */

import { useState } from 'react';
import type { Site } from '../db/schema.ts';
import { SiteCard } from '../components/SiteCard.tsx';

export interface SitesProps {
  sites: ReadonlyArray<Site>;
  visitCounts: Map<string, number>;
  onOpenSite: (siteId: string) => void;
  onCreateSite: (input: {
    name: string;
    address: string;
    contact_name: string;
    contact_phone: string;
  }) => void;
}

export function Sites({ sites, visitCounts, onOpenSite, onCreateSite }: SitesProps) {
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');

  const filtered = query.trim()
    ? sites.filter((s) =>
        [s.name, s.address ?? '', s.contact_name ?? '']
          .join(' ')
          .toLowerCase()
          .includes(query.toLowerCase()),
      )
    : sites;

  function reset() {
    setName('');
    setAddress('');
    setContactName('');
    setContactPhone('');
    setAdding(false);
  }

  function save() {
    if (!name.trim()) return;
    onCreateSite({
      name: name.trim(),
      address: address.trim(),
      contact_name: contactName.trim(),
      contact_phone: contactPhone.trim(),
    });
    reset();
  }

  return (
    <section className="page">
      <header className="page-header">
        <h1>Sites</h1>
      </header>

      <div className="search-row">
        <input
          className="text-input"
          type="search"
          placeholder="search by name or address"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {!adding ? (
          <button type="button" className="primary" onClick={() => setAdding(true)}>
            + site
          </button>
        ) : null}
      </div>

      {adding ? (
        <div className="form-card">
          <input
            className="text-input"
            placeholder="site name (eg. 15 Mariners Walk)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <input
            className="text-input"
            placeholder="full address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
          <input
            className="text-input"
            placeholder="on-site contact"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
          />
          <input
            className="text-input"
            placeholder="phone"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            inputMode="tel"
          />
          <div className="form-card__actions">
            <button type="button" className="link-button" onClick={reset}>
              cancel
            </button>
            <button type="button" className="primary" disabled={!name.trim()} onClick={save}>
              save site
            </button>
          </div>
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <p className="empty-state">
          {sites.length === 0
            ? 'No sites yet — add the first one.'
            : 'Nothing matches that search.'}
        </p>
      ) : (
        <div className="card-stack">
          {filtered.map((s) => (
            <SiteCard
              key={s.id}
              site={s}
              visitCount={visitCounts.get(s.id) ?? 0}
              onOpen={() => onOpenSite(s.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
