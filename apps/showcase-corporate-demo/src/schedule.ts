import type { BreakoutChoice, DayNumber, Session } from './data.ts';
import { EVENT, FLOOR_PLANS, T } from './data.ts';

export interface EventClock {
  day: DayNumber;
  minutes: number;
}

export type SessionPhase = 'past' | 'live' | 'future';

export function formatTime(minutes: number): string {
  const normalized = ((minutes % (24 * 60)) + (24 * 60)) % (24 * 60);
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function parseTime(value: string | null): number | undefined {
  if (!value) return undefined;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return undefined;
  const hourRaw = match[1];
  const minuteRaw = match[2];
  if (!hourRaw || !minuteRaw) return undefined;
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return undefined;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return undefined;
  return T(hour, minute);
}

export function resolveEventClock(now = new Date(), search = globalThis.location?.search ?? ''): EventClock {
  const params = new URLSearchParams(search);
  const dayParam = Number(params.get('day'));
  const timeParam = parseTime(params.get('time'));
  const overrideDay = dayParam === 1 || dayParam === 2 ? (dayParam as DayNumber) : undefined;
  if (overrideDay && timeParam !== undefined) return { day: overrideDay, minutes: timeParam };

  const year = now.getFullYear();
  const month = now.getMonth();
  const date = now.getDate();
  const minutes = T(now.getHours(), now.getMinutes());
  if (year === 2026 && month === 5 && date === 12) return { day: 2, minutes };
  return { day: 1, minutes };
}

export function getCurrentSession<T extends Session>(schedule: T[], now: EventClock): T | undefined {
  return schedule.find((session) => session.day === now.day && session.start <= now.minutes && session.end > now.minutes);
}

export function getUpcomingSessions<T extends Session>(schedule: T[], now: EventClock): T[] {
  return schedule.filter((session) => session.day === now.day && session.start > now.minutes);
}

export function sessionPhase(session: Session, now: EventClock): SessionPhase {
  if (session.day < now.day || (session.day === now.day && session.end <= now.minutes)) return 'past';
  if (session.day === now.day && session.start <= now.minutes && session.end > now.minutes) return 'live';
  return 'future';
}

export function progressForSession(session: Session, now: EventClock): number {
  if (session.day !== now.day) return session.day < now.day ? 1 : 0;
  if (now.minutes <= session.start) return 0;
  if (now.minutes >= session.end) return 1;
  return (now.minutes - session.start) / (session.end - session.start);
}

export function dayLabel(day: DayNumber): string {
  return EVENT.days.find((item) => item.n === day)?.full ?? 'Wednesday 11 June';
}

export function resolveBreakoutChoice(session: Session, selectedStreams: Record<string, string>): BreakoutChoice | undefined {
  if (!session.breakout) return undefined;
  const selectedId = selectedStreams[session.id];
  return session.breakout.find((choice) => choice.id === selectedId) ?? session.breakout[0];
}

export function roomForSession(session: Session, selectedStreams: Record<string, string>): string | undefined {
  return resolveBreakoutChoice(session, selectedStreams)?.room ?? session.room;
}

export function floorForRoom(roomName: string | undefined): string {
  if (!roomName) return 'G';
  const normalized = roomName.toLowerCase();
  if (normalized.includes('auditorium')) return '1';
  if (normalized.includes('aldgate') || normalized.includes('bishopsgate') || normalized.includes('fenchurch')) return '2';
  if (normalized.includes('terrace') || normalized.includes('sky')) return '3';
  return 'G';
}

export function roomIdForName(roomName: string | undefined): string | undefined {
  if (!roomName) return undefined;
  const normalized = roomName.toLowerCase();
  for (const floor of FLOOR_PLANS) {
    const match = floor.rooms.find((room) => normalized.includes(room.name.toLowerCase()) || room.name.toLowerCase().includes(normalized));
    if (match) return match.id;
  }
  if (normalized.includes('auditorium')) return 'auditorium';
  if (normalized.includes('foyer')) return 'foyer';
  if (normalized.includes('entrance')) return 'entrance';
  if (normalized.includes('aldgate')) return 'aldgate';
  if (normalized.includes('bishopsgate')) return 'bishopsgate';
  if (normalized.includes('fenchurch')) return 'fenchurch';
  if (normalized.includes('sky')) return 'sky-terrace';
  return undefined;
}

export function isRevealReady(now: EventClock): boolean {
  return now.day > EVENT.reveal.day || (now.day === EVENT.reveal.day && now.minutes >= EVENT.reveal.minutes);
}
