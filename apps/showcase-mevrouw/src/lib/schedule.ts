import { addDays, parseLocalDateString, toLocalDateString, getDaysUntil } from './dates.ts';

export type ShiftType = 'work' | 'busy' | 'half' | 'off' | null;

export interface Shift {
  user_id: string;
  date: string; // YYYY-MM-DD
  shift_type: ShiftType;
}

export interface ItineraryItem {
  id: string;
  at: string; // ISO datetime
  label: string;
}

export interface Trip {
  id: string;
  traveller_id: string;
  origin_city: string;
  destination_city: string;
  depart_at: string; // ISO
  return_at: string; // ISO
  transport: string | null;
  transport_ref: string | null;
  notes: string | null;
  is_anniversary_flag: boolean;
  // Trip-detail extras (added later, optional)
  plans: string;
  itinerary: ItineraryItem[];
  photos: string[]; // data URLs (one per photo)
}

export function tripCoversDate(trip: Trip, date: string): boolean {
  const d = parseLocalDateString(date);
  const start = parseLocalDateString(trip.depart_at.slice(0, 10));
  const end = parseLocalDateString(trip.return_at.slice(0, 10));
  return d >= start && d <= end;
}

export function findMutualFreeDays(args: {
  shifts: Shift[];
  trips: Trip[];
  userIds: string[];
  fromDate: string;
  limit: number;
}): string[] {
  const { shifts, trips, userIds, fromDate, limit } = args;
  const byUserDate = new Map<string, ShiftType>();
  for (const s of shifts) byUserDate.set(`${s.user_id}|${s.date}`, s.shift_type);
  const out: string[] = [];
  let cursor = parseLocalDateString(fromDate);
  for (let i = 0; i < 400 && out.length < limit; i++) {
    const date = toLocalDateString(cursor);
    const allOff = userIds.every((uid) => byUserDate.get(`${uid}|${date}`) === 'off');
    const anyTripCovers = userIds.some((uid) =>
      trips.some((t) => t.traveller_id === uid && tripCoversDate(t, date)),
    );
    if (allOff && !anyTripCovers) out.push(date);
    cursor = addDays(cursor, 1);
  }
  return out;
}

export type NextTogether =
  | { kind: 'together_now'; tripId: string; endsOn: string }
  | { kind: 'trip'; tripId: string; date: string; daysAway: number }
  | { kind: 'mutual_free'; date: string; daysAway: number }
  | { kind: 'empty' };

export function nextTogether(args: {
  trips: Trip[];
  mutualFreeDays: string[];
  today: string;
}): NextTogether {
  const { trips, mutualFreeDays, today } = args;
  const todayDate = parseLocalDateString(today);

  const active = trips.find((t) => tripCoversDate(t, today));
  if (active) {
    return { kind: 'together_now', tripId: active.id, endsOn: active.return_at.slice(0, 10) };
  }

  const future = [...trips]
    .filter((t) => parseLocalDateString(t.depart_at.slice(0, 10)) > todayDate)
    .sort((a, b) => a.depart_at.localeCompare(b.depart_at))[0];
  if (future) {
    const date = future.depart_at.slice(0, 10);
    return {
      kind: 'trip',
      tripId: future.id,
      date,
      daysAway: getDaysUntil(`${date}T00:00:00`, todayDate),
    };
  }

  if (mutualFreeDays.length > 0) {
    const date = mutualFreeDays[0]!;
    return { kind: 'mutual_free', date, daysAway: getDaysUntil(`${date}T00:00:00`, todayDate) };
  }

  return { kind: 'empty' };
}
