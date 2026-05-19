import { useEffect, useMemo, useState } from 'react';
import { OPENING_FIXTURE, fixtureTitle, teamByCode } from './data/tournament.ts';
import { formatKickoff } from './lib/time-zone.ts';
import type { Locale } from './i18n.ts';

/**
 * HeroScoreboard — full-bleed scoreboard hero for the Match Room landing.
 *
 * Replaces the bordered-card "opening match preview" with a programme-grade
 * scoreboard: team-color stripes (gold-leaf on pitch-green), a 96px Fraunces
 * fixture title, a mono kickoff-countdown ("KICK-OFF IN 1:23:45"), and a
 * presence pill of the form "[N] in the room".
 *
 * Pure presentation — no relay-gossip coupling. Render with peerCount=0
 * before any room exists.
 */
export function HeroScoreboard(props: {
  peerCount: number;
  timeZone: string;
  locale: Locale;
  homeScore?: number | null;
  awayScore?: number | null;
  liveLabel?: string | null;
}) {
  const home = teamByCode(OPENING_FIXTURE.home);
  const away = teamByCode(OPENING_FIXTURE.away);
  const kickoffMs = useMemo(() => new Date(OPENING_FIXTURE.kickoff).getTime(), []);

  return (
    <section
      className="hero-scoreboard"
      data-testid="hero-scoreboard"
      aria-label="Opening fixture scoreboard"
      style={{
        // Two team-color stripes flanking the scoreboard, gold-leaf accents
        // composited on a pitch-green wash. Inline so design swatches stay
        // tied to live team data.
        ['--home-color' as string]: home.swatch[0],
        ['--home-color-2' as string]: home.swatch[1],
        ['--away-color' as string]: away.swatch[0],
        ['--away-color-2' as string]: away.swatch[1],
      }}
    >
      <div className="hero-scoreboard__stripe hero-scoreboard__stripe--home" aria-hidden />
      <div className="hero-scoreboard__stripe hero-scoreboard__stripe--away" aria-hidden />
      <div className="hero-scoreboard__pitch" aria-hidden />

      <div className="hero-scoreboard__inner">
        <p className="hero-scoreboard__eyebrow">{OPENING_FIXTURE.stage} · Group {OPENING_FIXTURE.group}</p>
        <h1 className="hero-scoreboard__title">{fixtureTitle(OPENING_FIXTURE)}</h1>

        <div className="hero-scoreboard__row">
          <HeroTeam team={home} align="left" />
          <div className="hero-scoreboard__score">
            <strong>
              {numberOrDash(props.homeScore)}
              <span>·</span>
              {numberOrDash(props.awayScore)}
            </strong>
            <em>{props.liveLabel ?? 'Awaiting kick-off'}</em>
          </div>
          <HeroTeam team={away} align="right" />
        </div>

        <div className="hero-scoreboard__strip">
          <span className="hero-scoreboard__venue">
            {OPENING_FIXTURE.venue}, {OPENING_FIXTURE.city}
          </span>
          <Countdown kickoffMs={kickoffMs} timeZone={props.timeZone} locale={props.locale} />
          <PresencePill count={props.peerCount} />
        </div>
      </div>
    </section>
  );
}

function HeroTeam(props: { team: ReturnType<typeof teamByCode>; align: 'left' | 'right' }) {
  return (
    <div className={`hero-scoreboard__team hero-scoreboard__team--${props.align}`}>
      <span
        className="hero-scoreboard__crest"
        aria-hidden
        style={{ background: `linear-gradient(135deg, ${props.team.swatch[0]}, ${props.team.swatch[1]})` }}
      />
      <strong>{props.team.code}</strong>
      <em>{props.team.name}</em>
    </div>
  );
}

function PresencePill(props: { count: number }) {
  return (
    <span
      className="hero-scoreboard__presence"
      data-testid="hero-presence"
      aria-label={`${props.count} ${props.count === 1 ? 'person' : 'people'} in the room`}
    >
      <span className="hero-scoreboard__presence-dot" aria-hidden />
      <strong>{props.count}</strong>
      <em>{props.count === 1 ? 'in the room' : 'in the room'}</em>
    </span>
  );
}

function Countdown(props: { kickoffMs: number; timeZone: string; locale: Locale }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const remaining = props.kickoffMs - now;
  if (remaining <= 0) {
    return (
      <span className="hero-scoreboard__countdown is-live" data-testid="hero-countdown">
        <strong>KICK-OFF</strong>
        <em>{formatKickoff(new Date(props.kickoffMs).toISOString(), props.timeZone, props.locale)}</em>
      </span>
    );
  }
  return (
    <span className="hero-scoreboard__countdown" data-testid="hero-countdown">
      <strong>KICK-OFF IN {formatCountdown(remaining)}</strong>
      <em>{formatKickoff(new Date(props.kickoffMs).toISOString(), props.timeZone, props.locale)}</em>
    </span>
  );
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}:${pad(minutes)}:${pad(seconds)}`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function numberOrDash(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '-';
}
