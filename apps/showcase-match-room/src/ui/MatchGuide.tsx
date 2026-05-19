import { FEATURED_FIXTURES, HOST_CITY_PROFILES, OPENING_FIXTURE, TEAM_PROFILES, fixtureTitle, teamByCode, type Fixture } from '../data/tournament.ts';
import type { Locale } from '../i18n.ts';
import { formatKickoff } from '../lib/time-zone.ts';

export function MatchGuide(props: { locale: Locale; timeZone: string }) {
  const home = teamByCode(OPENING_FIXTURE.home);
  const away = teamByCode(OPENING_FIXTURE.away);
  const city = HOST_CITY_PROFILES[OPENING_FIXTURE.cityCode] ?? {
    cityNote: `${OPENING_FIXTURE.city} hosts this match, with kickoff times and room prompts kept in one place.`,
    localBite: 'Room snack idea: keep it simple and pick something everyone can reach.',
  };
  const nextFixtures = FEATURED_FIXTURES.filter((fixture) => fixture.id !== OPENING_FIXTURE.id).slice(0, 3);

  return (
    <section className="match-guide" aria-label="Match guide">
      <div className="section-head">
        <div>
          <span>Match guide</span>
          <h2>Kickoff, city, next games</h2>
        </div>
      </div>

      <div className="guide-grid">
        <GuideStat label="Kickoff" value={formatKickoff(OPENING_FIXTURE.kickoff, props.timeZone, props.locale)} />
        <GuideStat label="Venue" value={OPENING_FIXTURE.venue} />
        <GuideStat label="City" value={OPENING_FIXTURE.city} />
      </div>

      <div className="guide-note">
        <p>{city.cityNote}</p>
        <strong>{city.localBite}</strong>
      </div>

      <div className="team-context" aria-label="Team notes">
        <TeamNote code={home.code} name={home.name} />
        <TeamNote code={away.code} name={away.name} />
      </div>

      <div className="next-fixtures" aria-label="Next games">
        <span>Next games</span>
        <div>
          {nextFixtures.map((fixture) => (
            <FixtureChip key={fixture.id} fixture={fixture} locale={props.locale} timeZone={props.timeZone} />
          ))}
        </div>
      </div>
    </section>
  );
}

function GuideStat(props: { label: string; value: string }) {
  return (
    <article>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </article>
  );
}

function TeamNote(props: { code: string; name: string }) {
  const profile = TEAM_PROFILES[props.code];
  return (
    <article>
      <strong>{props.name}</strong>
      <p>{profile?.shortFact ?? 'A room storyline for predictions, reactions, and chat.'}</p>
    </article>
  );
}

function FixtureChip(props: { fixture: Fixture; locale: Locale; timeZone: string }) {
  return (
    <article className="fixture-chip">
      <time dateTime={props.fixture.kickoff}>{formatKickoff(props.fixture.kickoff, props.timeZone, props.locale)}</time>
      <strong>{fixtureTitle(props.fixture)}</strong>
      <span>{props.fixture.city}</span>
    </article>
  );
}
