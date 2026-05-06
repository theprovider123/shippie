import { useState } from 'react';
import type {
  Broadcast,
  CrewGroup,
  ItineraryStop,
  Player,
  PulseKind,
  Role,
  SurpriseDrop,
  Tab,
  TripDay,
  TripTimelineItem,
} from '../types';
import type { Copy } from '../data/translations';
import { DayToggle } from './Atoms';
import { Icon } from './Icon';
import type { TripPhase } from '../utils/state';
import type { buildPersonalTrip, buildPulseStats } from '../utils/state';
import { pulseActions } from '../data/games';

interface TripViewProps {
  copy: Copy;
  role: Role;
  days: TripDay[];
  activeDayId: string;
  onSelectDay: (dayId: string) => void;
  phase: TripPhase;
  pulseStats: ReturnType<typeof buildPulseStats>;
  latestBroadcast: Broadcast | null;
  surprises: SurpriseDrop[];
  lockedSurpriseCount: number;
  personalTrip: ReturnType<typeof buildPersonalTrip>;
  hostPrompts: string[];
  currentStop: ItineraryStop;
  nextStop: ItineraryStop | undefined;
  tripTimelineItems: TripTimelineItem[];
  coverUrl: string | null;
  groups: CrewGroup[];
  activePlayer: Player;
  onPulse: (kind: PulseKind) => void;
  onGo: (tab: Tab) => void;
  onSecondary: () => void;
  onReveal: (dropId: string) => void;
  onSelectTimelineItem: (item: TripTimelineItem) => void;
}

export function TripView(props: TripViewProps) {
  return (
    <section className="view trip-view">
      {props.coverUrl ? (
        <header className="trip-hero" style={{ backgroundImage: `url(${props.coverUrl})` }}>
          <div className="trip-hero-shade" />
          <div className="trip-hero-copy">
            <p className="eyebrow">{props.phase.label}</p>
            <h2>{props.phase.title}</h2>
            <p>{props.phase.detail}</p>
          </div>
        </header>
      ) : (
        <header className="trip-card-head">
          <p className="eyebrow">{props.phase.label}</p>
          <h2>{props.phase.title}</h2>
          <p>{props.phase.detail}</p>
        </header>
      )}

      <DayToggle days={props.days} selectedDayId={props.activeDayId} onSelect={props.onSelectDay} />

      <PhasePrimary
        phase={props.phase}
        role={props.role}
        latestBroadcast={props.latestBroadcast}
        currentStop={props.currentStop}
        nextStop={props.nextStop}
        onGo={props.onGo}
        onSecondary={props.onSecondary}
      />

      <PulseDock
        pulses={pulseActions}
        stats={props.pulseStats}
        onPulse={props.onPulse}
      />

      <SurpriseShelf surprises={props.surprises} lockedCount={props.lockedSurpriseCount} onReveal={props.onReveal} />

      <details className="trip-fold">
        <summary>
          <span>{props.role === 'host' ? 'Host signals' : 'My trip'}</span>
          <small>{props.role === 'host' ? `${props.hostPrompts.length} prompts` : `${props.personalTrip.score} pts`}</small>
        </summary>
        {props.role === 'host'
          ? <HostPromptStack prompts={props.hostPrompts} />
          : <PersonalTripCard personalTrip={props.personalTrip} />}
      </details>

      <details className="trip-fold">
        <summary>
          <span>{props.copy.tripTimeline}</span>
          <small>{props.tripTimelineItems.length} items today</small>
        </summary>
        <TripTimeline items={props.tripTimelineItems} copy={props.copy} onSelect={props.onSelectTimelineItem} />
      </details>
    </section>
  );
}

function PhasePrimary(props: {
  phase: TripPhase;
  role: Role;
  latestBroadcast: Broadcast | null;
  currentStop: ItineraryStop;
  nextStop: ItineraryStop | undefined;
  onGo: (tab: Tab) => void;
  onSecondary: () => void;
}) {
  return (
    <article className="trip-now app-card">
      <div className="trip-now-stop">
        <p className="eyebrow">{props.currentStop.time}</p>
        <h3>{props.currentStop.title}</h3>
        <p>{props.currentStop.place}</p>
        {props.nextStop ? <span>Next: {props.nextStop.title}</span> : null}
      </div>
      {props.latestBroadcast ? (
        <article className="mode-broadcast">
          <span>{props.latestBroadcast.at || 'Now'}</span>
          <p>{props.latestBroadcast.text}</p>
        </article>
      ) : null}
      <div className="mode-actions">
        <button type="button" onClick={() => props.onGo(props.phase.primaryTab)}>{props.phase.primaryAction}</button>
        <button type="button" className="ghost" onClick={props.onSecondary}>{props.role === 'host' ? 'Send update' : 'Memories'}</button>
      </div>
    </article>
  );
}

function PulseDock(props: {
  pulses: typeof pulseActions;
  stats: ReturnType<typeof buildPulseStats>;
  onPulse: (kind: PulseKind) => void;
}) {
  const [pulseFlash, setPulseFlash] = useState<PulseKind | null>(null);
  return (
    <section className="pulse-section app-card" aria-label="Crew pulse">
      <div className="pulse-heading">
        <strong>Crew pulse</strong>
        <small>{props.stats.total ? props.stats.topLabel : 'Ask for a quick signal'}</small>
      </div>
      <div className="pulse-dock">
        {props.pulses.map((pulse) => (
          <button
            key={pulse.kind}
            type="button"
            className={pulseFlash === pulse.kind ? 'pulse-flash' : ''}
            onClick={() => {
              setPulseFlash(pulse.kind);
              window.setTimeout(() => setPulseFlash((current) => (current === pulse.kind ? null : current)), 360);
              props.onPulse(pulse.kind);
            }}
          >
            <strong>{pulse.label}</strong>
            <small>{pulse.detail}</small>
          </button>
        ))}
      </div>
      {props.stats.total ? (
        <div className="pulse-summary">
          <div>
            <strong>{props.stats.topLabel}</strong>
            <small>{props.stats.total} crew signals</small>
          </div>
          {props.stats.groups.slice(0, 3).map((group) => (
            <span key={group.id} style={{ borderColor: group.color }}>{group.label}</span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function SurpriseShelf(props: { surprises: SurpriseDrop[]; lockedCount: number; onReveal: (dropId: string) => void }) {
  if (!props.surprises.length && !props.lockedCount) return null;
  return (
    <div className="surprise-shelf">
      {props.surprises.slice(0, 2).map((drop) => (
        <article key={drop.id}>
          <span><Icon name="sparkle" size={14} /> Unlocked</span>
          <strong>{drop.title}</strong>
          <p>{drop.message}</p>
          {drop.unlockType === 'manual' && !drop.revealedAt
            ? <button type="button" onClick={() => props.onReveal(drop.id)}>Reveal</button>
            : null}
        </article>
      ))}
      {props.lockedCount ? (
        <article className="locked">
          <span>{props.lockedCount} locked</span>
          <strong>More surprises waiting</strong>
          <p>Host drops unlock as the trip moves.</p>
        </article>
      ) : null}
    </div>
  );
}

function HostPromptStack({ prompts }: { prompts: string[] }) {
  if (!prompts.length) {
    return <p className="empty-note">All clear — the crew is settled. Send a broadcast or drop a surprise to nudge.</p>;
  }
  return (
    <div className="host-prompts-list">
      {prompts.slice(0, 3).map((prompt) => <span key={prompt}>{prompt}</span>)}
    </div>
  );
}

function PersonalTripCard({ personalTrip }: { personalTrip: ReturnType<typeof buildPersonalTrip> }) {
  return (
    <div className="personal-trip">
      <strong>My trip</strong>
      <span>{personalTrip.score} pts</span>
      <span>{personalTrip.entries} entries</span>
      <span>{personalTrip.memories} memories</span>
      <small>{personalTrip.award}</small>
    </div>
  );
}

function TripTimeline(props: {
  items: TripTimelineItem[];
  copy: Copy;
  onSelect: (item: TripTimelineItem) => void;
}) {
  if (!props.items.length) {
    return <p className="empty-note">Nothing scheduled yet — open the host menu to add a stop.</p>;
  }
  return (
    <div className="timeline combined">
      {props.items.map((item) => (
        <button key={item.id} type="button" className={`timeline-item ${item.kind}`} onClick={() => props.onSelect(item)}>
          <time>{item.time}</time>
          <div>
            <span>{props.copy[item.kind as keyof Copy] ?? item.kind}</span>
            <strong>{item.title}</strong>
            <small>{item.detail}</small>
          </div>
          {item.status ? <em>{item.status}</em> : null}
        </button>
      ))}
    </div>
  );
}

export function LiveActivityStrip({ activities, reduceMotion }: {
  activities: Array<{ id: string; text: string; at: string; kind: string }>;
  reduceMotion: boolean;
}) {
  const items = activities.length ? activities : [{ id: 'quiet', text: 'Crewtrip is ready', at: 'Now', kind: 'presence' }];
  const animated = !reduceMotion && items.length > 1;
  const loopItems = animated ? [...items, ...items] : items;
  return (
    <section
      className={animated ? 'live-strip' : 'live-strip static'}
      aria-label="Live activity"
      aria-live="polite"
      aria-atomic="false"
    >
      <div>
        {loopItems.slice(0, 12).map((item, index) => (
          <span key={`${item.id}-${index}`} className={item.kind}>
            <i />
            {item.text}
          </span>
        ))}
      </div>
    </section>
  );
}
