import { hostCityProfileByCode, teamProfileByCode, type Fixture } from '../data/tournament.ts';
import type { Copy, Locale } from '../i18n.ts';
import { formatKickoff, timeZoneLabel } from '../lib/time-zone.ts';
import { TimeZonePicker } from './TimeZonePicker.tsx';

export function MatchProgramme(props: {
  fixture: Fixture;
  locale: Locale;
  timeZone: string;
  copy: Copy;
  onTimeZoneChange: (timeZone: string) => void;
}) {
  const city = hostCityProfileByCode(props.fixture.cityCode);
  const home = teamProfileByCode(props.fixture.home);
  const away = teamProfileByCode(props.fixture.away);
  return (
    <section className="programme-panel">
      <div className="panel-head">
        <h2>{props.copy.programmeTitle}</h2>
        <span>{timeZoneLabel(props.timeZone)}</span>
      </div>
      <TimeZonePicker label={props.copy.timeZoneLabel} value={props.timeZone} onChange={props.onTimeZoneChange} />
      <div className="kickoff-grid">
        <div>
          <span>{props.copy.localKickoff}</span>
          <strong>{formatKickoff(props.fixture.kickoff, props.timeZone, props.locale)}</strong>
        </div>
        <div>
          <span>{props.copy.hostKickoff}</span>
          <strong>{formatKickoff(props.fixture.kickoff, city.timeZone, props.locale)}</strong>
        </div>
      </div>
      <div className="detail-grid">
        <article>
          <span>{props.copy.cityGuide}</span>
          <h3>{city.venueName}</h3>
          <p>{city.cityNote}</p>
          <p className="muted">{city.localBite}</p>
        </article>
        <article>
          <span>{props.copy.venueGuide}</span>
          <h3>{props.fixture.city}</h3>
          <p>{city.venueNote}</p>
          <p className="muted">{props.fixture.stage} · {props.fixture.group ? `Group ${props.fixture.group}` : props.fixture.stage}</p>
        </article>
      </div>
      <div className="team-notes">
        <article>
          <span>{props.fixture.home}</span>
          <h3>{home.region}</h3>
          <p>{home.shortFact}</p>
          <strong>{home.roomPrompt}</strong>
        </article>
        <article>
          <span>{props.fixture.away}</span>
          <h3>{away.region}</h3>
          <p>{away.shortFact}</p>
          <strong>{away.roomPrompt}</strong>
        </article>
      </div>
    </section>
  );
}
