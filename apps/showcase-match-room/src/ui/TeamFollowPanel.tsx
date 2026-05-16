import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { ALL_FIXTURES, GROUPS, TEAMS, fixtureTitle, teamByCode, teamProfileByCode } from '../data/tournament.ts';
import type { Locale } from '../i18n.ts';
import { formatKickoff } from '../lib/time-zone.ts';
import { readFollowedTeam, saveFollowedTeam } from '../shared/local-store.ts';

export function TeamFollowPanel(props: {
  locale: Locale;
  timeZone: string;
  followedTeam?: string;
  onFollow?: (code: string) => void;
}) {
  const [localFollowed, setLocalFollowed] = useState(() => readFollowedTeam()?.code ?? 'MEX');
  const followed = props.followedTeam ?? localFollowed;
  const team = teamByCode(followed);
  const profile = teamProfileByCode(followed);
  const groupCodes = GROUPS[team.group] ?? [followed];
  const nextFixtures = useMemo(
    () => ALL_FIXTURES.filter((fixture) => fixture.home === followed || fixture.away === followed).slice(0, 3),
    [followed],
  );

  const onFollow = (code: string) => {
    saveFollowedTeam(code);
    setLocalFollowed(code);
    props.onFollow?.(code);
  };

  return (
    <section className="follow-team-panel">
      <div className="panel-head">
        <h2>Follow a team</h2>
        <span>personal feed</span>
      </div>
      <label>
        Team
        <select value={followed} onChange={(event) => onFollow(event.currentTarget.value)}>
          {TEAMS.map((item) => (
            <option key={item.code} value={item.code}>{item.name}</option>
          ))}
        </select>
      </label>
      <div className="followed-team-card" style={{ '--swatch-a': team.swatch[0], '--swatch-b': team.swatch[1] } as CSSProperties}>
        <span className="flag-cloth" />
        <div>
          <small>Following</small>
          <strong>{team.name}</strong>
          <em>Group {team.group} · {profile.region}</em>
        </div>
      </div>
      <p>{profile.shortFact}</p>
      <div className="mini-team-row" aria-label={`Group ${team.group}`}>
        {groupCodes.map((code) => {
          const groupTeam = teamByCode(code);
          return (
            <button
              key={code}
              className={code === followed ? 'selected' : ''}
              style={{ '--swatch-a': groupTeam.swatch[0], '--swatch-b': groupTeam.swatch[1] } as CSSProperties}
              onClick={() => onFollow(code)}
              type="button"
            >
              {groupTeam.code}
            </button>
          );
        })}
      </div>
      <div className="fixture-list compact-list">
        {nextFixtures.map((fixture) => (
          <article key={fixture.id} className="fixture-row">
            <strong>{fixture.matchNo}</strong>
            <div>
              <b>{fixtureTitle(fixture)}</b>
              <p>{fixture.city} · {formatKickoff(fixture.kickoff, props.timeZone, props.locale)}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
