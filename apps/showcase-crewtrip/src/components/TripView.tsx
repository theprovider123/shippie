import { useState } from 'react';
import type {
  Broadcast,
  CrewGroup,
  ItineraryStop,
  Player,
  PulseKind,
  Role,
  SoundtrackSlot,
  SurpriseDrop,
  Tab,
  TripDay,
  TripTimelineItem,
} from '../types';
import type { Copy } from '../data/translations';
import type { ReactNode } from 'react';
import { DayToggle } from './Atoms';
import { Icon } from './Icon';
import type { TripPhase } from '../utils/state';
import type { buildPersonalTrip, buildPulseStats } from '../utils/state';
import { playlistProviderLabel } from '../utils/state';
import { pulseActions } from '../data/games';
import type { ThemePalette } from '../data/themes';

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
  soundtrack: SoundtrackSlot | undefined;
  showPlan: boolean;
  showPoints: boolean;
  tripTimelineItems: TripTimelineItem[];
  coverUrl: string | null;
  groups: CrewGroup[];
  activePlayer: Player;
  palette: ThemePalette;
  onboarding?: ReactNode;
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

      <TimelinePanel
        title={props.copy.tripTimeline}
        items={props.tripTimelineItems}
        copy={props.copy}
        onSelect={props.onSelectTimelineItem}
      />

      {props.onboarding}

      {props.showPlan ? (
        <PhasePrimary
          phase={props.phase}
          role={props.role}
          latestBroadcast={props.latestBroadcast}
          currentStop={props.currentStop}
          nextStop={props.nextStop}
          onGo={props.onGo}
          onSecondary={props.onSecondary}
        />
      ) : null}

      <SoundtrackCard slot={props.soundtrack} />

      <PulseDock
        pulses={pulseActions}
        stats={props.pulseStats}
        palette={props.palette}
        onPulse={props.onPulse}
      />

      <SurpriseShelf surprises={props.surprises} lockedCount={props.lockedSurpriseCount} onReveal={props.onReveal} />

      <details className="trip-fold">
        <summary>
          <span>{props.role === 'host' ? 'Host signals' : 'My trip'}</span>
          <small>
            {props.role === 'host'
              ? `${props.hostPrompts.length} prompts`
              : props.showPoints
                ? `${props.personalTrip.score} pts`
                : `${props.personalTrip.entries} entries`}
          </small>
        </summary>
        {props.role === 'host'
          ? <HostPromptStack prompts={props.hostPrompts} />
          : <PersonalTripCard personalTrip={props.personalTrip} showPoints={props.showPoints} />}
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
  const waitingForHostPlan = props.role !== 'host' && props.currentStop.title === 'Start planning';
  return (
    <article className="trip-now app-card">
      <div className="trip-now-stop">
        <p className="eyebrow">{props.currentStop.time}</p>
        <h3>{waitingForHostPlan ? props.phase.title : props.currentStop.title}</h3>
        <p>{waitingForHostPlan ? props.phase.detail : props.currentStop.place}</p>
        {!waitingForHostPlan && props.nextStop ? <span>Next: {props.nextStop.title}</span> : null}
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

function SoundtrackCard({ slot }: { slot?: SoundtrackSlot }) {
  if (!slot) return null;
  return (
    <article className="soundtrack-card app-card">
      <div>
        <p className="eyebrow">{slot.time}</p>
        <h3>{slot.title}</h3>
        <p>{slot.dj}{slot.note ? ` / ${slot.note}` : ''}</p>
      </div>
      {slot.link ? (
        <a href={slot.link} target="_blank" rel="noreferrer">{playlistProviderLabel(slot.link)}</a>
      ) : null}
    </article>
  );
}

function PulseDock(props: {
  pulses: typeof pulseActions;
  stats: ReturnType<typeof buildPulseStats>;
  palette: ThemePalette;
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
        {props.pulses.map((pulse) => {
          const color = props.palette.pulseColors[pulse.kind] ?? 'var(--accent)';
          return (
            <button
              key={pulse.kind}
              type="button"
              className={pulseFlash === pulse.kind ? 'pulse-flash' : ''}
              style={{ ['--pulse-color' as string]: color }}
              onClick={() => {
                setPulseFlash(pulse.kind);
                window.setTimeout(() => setPulseFlash((current) => (current === pulse.kind ? null : current)), 360);
                props.onPulse(pulse.kind);
              }}
            >
              <strong>{pulse.label}</strong>
              <small>{pulse.detail}</small>
            </button>
          );
        })}
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
          <strong>More drops waiting</strong>
          <p>Host drops unlock as the trip moves.</p>
        </article>
      ) : null}
    </div>
  );
}

function HostPromptStack({ prompts }: { prompts: string[] }) {
  if (!prompts.length) {
    return <p className="empty-note">All clear — the crew is settled. Send a broadcast or add a drop to nudge.</p>;
  }
  return (
    <div className="host-prompts-list">
      {prompts.slice(0, 3).map((prompt) => <span key={prompt}>{prompt}</span>)}
    </div>
  );
}

function PersonalTripCard({ personalTrip, showPoints }: { personalTrip: ReturnType<typeof buildPersonalTrip>; showPoints: boolean }) {
  return (
    <div className="personal-trip">
      <strong>My trip</strong>
      {showPoints ? <span>{personalTrip.score} pts</span> : null}
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
        <button key={item.id} type="button" className={`timeline-item ${item.kind}${item.locked ? ' locked' : ''}`} onClick={() => props.onSelect(item)}>
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

function TimelinePanel(props: {
  title: string;
  items: TripTimelineItem[];
  copy: Copy;
  onSelect: (item: TripTimelineItem) => void;
}) {
  const nextItem = props.items.find((item) => item.status === 'now' || item.status === 'live' || item.status === 'ready') ?? props.items[0];
  return (
    <section className="timeline-panel" aria-label={props.title}>
      <header>
        <div>
          <p className="eyebrow">Today</p>
          <h3>{props.title}</h3>
        </div>
        <small>{nextItem ? `${nextItem.time} / ${nextItem.title}` : 'Nothing yet'}</small>
      </header>
      <TripTimeline items={props.items} copy={props.copy} onSelect={props.onSelect} />
    </section>
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
