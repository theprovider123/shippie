/**
 * Pitch persistence — pitches, sections, briefs, versions, identity.
 *
 * Storage choice: localStorage with a single root document. Pitch
 * material is text-heavy but low-volume per-user (a freelancer might
 * have 30 pitches in their lifetime; a fundraiser maybe 100). The
 * full document fits comfortably under the localStorage budget if we
 * keep version history bounded (we cap at 20 per pitch).
 *
 * Privacy posture: every byte stays on this device. The only network
 * call this app makes is the `/__esm/` runtime fetch (same-origin,
 * proxied through the platform service worker — see DraftAssistant).
 * Nothing is sent to a server. There is no admin to subpoena.
 */

import type { PitchType, SectionKind } from './templates.ts';
import type { Version } from './versions.ts';

export type PitchStatus =
  | 'drafting'
  | 'review'
  | 'sent'
  | 'accepted'
  | 'declined';

export interface Pitch {
  id: string;
  type: PitchType;
  title: string;
  /** Org name or person — "Ford Foundation", "ACME Corp", "Jane Doe". */
  target: string;
  /** YYYY-MM-DD or empty string. */
  deadline: string;
  status: PitchStatus;
  created_at: string;
  updated_at: string;
}

export interface Section {
  id: string;
  pitch_id: string;
  kind: SectionKind;
  title: string;
  body_md: string;
  order: number;
}

export interface Brief {
  id: string;
  pitch_id: string;
  body: string;
  captured_at: string;
}

/** Default identity used in the print cover page. */
export interface Identity {
  name: string;
  role: string;
  org: string;
  email: string;
}

export interface Persisted {
  pitches: Pitch[];
  sections: Section[];
  briefs: Brief[];
  versions: Version[];
  identity: Identity;
}

const STORAGE_KEY = 'shippie.pitch-forge.v1';
const VERSION_CAP_PER_PITCH = 20;

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

const EMPTY_IDENTITY: Identity = { name: '', role: '', org: '', email: '' };

const EMPTY: Persisted = {
  pitches: [],
  sections: [],
  briefs: [],
  versions: [],
  identity: EMPTY_IDENTITY,
};

export const PITCH_STATUSES: PitchStatus[] = [
  'drafting',
  'review',
  'sent',
  'accepted',
  'declined',
];

export const PITCH_STATUS_LABEL: Record<PitchStatus, string> = {
  drafting: 'Drafting',
  review: 'In review',
  sent: 'Submitted',
  accepted: 'Accepted',
  declined: 'Declined',
};

export function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    return {
      pitches: Array.isArray(parsed.pitches) ? parsed.pitches : [],
      sections: Array.isArray(parsed.sections) ? parsed.sections : [],
      briefs: Array.isArray(parsed.briefs) ? parsed.briefs : [],
      versions: Array.isArray(parsed.versions) ? parsed.versions : [],
      identity: parsed.identity ?? EMPTY_IDENTITY,
    };
  } catch {
    return { ...EMPTY };
  }
}

export function save(state: Persisted): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* best-effort — quota errors fail silently */
  }
}

export function clearAll(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function insertPitch(state: Persisted, pitch: Pitch, sections: Section[]): Persisted {
  return {
    ...state,
    pitches: [pitch, ...state.pitches],
    sections: [...sections, ...state.sections],
  };
}

export function updatePitch(state: Persisted, id: string, patch: Partial<Pitch>): Persisted {
  return {
    ...state,
    pitches: state.pitches.map((p) =>
      p.id === id ? { ...p, ...patch, updated_at: new Date().toISOString() } : p,
    ),
  };
}

export function removePitch(state: Persisted, id: string): Persisted {
  return {
    ...state,
    pitches: state.pitches.filter((p) => p.id !== id),
    sections: state.sections.filter((s) => s.pitch_id !== id),
    briefs: state.briefs.filter((b) => b.pitch_id !== id),
    versions: state.versions.filter((v) => v.pitch_id !== id),
  };
}

export function upsertSection(state: Persisted, section: Section): Persisted {
  const exists = state.sections.find((s) => s.id === section.id);
  if (exists) {
    return {
      ...state,
      sections: state.sections.map((s) => (s.id === section.id ? section : s)),
    };
  }
  return { ...state, sections: [...state.sections, section] };
}

export function removeSection(state: Persisted, id: string): Persisted {
  return { ...state, sections: state.sections.filter((s) => s.id !== id) };
}

export function reorderSections(
  state: Persisted,
  pitchId: string,
  orderedIds: string[],
): Persisted {
  const indexById = new Map(orderedIds.map((id, i) => [id, i]));
  return {
    ...state,
    sections: state.sections.map((s) =>
      s.pitch_id === pitchId && indexById.has(s.id)
        ? { ...s, order: indexById.get(s.id)! }
        : s,
    ),
  };
}

export function upsertBrief(state: Persisted, brief: Brief): Persisted {
  const exists = state.briefs.find((b) => b.pitch_id === brief.pitch_id);
  if (exists) {
    return {
      ...state,
      briefs: state.briefs.map((b) => (b.pitch_id === brief.pitch_id ? brief : b)),
    };
  }
  return { ...state, briefs: [...state.briefs, brief] };
}

export function addVersion(state: Persisted, version: Version): Persisted {
  // Cap version history per pitch to avoid unbounded localStorage growth.
  const sameP = state.versions.filter((v) => v.pitch_id === version.pitch_id);
  const others = state.versions.filter((v) => v.pitch_id !== version.pitch_id);
  const sorted = [version, ...sameP].slice(0, VERSION_CAP_PER_PITCH);
  return { ...state, versions: [...others, ...sorted] };
}

export function setIdentity(state: Persisted, identity: Identity): Persisted {
  return { ...state, identity };
}

export function sectionsFor(state: Persisted, pitchId: string): Section[] {
  return state.sections
    .filter((s) => s.pitch_id === pitchId)
    .sort((a, b) => a.order - b.order);
}

export function briefFor(state: Persisted, pitchId: string): Brief | null {
  return state.briefs.find((b) => b.pitch_id === pitchId) ?? null;
}

export function versionsFor(state: Persisted, pitchId: string): Version[] {
  return state.versions
    .filter((v) => v.pitch_id === pitchId)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export const VERSION_CAP = VERSION_CAP_PER_PITCH;
