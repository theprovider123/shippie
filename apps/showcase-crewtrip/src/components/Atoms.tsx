import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { CrewGroup, Memory, Player, TripDay } from '../types';
import { readOpfsFileUrl } from '../utils/media';

export function GroupMark({ group, size }: { group: CrewGroup; size?: 'small' | 'large' }) {
  const label = group.emoji || group.name.slice(0, 1).toUpperCase();
  return (
    <span className={`group-mark ${size === 'large' ? 'large' : ''}`} style={{ background: group.color }}>
      {group.imageDataUrl ? <img src={group.imageDataUrl} alt="" /> : label}
    </span>
  );
}

export function PlayerAvatar({ player, size }: { player: Player; size?: 'small' | 'large' }) {
  const initial = player.name.slice(0, 1).toUpperCase() || '?';
  return (
    <span className={`player-avatar ${size === 'large' ? 'large' : ''}`} style={{ background: player.color }}>
      {player.avatarDataUrl ? <img src={player.avatarDataUrl} alt="" /> : initial}
    </span>
  );
}

export function DayToggle({ days, selectedDayId, onSelect }: { days: TripDay[]; selectedDayId: string; onSelect: (dayId: string) => void }) {
  return (
    <div className="day-toggle" role="tablist" aria-label="Trip days">
      {days.map((day) => {
        const active = selectedDayId === day.id;
        return (
          <button
            key={day.id}
            role="tab"
            aria-selected={active}
            className={active ? 'active' : ''}
            onClick={() => onSelect(day.id)}
          >
            <strong>{day.label}</strong>
            <span>{day.date}</span>
          </button>
        );
      })}
    </div>
  );
}

export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

export function View(props: { title: string; kicker: string; children: ReactNode; onBack?: () => void; backLabel?: string }) {
  return (
    <section className="view">
      <header className="view-head">
        {props.onBack ? (
          <button type="button" className="back-button" onClick={props.onBack}>{props.backLabel ?? 'Back'}</button>
        ) : null}
        <div>
          <p className="eyebrow">{props.kicker}</p>
          <h2>{props.title}</h2>
        </div>
      </header>
      {props.children}
    </section>
  );
}

export function SegmentedControl<T extends string>(props: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="segmented-control" role="tablist" aria-label={props.ariaLabel ?? 'Segmented control'}>
      {props.options.map((option) => {
        const active = props.value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            className={active ? 'active' : ''}
            onClick={() => props.onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function MemoryCard({ memory, group, featured = false }: { memory: Memory; group?: CrewGroup; featured?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    if (memory.mediaDataUrl) {
      setUrl(memory.mediaDataUrl);
      return;
    }
    if (!memory.mediaPath) {
      setUrl(null);
      return;
    }
    void readOpfsFileUrl(memory.mediaPath)
      .then((next) => {
        if (cancelled) {
          URL.revokeObjectURL(next);
          return;
        }
        objectUrl = next;
        setUrl(next);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [memory.mediaDataUrl, memory.mediaPath]);

  return (
    <article className={`memory ${memory.kind}${featured ? ' featured' : ''}`}>
      {memory.kind === 'image' && url ? <img src={url} alt={memory.text} /> : null}
      {memory.kind === 'video' && url ? <video src={url} controls /> : null}
      <header>
        <time>{memory.at ?? 'Now'}</time>
        <span>{memory.kind}{group ? ` / ${group.name}` : ''}</span>
      </header>
      <p>{memory.text}</p>
      <small>{memory.author}</small>
    </article>
  );
}

export function ControlPanel({ title, children, tone }: { title: string; children: ReactNode; tone?: 'primary' | 'recessed' }) {
  return (
    <article className={`control-panel ${tone ?? ''}`.trim()}>
      <h3>{title}</h3>
      {children}
    </article>
  );
}

export function HostDisclosure({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <details className="control-panel host-disclosure">
      <summary>
        <span>
          <strong>{title}</strong>
          <small>{hint}</small>
        </span>
      </summary>
      <div className="host-disclosure-body">{children}</div>
    </details>
  );
}

export function MoreButton({ label, meta, onClick, icon }: { label: string; meta: string; onClick: () => void; icon?: ReactNode }) {
  return (
    <button type="button" className="more-button" onClick={onClick}>
      {icon ? <span className="more-icon">{icon}</span> : null}
      <span>{label}</span>
      <small>{meta}</small>
    </button>
  );
}

export function PollCard({ poll, selected, onVote, onChange }: {
  poll: { id: string; question: string; closes: string; open: boolean; options: Array<{ id: string; label: string; votes: number }> };
  selected?: string;
  onVote: (optionId: string) => void;
  onChange?: () => void;
}) {
  const total = poll.options.reduce((sum, option) => sum + option.votes, 0);
  return (
    <article className={poll.open ? 'poll-card' : 'poll-card closed'}>
      <div className="poll-title">
        <div>
          <span>{poll.open ? `Closes ${poll.closes}` : 'Closed'}</span>
          <h3>{poll.question}</h3>
        </div>
        <b>{total}</b>
      </div>
      <div className="poll-options">
        {poll.options.map((option) => {
          const pct = total > 0 ? Math.round((option.votes / total) * 100) : 0;
          const picked = selected === option.id;
          return (
            <button
              key={option.id}
              className={picked ? 'picked' : ''}
              aria-disabled={!poll.open || Boolean(selected)}
              aria-pressed={picked}
              onClick={() => {
                if (!poll.open || selected) return;
                onVote(option.id);
              }}
            >
              <span>{option.label}</span>
              <strong>{pct}%</strong>
              <i style={{ transform: `scaleX(${Math.max(0.03, pct / 100)})` }} />
            </button>
          );
        })}
      </div>
      {selected && poll.open && onChange ? (
        <button type="button" className="ghost change-vote" onClick={onChange}>Change my vote</button>
      ) : null}
    </article>
  );
}
