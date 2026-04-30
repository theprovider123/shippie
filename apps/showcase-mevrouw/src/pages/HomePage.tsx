import type * as Y from 'yjs';
import { Countdown } from '@/components/Countdown.tsx';
import { PresenceCard } from '@/components/PresenceCard.tsx';
import { ScreenHeader } from '@/components/ScreenHeader.tsx';
import { Button } from '@/components/ui/button.tsx';
import {
  meName as resolveMyName,
  partnerOf,
  readCoupleMeta,
} from '@/features/couple/couple-state.ts';
import { readGifts, isUnlocked } from '@/features/gifts/gifts-state.ts';
import { readMemories, onThisDay } from '@/features/memories/memories-state.ts';
import { readShifts, readTrips } from '@/features/schedule/schedule-state.ts';
import { readSurprises } from '@/features/surprises/surprises-state.ts';
import {
  bothOnline as bothOnlineCheck,
  isOnline,
  readPresence,
} from '@/features/presence/presence-state.ts';
import { addDays, formatDateShort, toLocalDateString } from '@/lib/dates.ts';
import { findMutualFreeDays, nextTogether, tripCoversDate } from '@/lib/schedule.ts';
import { isSurpriseUnlocked } from '@/lib/surprises.ts';
import { useTick } from '@/lib/useTick.ts';
import { useYjs } from '@/sync/useYjs.ts';
import type { Route } from '@/router.ts';

interface Props {
  doc: Y.Doc;
  myDeviceId: string;
  onNavigate: (route: Route) => void;
}

export function HomePage({ doc, myDeviceId, onNavigate }: Props) {
  const meta = useYjs(doc, readCoupleMeta);
  const trips = useYjs(doc, readTrips);
  const shifts = useYjs(doc, readShifts);
  const gifts = useYjs(doc, readGifts);
  const surprises = useYjs(doc, readSurprises);
  const memories = useYjs(doc, readMemories);
  const presence = useYjs(doc, readPresence);
  const now = useTick(5_000);

  const today = toLocalDateString(new Date());
  const partner = partnerOf(meta, myDeviceId);
  const me = resolveMyName(meta, myDeviceId);

  // Gift unlock guard — show a banner if any gift addressed to me has unlocked
  const unlockedForMe = gifts.find(
    (g) =>
      isUnlocked(g) &&
      !g.openedAt &&
      (g.recipientDevice === myDeviceId || g.recipientDevice === null) &&
      g.authorDevice !== myDeviceId,
  );

  // Surprise unlock — newest unread one from partner
  const unreadSurprise = surprises.find(
    (s) =>
      s.author_device !== myDeviceId &&
      !s.read_at &&
      isSurpriseUnlocked(s, meta.next_visit_date),
  );

  // Schedule status today
  const myShiftToday = shifts.find((s) => s.user_id === myDeviceId && s.date === today)?.shift_type;
  const partnerShiftToday = partner
    ? shifts.find((s) => s.user_id === partner.device_id && s.date === today)?.shift_type ?? null
    : null;
  const myTripNow = trips.find(
    (t) => t.traveller_id === myDeviceId && tripCoversDate(t, today),
  );
  const partnerTripNow = partner
    ? trips.find((t) => t.traveller_id === partner.device_id && tripCoversDate(t, today))
    : null;

  const userIds = partner ? [myDeviceId, partner.device_id] : [myDeviceId];
  const mutualFree = findMutualFreeDays({
    shifts,
    trips,
    userIds,
    fromDate: today,
    limit: 3,
  });
  const nt = nextTogether({ trips, mutualFreeDays: mutualFree, today });

  // countdown priority: next trip > anniversary
  const nextTrip = trips.find(
    (t) => new Date(t.depart_at).getTime() >= new Date(today).getTime(),
  );
  const countdown = nextTrip
    ? {
        date: nextTrip.depart_at,
        label: `${nextTrip.origin_city} → ${nextTrip.destination_city}`,
        transport: nextTrip.transport ? { name: nextTrip.transport, ref: nextTrip.transport_ref } : null,
      }
    : meta.anniversary_date
      ? { date: nextAnniversaryFrom(meta.anniversary_date, today), label: 'our anniversary', transport: null }
      : null;

  const onThisDayMemories = onThisDay(memories);

  return (
    <div className="flex flex-col gap-4 px-4">
      <ScreenHeader eyebrow="Home" title={greeting()} lede={statusLine(meta, today)} />

      {unlockedForMe && (
        <button
          type="button"
          onClick={() => onNavigate('gifts')}
          className="rounded-2xl p-5 text-left bg-[var(--gold)] text-[var(--background)] flex flex-col gap-1 active:scale-[0.99] transition-transform"
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.16em]">A letter is open</p>
          <p className="font-serif text-xl">
            {unlockedForMe.headline || 'Tap to read'}
          </p>
        </button>
      )}

      {unreadSurprise && (
        <button
          type="button"
          onClick={() => onNavigate('surprises')}
          className="rounded-2xl p-5 text-left bg-[var(--card)] border border-[var(--gold-glow)] flex flex-col gap-1 sealed-sheen"
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--gold)]">
            From {partner?.display_name ?? 'them'}
          </p>
          <p className="font-serif text-lg">A new surprise</p>
        </button>
      )}

      {countdown && (
        <Countdown
          target={countdown.date}
          label={countdown.label}
          transport={countdown.transport}
        />
      )}

      <PresenceCard
        meName={me}
        partnerName={partner?.display_name ?? null}
        meStatus={statusFor(myShiftToday, myTripNow ? `${myTripNow.origin_city} → ${myTripNow.destination_city}` : null)}
        partnerStatus={statusFor(
          partnerShiftToday,
          partnerTripNow ? `${partnerTripNow.origin_city} → ${partnerTripNow.destination_city}` : null,
        )}
        meAvatar={meta.avatars[myDeviceId] ?? null}
        partnerAvatar={partner ? meta.avatars[partner.device_id] ?? null : null}
        meOnline={isOnline(presence, myDeviceId, now)}
        partnerOnline={partner ? isOnline(presence, partner.device_id, now) : false}
        bothHere={bothOnlineCheck(presence, myDeviceId, partner?.device_id ?? null, now)}
      />

      {nt.kind === 'mutual_free' && (
        <Card>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--gold)]">
            Next together
          </p>
          <p className="font-serif text-xl mt-1">
            {formatDateShort(nt.date)} — both off
          </p>
          <p className="text-[var(--muted-foreground)] text-sm mt-1">
            {nt.daysAway} day{nt.daysAway === 1 ? '' : 's'} away
          </p>
        </Card>
      )}

      {nt.kind === 'together_now' && (
        <Card>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--gold)]">
            Together
          </p>
          <p className="font-serif text-xl mt-1">Right now, ends {formatDateShort(nt.endsOn)}</p>
        </Card>
      )}

      {onThisDayMemories.length > 0 && (
        <Card>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--gold)]">
            On this day
          </p>
          <ul className="flex flex-col gap-3 mt-2">
            {onThisDayMemories.slice(0, 3).map((m) => (
              <li key={m.id} className="flex flex-col gap-1">
                <p className="text-[var(--muted-foreground)] text-xs font-mono">
                  {formatDateShort(m.memory_date)}
                </p>
                {m.content && <p className="font-serif text-base">{m.content}</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => onNavigate('todos')}>
          Things to do
        </Button>
        <Button variant="secondary" onClick={() => onNavigate('gifts')}>
          Gift letters
        </Button>
        <Button variant="secondary" onClick={() => onNavigate('memories')}>
          Memories
        </Button>
        <Button variant="secondary" onClick={() => onNavigate('games')}>
          Games
        </Button>
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-5 border border-[var(--border)] bg-[var(--card)]">
      {children}
    </div>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'late night';
  if (h < 12) return 'good morning';
  if (h < 18) return 'afternoon';
  return 'evening';
}

function statusLine(
  meta: ReturnType<typeof readCoupleMeta>,
  today: string,
): string | undefined {
  if (meta.anniversary_date) {
    const next = nextAnniversaryFrom(meta.anniversary_date, today);
    const days = Math.ceil((new Date(next).getTime() - Date.now()) / 86_400_000);
    return days <= 30 ? `${days} days until anniversary.` : undefined;
  }
  return undefined;
}

function statusFor(shift: string | null | undefined, tripLabel: string | null): string {
  if (tripLabel) return `travelling: ${tripLabel}`;
  switch (shift) {
    case 'work':
      return 'working';
    case 'busy':
      return 'busy';
    case 'half':
      return 'half day';
    case 'off':
      return 'free';
    default:
      return '—';
  }
}

function nextAnniversaryFrom(anniversaryIso: string, todayIso: string): string {
  const today = new Date(todayIso);
  const ann = new Date(anniversaryIso);
  let year = today.getFullYear();
  const candidate = new Date(year, ann.getMonth(), ann.getDate(), 9, 0);
  if (candidate.getTime() < today.getTime()) {
    year++;
    return new Date(year, ann.getMonth(), ann.getDate(), 9, 0).toISOString();
  }
  return candidate.toISOString();
}
