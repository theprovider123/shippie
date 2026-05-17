import type { CSSProperties } from 'react';
import { ALL_FIXTURES, HOST_CITIES, HOST_CITY_PROFILES, OPENING_FIXTURE, teamByCode, teamProfileByCode } from '../data/tournament.ts';
import type { Locale } from '../i18n.ts';
import { formatKickoff } from '../lib/time-zone.ts';
import type { UserProfile } from '../shared/local-store.ts';

export function ForYouStrip(props: {
  profile: UserProfile;
  locale: Locale;
  timeZone: string;
  onOpenSettings?: () => void;
}) {
  const team = teamByCode(props.profile.primaryTeam);
  const profile = teamProfileByCode(team.code);
  const followed = props.profile.followedTeams.map((code) => teamByCode(code)).slice(0, 5);
  const nextMatch = ALL_FIXTURES.find((fixture) => fixture.home === team.code || fixture.away === team.code);
  const hostCity = HOST_CITIES.find((city) => city.code === OPENING_FIXTURE.cityCode) ?? HOST_CITIES[0]!;
  const hostCityProfile = HOST_CITY_PROFILES[hostCity.code]!;

  return (
    <section className="for-you-strip" aria-label="For you">
      <div
        className="identity-ticket"
        style={{ '--swatch-a': team.swatch[0], '--swatch-b': team.swatch[1] } as CSSProperties}
      >
        <span className="flag-cloth" />
        <div>
          <small>Your tournament</small>
          <strong>{props.profile.displayName || team.name}</strong>
          <em>{team.name} · Group {team.group}</em>
        </div>
        {props.onOpenSettings ? <button type="button" onClick={props.onOpenSettings}>Edit</button> : null}
      </div>

      <div className="for-you-grid">
        <article>
          <span>Next for {team.code}</span>
          <strong>{nextMatch ? `${teamByCode(nextMatch.home).name} v ${teamByCode(nextMatch.away).name}` : 'Knockout route'}</strong>
          <p>{nextMatch ? `${nextMatch.city} · ${formatKickoff(nextMatch.kickoff, props.timeZone, props.locale)}` : 'Your route updates when the wall chart fills.'}</p>
        </article>
        <article>
          <span>Room prompt</span>
          <strong>{profile.roomPrompt}</strong>
          <p>{profile.shortFact}</p>
        </article>
        <article>
          <span>Host city</span>
          <strong>{hostCity.name}</strong>
          <p>{hostCityProfile.paperNote} Bite: {hostCityProfile.localBite}</p>
        </article>
      </div>
      <div className="mini-team-row compact for-you-following" aria-label="Followed teams">
        {followed.map((item) => (
          <i
            key={item.code}
            style={{ '--swatch-a': item.swatch[0], '--swatch-b': item.swatch[1] } as CSSProperties}
          >
            {item.code}
          </i>
        ))}
        <span>{followed.length} following</span>
      </div>
    </section>
  );
}
