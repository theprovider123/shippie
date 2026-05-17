/**
 * Local-DB schema for Site Visit. Five tables — sites, visits, checks,
 * incidents, templates — all wired through @shippie/local-db
 * (wa-sqlite + OPFS, in-memory fallback). Photos live in
 * @shippie/local-files (OPFS); the DB only carries their paths.
 *
 * Nothing leaves the device unless the inspector explicitly exports a
 * PDF or a CSV. That's the whole point — site staff often work where
 * there is no signal.
 */
import type { LocalDbSchema } from '@shippie/local-runtime-contract';

export const SITES_TABLE = 'sites';
export const VISITS_TABLE = 'visits';
export const CHECKS_TABLE = 'checks';
export const INCIDENTS_TABLE = 'incidents';
export const TEMPLATES_TABLE = 'templates';

export const sitesSchema: LocalDbSchema = {
  id: 'text primary key',
  name: 'text not null',
  address: 'text',
  contact_name: 'text',
  contact_phone: 'text',
  lat: 'real',
  lng: 'real',
  created_at: 'datetime',
};

export const visitsSchema: LocalDbSchema = {
  id: 'text primary key',
  site_id: 'text not null',
  template_id: 'text',
  inspector_name: 'text',
  weather: 'text',
  started_at: 'datetime',
  ended_at: 'datetime',
  status: 'text',
  signature_svg: 'text',
};

export const checksSchema: LocalDbSchema = {
  id: 'text primary key',
  visit_id: 'text not null',
  label: 'text not null',
  status: 'text',
  notes: 'text',
  /** comma-separated photo paths in OPFS. Stored as text so the DB stays flat. */
  photo_paths: 'text',
  /** preserves the order checks were added in — sortable. */
  position: 'integer',
};

export const incidentsSchema: LocalDbSchema = {
  id: 'text primary key',
  visit_id: 'text not null',
  severity: 'text',
  description: 'text',
  photo_path: 'text',
  follow_up: 'integer',
  created_at: 'datetime',
};

export const templatesSchema: LocalDbSchema = {
  id: 'text primary key',
  name: 'text not null',
  /** JSON-encoded array of strings — checklist labels in display order. */
  checks_json: 'text',
};

// ---------------------------------------------------------------------------
// Typed row shapes (the DB layer is `unknown`-typed at the index signature
// level; these typed views are what the rest of the app passes around).
// ---------------------------------------------------------------------------

export interface Site {
  id: string;
  name: string;
  address?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  lat?: number | null;
  lng?: number | null;
  created_at?: string;
}

export type VisitStatus = 'in-progress' | 'submitted' | 'amended';

export interface Visit {
  id: string;
  site_id: string;
  template_id?: string | null;
  inspector_name?: string | null;
  weather?: string | null;
  started_at?: string;
  ended_at?: string | null;
  status: VisitStatus;
  signature_svg?: string | null;
}

export type CheckStatus = 'pending' | 'pass' | 'fail' | 'na' | 'needs-attention';

export interface Check {
  id: string;
  visit_id: string;
  label: string;
  status: CheckStatus;
  notes?: string | null;
  /** Stored in DB as comma-separated; exposed here as an array. */
  photo_paths: string[];
  position: number;
}

export type IncidentSeverity = 'low' | 'med' | 'high';

export interface Incident {
  id: string;
  visit_id: string;
  severity: IncidentSeverity;
  description: string;
  photo_path?: string | null;
  follow_up: boolean;
  created_at: string;
}

export interface SavedTemplate {
  id: string;
  name: string;
  /** Display-ordered checklist labels. */
  checks: string[];
}
