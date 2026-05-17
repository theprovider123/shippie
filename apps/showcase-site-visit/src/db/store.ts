/**
 * CRUD helpers around `shippie.local.db`. Five tables, async interface,
 * minimal SQL knowledge leaks into the rest of the app. Each helper is
 * idempotent on the schema (calls `ensureSchema` first) so any entry
 * point survives a fresh worker.
 *
 * Photo paths are kept as a TS array on the way in and out; the DB
 * stores them as a comma-separated string to avoid a sixth join table
 * for what is, on disk, a list of OPFS file names.
 */

import type { LocalDbRecord, ShippieLocalDb } from '@shippie/local-runtime-contract';
import {
  CHECKS_TABLE,
  INCIDENTS_TABLE,
  SITES_TABLE,
  TEMPLATES_TABLE,
  VISITS_TABLE,
  checksSchema,
  incidentsSchema,
  sitesSchema,
  templatesSchema,
  visitsSchema,
  type Check,
  type CheckStatus,
  type Incident,
  type IncidentSeverity,
  type SavedTemplate,
  type Site,
  type Visit,
  type VisitStatus,
} from './schema.ts';

type RowOf<T> = T & LocalDbRecord;
const asRow = <T>(value: T): RowOf<T> => value as RowOf<T>;

const initCache = new WeakMap<ShippieLocalDb, Promise<void>>();

export async function ensureSchema(db: ShippieLocalDb): Promise<void> {
  let pending = initCache.get(db);
  if (!pending) {
    pending = (async () => {
      await db.create(SITES_TABLE, sitesSchema);
      await db.create(VISITS_TABLE, visitsSchema);
      await db.create(CHECKS_TABLE, checksSchema);
      await db.create(INCIDENTS_TABLE, incidentsSchema);
      await db.create(TEMPLATES_TABLE, templatesSchema);
    })();
    initCache.set(db, pending);
  }
  await pending;
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `sv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// Helpers — row ↔ typed shape
// ---------------------------------------------------------------------------

interface CheckRowShape {
  id: string;
  visit_id: string;
  label: string;
  status?: string | null;
  notes?: string | null;
  photo_paths?: string | null;
  position?: number | null;
}

function rowToCheck(row: CheckRowShape): Check {
  return {
    id: row.id,
    visit_id: row.visit_id,
    label: row.label,
    status: (row.status as CheckStatus) ?? 'pending',
    notes: row.notes ?? null,
    photo_paths: row.photo_paths ? row.photo_paths.split(',').filter(Boolean) : [],
    position: row.position ?? 0,
  };
}

function checkToRow(check: Check): CheckRowShape {
  return {
    id: check.id,
    visit_id: check.visit_id,
    label: check.label,
    status: check.status,
    notes: check.notes ?? null,
    photo_paths: check.photo_paths.join(','),
    position: check.position,
  };
}

interface IncidentRowShape {
  id: string;
  visit_id: string;
  severity: string;
  description: string;
  photo_path?: string | null;
  follow_up?: number | boolean | null;
  created_at: string;
}

function rowToIncident(row: IncidentRowShape): Incident {
  return {
    id: row.id,
    visit_id: row.visit_id,
    severity: row.severity as IncidentSeverity,
    description: row.description,
    photo_path: row.photo_path ?? null,
    follow_up: Boolean(row.follow_up),
    created_at: row.created_at,
  };
}

interface TemplateRowShape {
  id: string;
  name: string;
  checks_json?: string | null;
}

function rowToTemplate(row: TemplateRowShape): SavedTemplate {
  let checks: string[] = [];
  try {
    const parsed = JSON.parse(row.checks_json ?? '[]');
    if (Array.isArray(parsed)) checks = parsed.map((s) => String(s));
  } catch {
    checks = [];
  }
  return { id: row.id, name: row.name, checks };
}

// ---------------------------------------------------------------------------
// Sites
// ---------------------------------------------------------------------------

export async function listSites(db: ShippieLocalDb): Promise<Site[]> {
  await ensureSchema(db);
  return db.query<RowOf<Site>>(SITES_TABLE, { orderBy: { name: 'asc' } });
}

export async function getSite(db: ShippieLocalDb, id: string): Promise<Site | null> {
  await ensureSchema(db);
  const rows = await db.query<RowOf<Site>>(SITES_TABLE, { where: { id }, limit: 1 });
  return rows[0] ?? null;
}

export async function createSite(
  db: ShippieLocalDb,
  input: Omit<Site, 'id' | 'created_at'> & { id?: string },
): Promise<Site> {
  await ensureSchema(db);
  const site: Site = {
    id: input.id ?? newId(),
    name: input.name,
    address: input.address ?? null,
    contact_name: input.contact_name ?? null,
    contact_phone: input.contact_phone ?? null,
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    created_at: new Date().toISOString(),
  };
  await db.insert(SITES_TABLE, asRow(site));
  return site;
}

export async function updateSite(
  db: ShippieLocalDb,
  id: string,
  patch: Partial<Omit<Site, 'id' | 'created_at'>>,
): Promise<void> {
  await ensureSchema(db);
  await db.update<RowOf<Site>>(SITES_TABLE, id, asRow(patch));
}

export async function deleteSite(db: ShippieLocalDb, id: string): Promise<void> {
  await ensureSchema(db);
  // Cascade visits + their checks + incidents.
  const visits = await db.query<RowOf<Visit>>(VISITS_TABLE, { where: { site_id: id } });
  for (const v of visits) await deleteVisit(db, v.id);
  await db.delete(SITES_TABLE, id);
}

export async function searchSites(db: ShippieLocalDb, q: string): Promise<Site[]> {
  await ensureSchema(db);
  const trimmed = q.trim();
  if (!trimmed) return listSites(db);
  return db.search<RowOf<Site>>(SITES_TABLE, trimmed, { limit: 50 });
}

// ---------------------------------------------------------------------------
// Visits
// ---------------------------------------------------------------------------

export async function listVisits(db: ShippieLocalDb): Promise<Visit[]> {
  await ensureSchema(db);
  return db.query<RowOf<Visit>>(VISITS_TABLE, { orderBy: { started_at: 'desc' }, limit: 200 });
}

export async function listVisitsForSite(db: ShippieLocalDb, siteId: string): Promise<Visit[]> {
  await ensureSchema(db);
  const rows = await db.query<RowOf<Visit>>(VISITS_TABLE, { where: { site_id: siteId } });
  return rows.sort((a, b) => (b.started_at ?? '').localeCompare(a.started_at ?? ''));
}

export async function getVisit(db: ShippieLocalDb, id: string): Promise<Visit | null> {
  await ensureSchema(db);
  const rows = await db.query<RowOf<Visit>>(VISITS_TABLE, { where: { id }, limit: 1 });
  return rows[0] ?? null;
}

export async function createVisit(
  db: ShippieLocalDb,
  input: Omit<Visit, 'id' | 'started_at' | 'status'> & {
    id?: string;
    started_at?: string;
    status?: VisitStatus;
  },
): Promise<Visit> {
  await ensureSchema(db);
  const visit: Visit = {
    id: input.id ?? newId(),
    site_id: input.site_id,
    template_id: input.template_id ?? null,
    inspector_name: input.inspector_name ?? null,
    weather: input.weather ?? null,
    started_at: input.started_at ?? new Date().toISOString(),
    ended_at: null,
    status: input.status ?? 'in-progress',
    signature_svg: null,
  };
  await db.insert(VISITS_TABLE, asRow(visit));
  return visit;
}

export async function updateVisit(
  db: ShippieLocalDb,
  id: string,
  patch: Partial<Omit<Visit, 'id' | 'site_id'>>,
): Promise<void> {
  await ensureSchema(db);
  await db.update<RowOf<Visit>>(VISITS_TABLE, id, asRow(patch));
}

export async function deleteVisit(db: ShippieLocalDb, id: string): Promise<void> {
  await ensureSchema(db);
  const checks = await db.query<RowOf<Check>>(CHECKS_TABLE, { where: { visit_id: id } });
  for (const c of checks) await db.delete(CHECKS_TABLE, c.id);
  const incidents = await db.query<RowOf<Incident>>(INCIDENTS_TABLE, { where: { visit_id: id } });
  for (const i of incidents) await db.delete(INCIDENTS_TABLE, i.id);
  await db.delete(VISITS_TABLE, id);
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

export async function listChecksForVisit(db: ShippieLocalDb, visitId: string): Promise<Check[]> {
  await ensureSchema(db);
  const rows = await db.query<RowOf<CheckRowShape>>(CHECKS_TABLE, {
    where: { visit_id: visitId },
  });
  return rows
    .map(rowToCheck)
    .sort((a, b) => a.position - b.position);
}

export async function addCheck(
  db: ShippieLocalDb,
  input: Omit<Check, 'id' | 'photo_paths' | 'position' | 'status'> & {
    id?: string;
    photo_paths?: string[];
    position?: number;
    status?: CheckStatus;
  },
): Promise<Check> {
  await ensureSchema(db);
  const existing = await listChecksForVisit(db, input.visit_id);
  const check: Check = {
    id: input.id ?? newId(),
    visit_id: input.visit_id,
    label: input.label,
    status: input.status ?? 'pending',
    notes: input.notes ?? null,
    photo_paths: input.photo_paths ?? [],
    position: input.position ?? existing.length,
  };
  await db.insert(CHECKS_TABLE, asRow(checkToRow(check)));
  return check;
}

export async function addManyChecks(
  db: ShippieLocalDb,
  visitId: string,
  labels: ReadonlyArray<string>,
): Promise<Check[]> {
  const out: Check[] = [];
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i]!;
    out.push(await addCheck(db, { visit_id: visitId, label, position: i }));
  }
  return out;
}

export async function updateCheck(
  db: ShippieLocalDb,
  id: string,
  patch: Partial<Omit<Check, 'id' | 'visit_id'>>,
): Promise<void> {
  await ensureSchema(db);
  const rows = await db.query<RowOf<CheckRowShape>>(CHECKS_TABLE, { where: { id }, limit: 1 });
  const existing = rows[0];
  if (!existing) return;
  const merged = { ...rowToCheck(existing), ...patch };
  await db.update<RowOf<CheckRowShape>>(CHECKS_TABLE, id, asRow(checkToRow(merged)));
}

export async function deleteCheck(db: ShippieLocalDb, id: string): Promise<void> {
  await ensureSchema(db);
  await db.delete(CHECKS_TABLE, id);
}

// ---------------------------------------------------------------------------
// Incidents
// ---------------------------------------------------------------------------

export async function listIncidentsForVisit(
  db: ShippieLocalDb,
  visitId: string,
): Promise<Incident[]> {
  await ensureSchema(db);
  const rows = await db.query<RowOf<IncidentRowShape>>(INCIDENTS_TABLE, {
    where: { visit_id: visitId },
  });
  return rows.map(rowToIncident).sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function addIncident(
  db: ShippieLocalDb,
  input: Omit<Incident, 'id' | 'created_at'> & { id?: string },
): Promise<Incident> {
  await ensureSchema(db);
  const incident: Incident = {
    id: input.id ?? newId(),
    visit_id: input.visit_id,
    severity: input.severity,
    description: input.description,
    photo_path: input.photo_path ?? null,
    follow_up: Boolean(input.follow_up),
    created_at: new Date().toISOString(),
  };
  await db.insert(
    INCIDENTS_TABLE,
    asRow({
      ...incident,
      follow_up: incident.follow_up ? 1 : 0,
    }),
  );
  return incident;
}

export async function deleteIncident(db: ShippieLocalDb, id: string): Promise<void> {
  await ensureSchema(db);
  await db.delete(INCIDENTS_TABLE, id);
}

// ---------------------------------------------------------------------------
// User-saved templates (separate from built-ins in lib/templates.ts)
// ---------------------------------------------------------------------------

export async function listSavedTemplates(db: ShippieLocalDb): Promise<SavedTemplate[]> {
  await ensureSchema(db);
  const rows = await db.query<RowOf<TemplateRowShape>>(TEMPLATES_TABLE, {
    orderBy: { name: 'asc' },
  });
  return rows.map(rowToTemplate);
}

export async function saveTemplate(
  db: ShippieLocalDb,
  input: Omit<SavedTemplate, 'id'> & { id?: string },
): Promise<SavedTemplate> {
  await ensureSchema(db);
  const tpl: SavedTemplate = {
    id: input.id ?? newId(),
    name: input.name,
    checks: input.checks,
  };
  await db.insert(
    TEMPLATES_TABLE,
    asRow({ id: tpl.id, name: tpl.name, checks_json: JSON.stringify(tpl.checks) }),
  );
  return tpl;
}

export async function deleteSavedTemplate(db: ShippieLocalDb, id: string): Promise<void> {
  await ensureSchema(db);
  await db.delete(TEMPLATES_TABLE, id);
}
