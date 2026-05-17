/**
 * Site Visit shell. Five-tab top-level nav (Home / Sites / Templates /
 * Settings) with two depth pages reachable from cards (Site detail and
 * Visit detail). PrintView is opened from a Visit and displays a
 * print-CSS friendly read model.
 *
 * State lives in React; the canonical store is the local DB. We
 * reload after every mutation rather than maintain a clever cache —
 * this app is small enough that the safe simplicity wins.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { createLocalFiles } from '@shippie/local-files';
import { createLocalNavigation } from '@shippie/sdk/wrapper';
import type {
  ShippieLocalDb,
  ShippieLocalFiles,
} from '@shippie/local-runtime-contract';

import { resolveLocalDb } from './db/runtime.ts';
import {
  addCheck,
  addIncident,
  addManyChecks,
  createSite,
  createVisit,
  deleteCheck,
  deleteIncident,
  deleteSavedTemplate,
  deleteSite,
  deleteVisit,
  ensureSchema,
  listChecksForVisit,
  listIncidentsForVisit,
  listSavedTemplates,
  listSites,
  listVisits,
  saveTemplate,
  updateCheck,
  updateSite,
  updateVisit,
} from './db/store.ts';
import type {
  Check,
  CheckStatus,
  Incident,
  SavedTemplate,
  Site,
  Visit,
} from './db/schema.ts';
import { TEMPLATES, templateChecks, type TemplateId } from './lib/templates.ts';
import { buildPdfPayload } from './lib/pdf-data.ts';
import { hasOpenIssues, nextStatus } from './lib/visit-status.ts';
import { isMeaningfulSignature } from './lib/signature.ts';

import { Home } from './pages/Home.tsx';
import { Sites } from './pages/Sites.tsx';
import { SitePage } from './pages/Site.tsx';
import { VisitPage } from './pages/Visit.tsx';
import { TemplatesPage } from './pages/Templates.tsx';
import { PrintView } from './pages/PrintView.tsx';
import { SettingsPage, type InspectorIdentity } from './pages/Settings.tsx';
import { SyncStatus } from './components/SyncStatus.tsx';
import type { IncidentDraft } from './components/IncidentForm.tsx';

const shippie = createShippieIframeSdk({ appId: 'app_site_visit' });

type Tab = 'home' | 'sites' | 'templates' | 'settings';
type View =
  | { kind: 'tabs' }
  | { kind: 'site'; siteId: string }
  | { kind: 'visit'; visitId: string }
  | { kind: 'print'; visitId: string };

interface Screen {
  tab: Tab;
  view: View;
}

const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: 'home', label: 'Home' },
  { id: 'sites', label: 'Sites' },
  { id: 'templates', label: 'Templates' },
  { id: 'settings', label: 'Settings' },
];

const IDENTITY_KEY = 'shippie.site-visit.identity.v1';

function loadIdentity(): InspectorIdentity {
  if (typeof localStorage === 'undefined') return { name: '', role: '' };
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    if (!raw) return { name: '', role: '' };
    const parsed = JSON.parse(raw);
    return {
      name: typeof parsed.name === 'string' ? parsed.name : '',
      role: typeof parsed.role === 'string' ? parsed.role : '',
    };
  } catch {
    return { name: '', role: '' };
  }
}

function saveIdentity(identity: InspectorIdentity) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
  } catch {
    // ignore storage quota
  }
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function sameView(a: View, b: View): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'site' && b.kind === 'site') return a.siteId === b.siteId;
  if (a.kind === 'visit' && b.kind === 'visit') return a.visitId === b.visitId;
  if (a.kind === 'print' && b.kind === 'print') return a.visitId === b.visitId;
  return true;
}

function sameScreen(a: Screen, b: Screen): boolean {
  return a.tab === b.tab && sameView(a.view, b.view);
}

export function App() {
  const dbRef = useRef<ShippieLocalDb | null>(null);
  const [files, setFiles] = useState<ShippieLocalFiles | null>(null);

  const [tab, setTab] = useState<Tab>('home');
  const [view, setView] = useState<View>({ kind: 'tabs' });
  const localNavigation = useMemo(
    () =>
      createLocalNavigation<Screen>(
        { tab: 'home', view: { kind: 'tabs' } },
        (next) => {
          setTab(next.tab);
          setView(next.view);
        },
        { isEqual: sameScreen },
      ),
    [],
  );

  const [sites, setSites] = useState<Site[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [checksByVisit, setChecksByVisit] = useState<Record<string, Check[]>>({});
  const [incidentsByVisit, setIncidentsByVisit] = useState<Record<string, Incident[]>>({});
  const [savedTemplates, setSavedTemplates] = useState<SavedTemplate[]>([]);
  const [identity, setIdentity] = useState<InspectorIdentity>(() => loadIdentity());
  const [ready, setReady] = useState(false);

  // Boot — resolve DB and OPFS, prime the schema, hydrate state.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const db = resolveLocalDb();
      dbRef.current = db;
      await ensureSchema(db);
      try {
        const f = await createLocalFiles();
        if (!cancelled) setFiles(f);
      } catch {
        // OPFS unavailable — photos will surface a clear error in PhotoCapture.
      }
      const [allSites, allVisits, allTemplates] = await Promise.all([
        listSites(db),
        listVisits(db),
        listSavedTemplates(db),
      ]);
      if (cancelled) return;
      setSites(allSites);
      setVisits(allVisits);
      setSavedTemplates(allTemplates);

      // Prime checks + incidents for every visit so cards can flag open issues.
      const checks: Record<string, Check[]> = {};
      const incidents: Record<string, Incident[]> = {};
      for (const v of allVisits) {
        checks[v.id] = await listChecksForVisit(db, v.id);
        incidents[v.id] = await listIncidentsForVisit(db, v.id);
      }
      if (cancelled) return;
      setChecksByVisit(checks);
      setIncidentsByVisit(incidents);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => () => localNavigation.destroy(), [localNavigation]);

  function navigate(next: Screen, kind: 'crossfade' | 'rise' = 'crossfade'): void {
    void localNavigation.navigate(next, { kind });
  }

  function closeTo(fallback: Screen): void {
    void localNavigation.backOrReplace(fallback, { kind: 'crossfade' });
  }

  function replaceWith(next: Screen): void {
    void localNavigation.replace(next, { kind: 'crossfade' });
  }

  const sitesById = useMemo(() => {
    const map = new Map<string, Site>();
    for (const s of sites) map.set(s.id, s);
    return map;
  }, [sites]);

  const visitCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of visits) map.set(v.site_id, (map.get(v.site_id) ?? 0) + 1);
    return map;
  }, [visits]);

  function visitHasIssues(visitId: string): boolean {
    return hasOpenIssues(checksByVisit[visitId] ?? []);
  }

  // ------------------------------------------------------------------
  // Mutations — every helper writes to the DB then reloads its slice
  // ------------------------------------------------------------------

  async function refreshVisit(visitId: string) {
    const db = dbRef.current;
    if (!db) return;
    const [c, i] = await Promise.all([
      listChecksForVisit(db, visitId),
      listIncidentsForVisit(db, visitId),
    ]);
    setChecksByVisit((prev) => ({ ...prev, [visitId]: c }));
    setIncidentsByVisit((prev) => ({ ...prev, [visitId]: i }));
  }

  async function reloadVisits() {
    const db = dbRef.current;
    if (!db) return;
    setVisits(await listVisits(db));
  }

  async function reloadSites() {
    const db = dbRef.current;
    if (!db) return;
    setSites(await listSites(db));
  }

  async function reloadTemplates() {
    const db = dbRef.current;
    if (!db) return;
    setSavedTemplates(await listSavedTemplates(db));
  }

  async function handleCreateSite(input: {
    name: string;
    address: string;
    contact_name: string;
    contact_phone: string;
  }) {
    const db = dbRef.current;
    if (!db) return;
    await createSite(db, input);
    await reloadSites();
    shippie.feel.texture('confirm');
  }

  async function handleUpdateSite(siteId: string, patch: Partial<Site>) {
    const db = dbRef.current;
    if (!db) return;
    await updateSite(db, siteId, patch);
    await reloadSites();
  }

  async function handleDeleteSite(siteId: string) {
    const db = dbRef.current;
    if (!db) return;
    await deleteSite(db, siteId);
    await Promise.all([reloadSites(), reloadVisits()]);
    replaceWith({ tab: 'sites', view: { kind: 'tabs' } });
  }

  async function handleStartVisit(siteId: string, opts: { templateId: TemplateId | 'blank'; weather: string }) {
    const db = dbRef.current;
    if (!db) return;
    const visit = await createVisit(db, {
      site_id: siteId,
      inspector_name: identity.name || null,
      template_id: opts.templateId === 'blank' ? null : opts.templateId,
      weather: opts.weather || null,
    });
    if (opts.templateId !== 'blank') {
      await addManyChecks(db, visit.id, templateChecks(opts.templateId) as string[]);
    }
    await Promise.all([reloadVisits(), refreshVisit(visit.id)]);
    shippie.feel.texture('confirm');
    navigate({ tab, view: { kind: 'visit', visitId: visit.id } }, 'rise');
  }

  async function handleAddCheck(visitId: string, label: string) {
    const db = dbRef.current;
    if (!db) return;
    await addCheck(db, { visit_id: visitId, label });
    await refreshVisit(visitId);
  }

  async function handleSetCheckStatus(checkId: string, visitId: string, status: CheckStatus) {
    const db = dbRef.current;
    if (!db) return;
    await updateCheck(db, checkId, { status });
    await refreshVisit(visitId);
    shippie.feel.texture('confirm');
  }

  async function handleSetCheckNotes(checkId: string, visitId: string, notes: string) {
    const db = dbRef.current;
    if (!db) return;
    await updateCheck(db, checkId, { notes });
    await refreshVisit(visitId);
  }

  async function handleAddCheckPhoto(checkId: string, visitId: string, path: string) {
    const db = dbRef.current;
    if (!db) return;
    const current = checksByVisit[visitId]?.find((c) => c.id === checkId);
    if (!current) return;
    await updateCheck(db, checkId, { photo_paths: [...current.photo_paths, path] });
    await refreshVisit(visitId);
  }

  async function handleRemoveCheckPhoto(checkId: string, visitId: string, path: string) {
    const db = dbRef.current;
    if (!db) return;
    const current = checksByVisit[visitId]?.find((c) => c.id === checkId);
    if (!current) return;
    await updateCheck(db, checkId, {
      photo_paths: current.photo_paths.filter((p) => p !== path),
    });
    await refreshVisit(visitId);
  }

  async function handleDeleteCheck(checkId: string, visitId: string) {
    const db = dbRef.current;
    if (!db) return;
    await deleteCheck(db, checkId);
    await refreshVisit(visitId);
  }

  async function handleAddIncident(visitId: string, draft: IncidentDraft) {
    const db = dbRef.current;
    if (!db) return;
    const incident = await addIncident(db, {
      visit_id: visitId,
      severity: draft.severity,
      description: draft.description,
      photo_path: draft.photo_path,
      follow_up: draft.follow_up,
    });
    await refreshVisit(visitId);
    shippie.feel.texture('milestone');
    shippie.intent.broadcast('incident-flagged', [
      {
        visit_id: visitId,
        site_id: visits.find((v) => v.id === visitId)?.site_id,
        severity: incident.severity,
        description: incident.description,
        follow_up: incident.follow_up,
        flagged_at: incident.created_at,
      },
    ]);
  }

  async function handleDeleteIncident(visitId: string, incidentId: string) {
    const db = dbRef.current;
    if (!db) return;
    await deleteIncident(db, incidentId);
    await refreshVisit(visitId);
  }

  async function handleSetSignature(visitId: string, svg: string | null) {
    const db = dbRef.current;
    if (!db) return;
    if (svg && !isMeaningfulSignature(svg)) {
      // Treat trivially-tiny strokes as "still empty" — no DB write yet.
      return;
    }
    await updateVisit(db, visitId, { signature_svg: svg });
    await reloadVisits();
  }

  async function handleSubmitVisit(visitId: string) {
    const db = dbRef.current;
    if (!db) return;
    const visit = visits.find((v) => v.id === visitId);
    if (!visit) return;
    const newStatus = nextStatus(visit.status, 'submit');
    await updateVisit(db, visitId, {
      status: newStatus,
      ended_at: new Date().toISOString(),
    });
    await reloadVisits();
    shippie.feel.texture('milestone');
    shippie.intent.broadcast('visit-completed', [
      {
        visit_id: visitId,
        site_id: visit.site_id,
        site_name: sitesById.get(visit.site_id)?.name ?? null,
        inspector_name: visit.inspector_name,
        check_count: (checksByVisit[visitId] ?? []).length,
        incident_count: (incidentsByVisit[visitId] ?? []).length,
        completed_at: new Date().toISOString(),
      },
    ]);
  }

  async function handleReopenVisit(visitId: string) {
    const db = dbRef.current;
    if (!db) return;
    const visit = visits.find((v) => v.id === visitId);
    if (!visit) return;
    await updateVisit(db, visitId, { status: nextStatus(visit.status, 'reopen') });
    await reloadVisits();
  }

  async function handleDeleteVisit(visitId: string) {
    const db = dbRef.current;
    if (!db) return;
    await deleteVisit(db, visitId);
    await reloadVisits();
    replaceWith({ tab: 'home', view: { kind: 'tabs' } });
  }

  async function handleSaveTemplate(input: { name: string; checks: string[] }) {
    const db = dbRef.current;
    if (!db) return;
    await saveTemplate(db, input);
    await reloadTemplates();
  }

  async function handleDeleteTemplate(id: string) {
    const db = dbRef.current;
    if (!db) return;
    await deleteSavedTemplate(db, id);
    await reloadTemplates();
  }

  function handleIdentity(next: InspectorIdentity) {
    setIdentity(next);
    saveIdentity(next);
    shippie.feel.texture('confirm');
  }

  function exportCsv() {
    const lines: string[] = [];
    lines.push(['kind', 'id', 'parent', 'label', 'status', 'notes', 'created_at'].join(','));
    for (const s of sites) {
      lines.push(['site', s.id, '', s.name, s.address ?? '', s.contact_name ?? '', s.created_at ?? ''].map(csvCell).join(','));
    }
    for (const v of visits) {
      lines.push(['visit', v.id, v.site_id, '', v.status, v.weather ?? '', v.started_at ?? ''].map(csvCell).join(','));
      for (const c of checksByVisit[v.id] ?? []) {
        lines.push(['check', c.id, v.id, c.label, c.status, c.notes ?? '', ''].map(csvCell).join(','));
      }
      for (const i of incidentsByVisit[v.id] ?? []) {
        lines.push(['incident', i.id, v.id, i.severity, i.follow_up ? 'follow-up' : '', i.description, i.created_at].map(csvCell).join(','));
      }
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `site-visits-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function resetAll() {
    const db = dbRef.current;
    if (!db) return;
    for (const s of sites) await deleteSite(db, s.id);
    for (const t of savedTemplates) await deleteSavedTemplate(db, t.id);
    await Promise.all([reloadSites(), reloadVisits(), reloadTemplates()]);
    setChecksByVisit({});
    setIncidentsByVisit({});
    replaceWith({ tab: 'home', view: { kind: 'tabs' } });
  }

  // ------------------------------------------------------------------
  // Pre-pick "today + recent + draft" visits for Home
  // ------------------------------------------------------------------

  const recentVisits = useMemo(() => visits.slice(0, 30), [visits]);

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  if (!ready) {
    return (
      <div className="app">
        <header className="app-header">
          <h1>Site Visit</h1>
        </header>
        <p className="empty-state">loading…</p>
      </div>
    );
  }

  if (view.kind === 'site') {
    const site = sitesById.get(view.siteId);
    if (!site) {
      return null;
    }
    const siteVisits = visits.filter((v) => v.site_id === view.siteId);
    return (
      <div className="app">
        <SitePage
          site={site}
          visits={siteVisits}
          visitHasIssues={visitHasIssues}
          onBack={() => closeTo({ tab: 'sites', view: { kind: 'tabs' } })}
          onOpenVisit={(id) => navigate({ tab, view: { kind: 'visit', visitId: id } }, 'rise')}
          onStartVisit={(opts) => void handleStartVisit(view.siteId, opts)}
          onUpdateSite={(patch) => void handleUpdateSite(view.siteId, patch)}
          onDeleteSite={() => void handleDeleteSite(view.siteId)}
        />
        <SyncStatus />
      </div>
    );
  }

  if (view.kind === 'visit') {
    const visit = visits.find((v) => v.id === view.visitId);
    if (!visit) {
      return null;
    }
    const site = sitesById.get(visit.site_id) ?? null;
    const checks = checksByVisit[visit.id] ?? [];
    const incidents = incidentsByVisit[visit.id] ?? [];
    return (
      <div className="app">
        <VisitPage
          visit={visit}
          site={site}
          checks={checks}
          incidents={incidents}
          files={files}
          onBack={() => closeTo({ tab: 'sites', view: { kind: 'site', siteId: visit.site_id } })}
          onAddCheck={(label) => void handleAddCheck(visit.id, label)}
          onSetCheckStatus={(id, status) => void handleSetCheckStatus(id, visit.id, status)}
          onSetCheckNotes={(id, notes) => void handleSetCheckNotes(id, visit.id, notes)}
          onAddCheckPhoto={(id, path) => void handleAddCheckPhoto(id, visit.id, path)}
          onRemoveCheckPhoto={(id, path) => void handleRemoveCheckPhoto(id, visit.id, path)}
          onDeleteCheck={(id) => void handleDeleteCheck(id, visit.id)}
          onAddIncident={(draft) => void handleAddIncident(visit.id, draft)}
          onDeleteIncident={(id) => void handleDeleteIncident(visit.id, id)}
          onSetSignature={(svg) => void handleSetSignature(visit.id, svg)}
          onSubmit={() => void handleSubmitVisit(visit.id)}
          onReopen={() => void handleReopenVisit(visit.id)}
          onPrint={() => navigate({ tab, view: { kind: 'print', visitId: visit.id } }, 'rise')}
          onDeleteVisit={() => void handleDeleteVisit(visit.id)}
        />
        <SyncStatus />
      </div>
    );
  }

  if (view.kind === 'print') {
    const visit = visits.find((v) => v.id === view.visitId);
    if (!visit) return null;
    const site = sitesById.get(visit.site_id);
    if (!site) return null;
    const payload = buildPdfPayload({
      site,
      visit: { ...visit, inspector_name: visit.inspector_name ?? identity.name ?? null },
      checks: checksByVisit[visit.id] ?? [],
      incidents: incidentsByVisit[visit.id] ?? [],
    });
    return (
      <div className="app">
        <PrintView
          payload={payload}
          files={files}
          onBack={() => closeTo({ tab, view: { kind: 'visit', visitId: visit.id } })}
        />
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Site Visit</h1>
        <SyncStatus />
      </header>

      <nav className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.id === tab}
            className={`tab ${t.id === tab ? 'active' : ''}`}
            onClick={() => navigate({ tab: t.id, view: { kind: 'tabs' } })}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'home' ? (
        <Home
          visits={recentVisits}
          sitesById={sitesById}
          visitHasIssues={visitHasIssues}
          onOpenVisit={(id) => navigate({ tab, view: { kind: 'visit', visitId: id } }, 'rise')}
          onNewVisit={() => {
            navigate({ tab: 'sites', view: { kind: 'tabs' } });
          }}
        />
      ) : null}

      {tab === 'sites' ? (
        <Sites
          sites={sites}
          visitCounts={visitCounts}
          onOpenSite={(id) => navigate({ tab, view: { kind: 'site', siteId: id } }, 'rise')}
          onCreateSite={(input) => void handleCreateSite(input)}
        />
      ) : null}

      {tab === 'templates' ? (
        <TemplatesPage
          saved={savedTemplates}
          onSave={(input) => void handleSaveTemplate(input)}
          onDelete={(id) => void handleDeleteTemplate(id)}
        />
      ) : null}

      {tab === 'settings' ? (
        <SettingsPage
          identity={identity}
          onChange={handleIdentity}
          onExportCsv={exportCsv}
          onResetAll={() => void resetAll()}
        />
      ) : null}

    </div>
  );
}

// Surface TEMPLATES/savedTemplates merge for any future export — currently
// only the built-ins drive the Site → Start visit picker.
export function _allTemplates(saved: ReadonlyArray<SavedTemplate>) {
  return [...TEMPLATES, ...saved];
}
