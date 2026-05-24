/**
 * Group chat / activity feed — local store for the Group Hub's chat card.
 *
 * Self-contained (localStorage) so this ships without a `shippie-db.ts` schema
 * change. When codex wires the relay client, the same `addGroupEvent` should
 * also enqueue an outbound `group_signal` packet on the room — receivers'
 * apps then call `addGroupEvent` themselves when packets arrive.
 *
 * - Events expire by TTL (default 180 minutes); `listGroupEvents` prunes on read.
 * - Capped at MAX_EVENTS rows to bound storage in a long event.
 * - A stable `source_id` per device is generated lazily.
 */

import type { ChatPreset } from './chat-presets';

export type GroupEventKind = 'group_signal' | 'plan_changed' | 'join';

export interface GroupEvent {
  id: string;
  kind: GroupEventKind;
  source_id: string;
  display_name: string;
  supporter_tag?: string;
  preset?: ChatPreset;
  text?: string;
  created_at: string;
  ttl_minutes: number;
}

const STORAGE_KEY = 'parade-companion:group-events';
const SOURCE_ID_KEY = 'parade-companion:group-source-id';
export const MAX_EVENTS = 200;
const DEFAULT_TTL_MINUTES = 180;

export function getOrCreateSourceId(): string {
  if (typeof localStorage === 'undefined') return `me_${randomToken(12)}`;
  const existing = localStorage.getItem(SOURCE_ID_KEY);
  if (existing) return existing;
  const next = `me_${randomToken(12)}`;
  localStorage.setItem(SOURCE_ID_KEY, next);
  return next;
}

export function addGroupEvent(
  input: Omit<GroupEvent, 'id' | 'created_at' | 'ttl_minutes'> & { ttl_minutes?: number },
): GroupEvent {
  const event: GroupEvent = {
    id: `ev_${Date.now().toString(36)}_${randomToken(6)}`,
    kind: input.kind,
    source_id: input.source_id,
    display_name: input.display_name,
    supporter_tag: input.supporter_tag,
    preset: input.preset,
    text: input.text,
    created_at: new Date().toISOString(),
    ttl_minutes: input.ttl_minutes ?? DEFAULT_TTL_MINUTES,
  };
  const current = readRows();
  const next = [event, ...current].slice(0, MAX_EVENTS);
  writeRows(next);
  return event;
}

export function listGroupEvents(now = Date.now()): GroupEvent[] {
  const all = readRows();
  const active = all.filter((row) => !isExpired(row, now));
  if (active.length !== all.length) writeRows(active);
  return active;
}

export function clearGroupEvents(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

function isExpired(event: GroupEvent, now: number): boolean {
  const expiresAt = Date.parse(event.created_at) + event.ttl_minutes * 60_000;
  return Number.isFinite(expiresAt) && expiresAt <= now;
}

function readRows(): GroupEvent[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isValidEvent) : [];
  } catch {
    return [];
  }
}

function writeRows(rows: GroupEvent[]): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
}

function isValidEvent(value: unknown): value is GroupEvent {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === 'string' &&
    typeof row.kind === 'string' &&
    typeof row.source_id === 'string' &&
    typeof row.display_name === 'string' &&
    (row.supporter_tag === undefined || typeof row.supporter_tag === 'string') &&
    typeof row.created_at === 'string' &&
    typeof row.ttl_minutes === 'number'
  );
}

function randomToken(length: number): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join('');
}
