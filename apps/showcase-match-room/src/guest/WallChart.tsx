import type { CSSProperties } from 'react';
import { ALL_FIXTURES, GROUPS, GROUP_STAGE_FIXTURES, HOST_CITIES, KNOCKOUT_FIXTURES, fixtureTeamName, fixtureTitle } from '../data/tournament.ts';
import type { Locale } from '../i18n.ts';
import { formatKickoff } from '../lib/time-zone.ts';

export function WallChart(props: { locale: Locale; timeZone: string }) {
  const visibleFixtures = [...GROUP_STAGE_FIXTURES.slice(0, 12), ...KNOCKOUT_FIXTURES.slice(-4)];
  return (
    <section className="wall-chart">
      <div className="panel-head">
        <h2>Wall chart</h2>
        <span>{ALL_FIXTURES.length} matches</span>
      </div>
      <div className="tournament-stats compact-stats">
        <strong>48 nations</strong>
        <strong>16 cities</strong>
        <strong>104 fixtures</strong>
      </div>
      <div className="city-ribbon" aria-label="Host city palette">
        {HOST_CITIES.map((city) => (
          <span key={city.code} title={city.name} style={{ '--city-a': city.palette[0], '--city-b': city.palette[1] } as CSSProperties} />
        ))}
      </div>
      <div className="group-grid" aria-label="Tournament groups">
        {Object.entries(GROUPS).map(([group, teams]) => (
          <article key={group}>
            <strong>Group {group}</strong>
            <p>{teams.map(fixtureTeamName).join(' · ')}</p>
          </article>
        ))}
      </div>
      <div className="fixture-list">
        {visibleFixtures.map((fixture) => (
          <article key={fixture.id} className="fixture-row">
            <strong>{fixture.matchNo}</strong>
            <div>
              <h3>{fixtureTitle(fixture)}</h3>
              <p>{fixture.city} · {fixture.group ? `Group ${fixture.group}` : fixture.stage} · {formatKickoff(fixture.kickoff, props.timeZone, props.locale)}</p>
            </div>
          </article>
        ))}
      </div>
      <p className="muted">Group stage preview plus the final knockout slots. Team names for knockout rounds resolve as the room confirms results.</p>
    </section>
  );
}
