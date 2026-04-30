/**
 * Couple-level meta — who you both are, anniversary, next visit.
 * Single Y.Map at namespace 'meta'.
 */
import * as Y from 'yjs';

export interface CoupleProfile {
  device_id: string;
  display_name: string;
}

export interface CoupleMeta {
  anniversary_date: string | null; // ISO date, e.g. 2025-05-09
  next_visit_date: string | null;
  first_met_date: string | null; // ISO date — anchors the constellation map
  // Map of device_id → display_name. Each device sets its own entry on first run.
  profiles: Record<string, string>;
  // Map of device_id → avatar data URL. Each device sets its own.
  avatars: Record<string, string>;
  // After-Hours opt-in. Both must be true for the section to appear.
  after_hours_optin: Record<string, boolean>;
}

function getMeta(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap('meta');
}

export function readCoupleMeta(doc: Y.Doc): CoupleMeta {
  const m = getMeta(doc);
  const profilesMap = (m.get('profiles') as Record<string, string> | undefined) ?? {};
  const avatarsMap = (m.get('avatars') as Record<string, string> | undefined) ?? {};
  const ahMap = (m.get('after_hours_optin') as Record<string, boolean> | undefined) ?? {};
  return {
    anniversary_date: (m.get('anniversary_date') as string | null | undefined) ?? null,
    next_visit_date: (m.get('next_visit_date') as string | null | undefined) ?? null,
    first_met_date: (m.get('first_met_date') as string | null | undefined) ?? null,
    profiles: { ...profilesMap },
    avatars: { ...avatarsMap },
    after_hours_optin: { ...ahMap },
  };
}

export function setAfterHoursOptIn(doc: Y.Doc, deviceId: string, optedIn: boolean): void {
  const m = getMeta(doc);
  const existing = (m.get('after_hours_optin') as Record<string, boolean> | undefined) ?? {};
  m.set('after_hours_optin', { ...existing, [deviceId]: optedIn });
}

export function bothOptedInToAfterHours(meta: CoupleMeta): boolean {
  const values = Object.values(meta.after_hours_optin);
  return values.length >= 2 && values.every((v) => v === true);
}

export function setProfileAvatar(doc: Y.Doc, deviceId: string, dataUrl: string | null): void {
  const m = getMeta(doc);
  const existing = (m.get('avatars') as Record<string, string> | undefined) ?? {};
  if (dataUrl === null) {
    const next = { ...existing };
    delete next[deviceId];
    m.set('avatars', next);
  } else {
    m.set('avatars', { ...existing, [deviceId]: dataUrl });
  }
}

export function setAnniversary(doc: Y.Doc, isoDate: string | null): void {
  getMeta(doc).set('anniversary_date', isoDate);
}

export function setNextVisitDate(doc: Y.Doc, isoDate: string | null): void {
  getMeta(doc).set('next_visit_date', isoDate);
}

export function setFirstMet(doc: Y.Doc, isoDate: string | null): void {
  getMeta(doc).set('first_met_date', isoDate);
}

export function setProfileName(doc: Y.Doc, deviceId: string, displayName: string): void {
  const m = getMeta(doc);
  const existing = (m.get('profiles') as Record<string, string> | undefined) ?? {};
  m.set('profiles', { ...existing, [deviceId]: displayName });
}

export function partnerOf(meta: CoupleMeta, myDeviceId: string): {
  device_id: string;
  display_name: string;
} | null {
  for (const [deviceId, name] of Object.entries(meta.profiles)) {
    if (deviceId !== myDeviceId) return { device_id: deviceId, display_name: name };
  }
  return null;
}

export function meName(meta: CoupleMeta, myDeviceId: string): string {
  return meta.profiles[myDeviceId] ?? 'me';
}
