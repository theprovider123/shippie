import type { CSSProperties } from 'react';
import { useMemo, useRef, useState } from 'react';
import { ALL_FIXTURES, HOST_CITIES, HOST_CITY_PROFILES, TEAM_PROFILES, TEAMS, teamByCode } from '../data/tournament.ts';

export function CityPaperAtlas() {
  const [selectedCode, setSelectedCode] = useState(HOST_CITIES[0]?.code ?? '');
  const spotlightRef = useRef<HTMLElement | null>(null);
  const selectedCity = HOST_CITIES.find((city) => city.code === selectedCode) ?? HOST_CITIES[0]!;
  const spotlightProfile = HOST_CITY_PROFILES[selectedCity.code]!;
  const spotlightMatches = useMemo(
    () => ALL_FIXTURES.filter((fixture) => fixture.cityCode === selectedCity.code),
    [selectedCity.code],
  );
  const visitingTeams = useMemo(() => {
    const codes = new Set<string>();
    for (const fixture of spotlightMatches) {
      if (isKnownTeamCode(fixture.home)) codes.add(fixture.home);
      if (isKnownTeamCode(fixture.away)) codes.add(fixture.away);
    }
    return [...codes].slice(0, 6).map((code) => ({ team: teamByCode(code), profile: TEAM_PROFILES[code] }));
  }, [spotlightMatches]);

  const selectCity = (code: string, scroll = false) => {
    setSelectedCode(code);
    if (scroll) {
      window.setTimeout(() => spotlightRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 0);
    }
  };

  return (
    <section className="city-paper-atlas">
      <div className="panel-head">
        <h2>Explore cities</h2>
        <span>venues · food · fixtures</span>
      </div>
      <div className="city-ribbon" aria-label="Choose host city">
        {HOST_CITIES.map((city) => (
          <button
            key={city.code}
            type="button"
            className={city.code === selectedCity.code ? 'active' : ''}
            onClick={() => selectCity(city.code)}
            style={{
              '--city-a': city.palette[0],
              '--city-b': city.palette[1],
              '--city-c': city.palette[2],
            } as CSSProperties}
          >
            {city.name}
          </button>
        ))}
      </div>
      <article
        ref={spotlightRef}
        className="city-spotlight"
        style={{
          '--city-a': selectedCity.palette[0],
          '--city-b': selectedCity.palette[1],
          '--city-c': selectedCity.palette[2],
        } as CSSProperties}
      >
        <div>
          <span>{selectedCity.country} city guide</span>
          <h3>{selectedCity.name}</h3>
          <p>{spotlightProfile.cityNote}</p>
        </div>
        <dl className="city-facts">
          <div>
            <span>Venue</span>
            <strong>{spotlightProfile.venueName}</strong>
          </div>
          <div>
            <span>Matches</span>
            <strong>{spotlightMatches.length}</strong>
          </div>
          <div>
            <span>Local time</span>
            <strong>{timeZoneLabel(spotlightProfile.timeZone)}</strong>
          </div>
          <div>
            <span>Room bite</span>
            <strong>{spotlightProfile.localBite.replace('Room snack idea: ', '')}</strong>
          </div>
        </dl>
      </article>

      <div className="city-detail-grid">
        <section>
          <div className="panel-head">
            <h3>Match programme</h3>
            <span>{spotlightMatches.length} fixtures</span>
          </div>
          <div className="city-fixture-list">
            {spotlightMatches.slice(0, 6).map((fixture) => (
              <article key={fixture.id}>
                <span>Match {fixture.matchNo}</span>
                <strong>{teamName(fixture.home)} v {teamName(fixture.away)}</strong>
                <small>{fixture.stage} · {fixture.group} · {formatCityKickoff(fixture.kickoff, spotlightProfile.timeZone)}</small>
              </article>
            ))}
          </div>
        </section>
        <section>
          <div className="panel-head">
            <h3>Teams passing through</h3>
            <span>{visitingTeams.length} stories</span>
          </div>
          <div className="city-team-list">
            {visitingTeams.map(({ team, profile }) => (
              <article key={team.code} style={{ '--swatch-a': team.swatch[0], '--swatch-b': team.swatch[1] } as CSSProperties}>
                <i />
                <div>
                  <strong>{team.name}</strong>
                  <p>{profile?.shortFact}</p>
                  <small>{profile?.roomPrompt}</small>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

      <div className="city-paper-grid" aria-label="Host city paper treatments">
        {HOST_CITIES.map((city) => {
          const profile = HOST_CITY_PROFILES[city.code];
          const matchCount = ALL_FIXTURES.filter((fixture) => fixture.cityCode === city.code).length;
          return (
            <button
              key={city.code}
              type="button"
              className={`city-paper-card motif-${city.motif}${city.code === selectedCity.code ? ' active' : ''}`}
              onClick={() => selectCity(city.code, true)}
              style={{
                '--city-a': city.palette[0],
                '--city-b': city.palette[1],
                '--city-c': city.palette[2],
              } as CSSProperties}
              aria-label={`Explore ${city.name}`}
            >
              <div className="city-card-visual" aria-hidden="true">
                <span />
                <i />
                <b />
              </div>
              <div className="city-card-copy">
                <span>{city.country}</span>
                <strong>{city.name}</strong>
                <p>{profile?.paperNote}</p>
                <div className="city-mini-facts">
                  <div>
                    <span>Venue</span>
                    <strong>{profile?.venueName}</strong>
                  </div>
                  <div>
                    <span>Matches</span>
                    <strong>{matchCount}</strong>
                  </div>
                  <div>
                    <span>Bite</span>
                    <strong>{profile?.localBite.replace('Room snack idea: ', '')}</strong>
                  </div>
                </div>
              </div>
              <div className="city-card-palette" aria-hidden="true">
                {city.palette.map((colour) => <i key={colour} style={{ background: colour }} />)}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function formatCityKickoff(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
    timeZoneName: 'short',
  }).format(new Date(value));
}

function timeZoneLabel(timeZone: string): string {
  return timeZone.replace('America/', '').replace(/_/g, ' ');
}

function teamName(code: string): string {
  if (!isKnownTeamCode(code)) return code.replace(/ (home|away)$/i, '').replace(/-/g, ' ');
  return teamByCode(code).name;
}

function isKnownTeamCode(code: string): boolean {
  return TEAMS.some((team) => team.code === code);
}
