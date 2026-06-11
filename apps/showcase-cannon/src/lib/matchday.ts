/**
 * Matchday time helpers — countdown segments, kickoff labels, and the
 * "MM-DD" key used by the club feed's this-day archive. All pure.
 */
import type { Fixture } from './types';

export interface Countdown {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalMs: number;
}

export function countdownTo(kickoffUtc: string, nowMs: number = Date.now()): Countdown {
  const totalMs = Math.max(0, Date.parse(kickoffUtc) - nowMs);
  const s = Math.floor(totalMs / 1000);
  return {
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
    totalMs,
  };
}

/** "Sat 16 Aug · 15:00" in the viewer's local time. */
export function kickoffLabel(kickoffUtc: string): string {
  const t = Date.parse(kickoffUtc);
  if (!Number.isFinite(t)) return '';
  const d = new Date(t);
  const day = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${day} · ${time}`;
}

/** Short month bucket for the fixtures month nav ("Aug", "Sep", …). */
export function monthOf(kickoffUtc: string): string {
  const t = Date.parse(kickoffUtc);
  if (!Number.isFinite(t)) return '';
  return new Date(t).toLocaleDateString('en-GB', { month: 'short' });
}

/** "MM-DD" key for the this-day archive, from the viewer's local date. */
export function thisDayKey(now: Date = new Date()): string {
  return `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function fixtureDateParts(f: Fixture): { day: string; mon: string } {
  const d = new Date(Date.parse(f.kickoffUtc));
  return {
    day: String(d.getDate()),
    mon: d.toLocaleDateString('en-GB', { month: 'short' }),
  };
}

export const COMP_SHORT: Record<string, string> = {
  'Premier League': 'PL',
  'Champions League': 'UCL',
  'Community Shield': 'Shield',
  'FA Cup': 'FA Cup',
  'EFL Cup': 'EFL Cup',
};

export function compShort(comp: string): string {
  return COMP_SHORT[comp] ?? comp;
}
