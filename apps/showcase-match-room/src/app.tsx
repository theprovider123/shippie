import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { HostMatchday } from './host/HostMatchday.tsx';
import { GuestMatchday } from './guest/GuestMatchday.tsx';
import { DisplayMatchday } from './display/DisplayMatchday.tsx';
import { JoinForm } from './guest/JoinForm.tsx';
import { ALL_FIXTURES, HOST_CITIES, HOST_CITY_PROFILES, TEAMS, teamByCode } from './data/tournament.ts';
import { copyFor, detectLocale, type Locale } from './i18n.ts';
import { detectTimeZone } from './lib/time-zone.ts';
import { readSavedRooms, readUserProfile, saveRoomShortcut, saveUserProfile, type SavedRoom, type UserProfile } from './shared/local-store.ts';
import { getStablePeerId, randomId } from './shared/peer-id.ts';
import { matchRoomUrl, readRoomParams } from './shared/signal-config.ts';
import type { RoomTemplate } from './shared/types.ts';
import { BoardSwitcher } from './ui/BoardSwitcher.tsx';
import { ForYouStrip } from './ui/ForYouStrip.tsx';
import { InstallPanel } from './ui/InstallPanel.tsx';
import { EngagementLoopPanel } from './ui/EngagementLoopPanel.tsx';
import { ProfileSettings } from './ui/ProfileSettings.tsx';
import { ViralMomentsPanel } from './ui/ViralMomentsPanel.tsx';

const ROOM_TEMPLATES: RoomTemplate[] = ['friends', 'pub', 'family', 'office', 'hardcore', 'watch-party'];
const BOARD_PRESETS: Array<{ title: string; template: RoomTemplate; label: string }> = [
  { title: 'Personal board', template: 'hardcore', label: 'Personal' },
  { title: 'Friends board', template: 'friends', label: 'Friends' },
  { title: 'Family board', template: 'family', label: 'Family' },
  { title: 'Company board', template: 'office', label: 'Company' },
];

export function App() {
  const [params, setParams] = useState(() => readRoomParams());
  const peerId = useMemo(() => getStablePeerId(), []);
  const [profile, setProfile] = useState<UserProfile>(() => {
    const existing = readUserProfile();
    const detectedLocale = params.locale ?? detectLocale();
    const detectedTimeZone = params.timeZone ?? detectTimeZone();
    if (!existing.updatedAt) {
      return { ...existing, locale: detectedLocale, timeZone: detectedTimeZone };
    }
    return { ...existing, locale: params.locale ?? existing.locale, timeZone: params.timeZone ?? existing.timeZone };
  });
  const [locale, setLocale] = useState<Locale>(() => normaliseLocale(profile.locale));
  const [template, setTemplate] = useState<RoomTemplate>(() => params.template);
  const [timeZone, setTimeZone] = useState(() => profile.timeZone);
  const [savedRooms, setSavedRooms] = useState<SavedRoom[]>(() => readSavedRooms());
  const copy = useMemo(() => copyFor(locale), [locale]);
  const hasIdentity = Boolean(profile.updatedAt || profile.displayName);
  const latestRoom = savedRooms[0] ?? null;

  const updateProfile = (next: Partial<Omit<UserProfile, 'updatedAt'>>) => {
    const saved = saveUserProfile(next);
    setProfile(saved);
  };

  const updateLocale = (next: Locale) => {
    setLocale(next);
    setProfile(saveUserProfile({ locale: next }));
  };

  const updateTimeZone = (next: string) => {
    setTimeZone(next);
    setProfile(saveUserProfile({ timeZone: next }));
  };

  useEffect(() => {
    applyIdentityTheme(profile);
  }, [profile]);

  const startHost = (nextTemplate: RoomTemplate = template, title = boardTitle(nextTemplate)) => {
    const roomId = randomId('match').replace(/^match_/, 'match-');
    const roomKey = randomId('key').replace(/^key_/, '');
    const url = matchRoomUrl({ role: 'host', roomId, roomKey, template: nextTemplate, locale, timeZone });
    window.history.replaceState(null, '', url);
    setParams(readRoomParams());
    setTemplate(nextTemplate);
    setSavedRooms((rooms) => [
      saveRoomShortcut({ id: roomId, title, role: 'host', template: nextTemplate, url }),
      ...rooms.filter((room) => room.id !== roomId),
    ]);
  };

  useEffect(() => {
    if (!params.role || !params.roomId || !params.roomKey) return;
    const role = params.role;
    const roomId = params.roomId;
    const roomKey = params.roomKey;
    const url = matchRoomUrl({
      role,
      roomId,
      roomKey,
      signalBase: params.signalBase,
      template: params.template,
      locale,
      timeZone,
    });
    window.history.replaceState(null, '', url);
    setSavedRooms((rooms) => [
      saveRoomShortcut({
        id: roomId,
        title: boardTitle(params.template),
        role,
        template: params.template,
        url,
      }),
      ...rooms.filter((room) => room.id !== roomId || room.role !== role),
    ]);
  }, [locale, params.role, params.roomId, params.roomKey, params.signalBase, params.template, timeZone]);

  if (!params.role || !params.roomId || !params.roomKey) {
    return (
      <main className="start-screen">
        <section className="stadium-mark" aria-hidden="true">
          <div className="pitch">
            <span />
            <span />
            <span />
          </div>
        </section>
        <section className="start-panel">
          <p className="eyebrow">{copy.startEyebrow}</p>
          <h1>{copy.startHeadline}</h1>
          <p className="start-support">{copy.startSupport}</p>
          {hasIdentity ? (
            <LandingPassport
              profile={profile}
              locale={locale}
              timeZone={timeZone}
              latestRoom={latestRoom}
              onCreate={() => startHost()}
              onCreateTemplate={startHost}
              onProfileChange={updateProfile}
              onLocaleChange={updateLocale}
              onTimeZoneChange={updateTimeZone}
            />
          ) : null}
          {!hasIdentity ? (
            <>
              <div className="start-controls">
                <label>
                  {copy.templatesLabel}
                  <select value={template} onChange={(event) => setTemplate(event.currentTarget.value as RoomTemplate)}>
                    {ROOM_TEMPLATES.map((item) => (
                      <option key={item} value={item}>{templateLabel(copy, item)}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="start-actions start-actions-hero">
                <button className="primary-action" onClick={() => startHost()}>{copy.startAction}</button>
                <button type="button" onClick={() => document.getElementById('landing-routes')?.scrollIntoView({ behavior: 'smooth' })}>Room types</button>
              </div>
            </>
          ) : null}
          <JoinForm copy={copy} />
          {!hasIdentity ? (
            <details className="simple-drawer landing-identity-drawer">
              <summary>
                <span>Optional setup</span>
                <strong>Choose name, team, language, theme</strong>
              </summary>
              <ProfileSettings
                variant="panel"
                profile={profile}
                locale={locale}
                timeZone={timeZone}
                onProfileChange={updateProfile}
                onLocaleChange={updateLocale}
                onTimeZoneChange={updateTimeZone}
              />
            </details>
          ) : null}
          {hasIdentity ? null : <InstallPanel />}
          <div className="tournament-stats" aria-label="Tournament scale">
            <strong>{TEAMS.length}<span>nations</span></strong>
            <strong>{ALL_FIXTURES.length}<span>matches</span></strong>
            <strong>{HOST_CITIES.length}<span>host cities</span></strong>
          </div>
          <LandingRoutes onCreate={startHost} />
          {hasIdentity ? <ForYouStrip profile={profile} locale={locale} timeZone={timeZone} /> : <EngagementLoopPanel />}
          {hasIdentity ? null : <ViralMomentsPanel />}
          <LandingCityPreview />
          <BoardSwitcher rooms={savedRooms} onChange={setSavedRooms} />
        </section>
      </main>
    );
  }

  if (params.role === 'host') {
    return (
      <HostMatchday
        roomId={params.roomId}
        roomKey={params.roomKey}
        signalBase={params.signalBase}
        peerId={peerId}
        locale={locale}
        template={params.template}
        copy={copy}
        timeZone={timeZone}
        onTimeZoneChange={updateTimeZone}
        profile={profile}
        onProfileChange={updateProfile}
        onLocaleChange={updateLocale}
        savedRooms={savedRooms}
        onRoomsChange={setSavedRooms}
      />
    );
  }

  if (params.role === 'display') {
    return (
      <DisplayMatchday
        roomId={params.roomId}
        roomKey={params.roomKey}
        signalBase={params.signalBase}
        peerId={peerId}
        copy={copy}
      />
    );
  }

  return (
    <GuestMatchday
      roomId={params.roomId}
      roomKey={params.roomKey}
      signalBase={params.signalBase}
      peerId={peerId}
      template={params.template}
      copy={copy}
      locale={locale}
      timeZone={timeZone}
      onTimeZoneChange={updateTimeZone}
      profile={profile}
      onProfileChange={updateProfile}
      onLocaleChange={updateLocale}
      savedRooms={savedRooms}
      onRoomsChange={setSavedRooms}
    />
  );
}

function normaliseLocale(locale: string): Locale {
  return locale === 'en-US' || locale === 'es' || locale === 'fr' || locale === 'pt' || locale === 'de' ? locale : 'en-GB';
}

function applyIdentityTheme(profile: UserProfile) {
  const root = document.documentElement;
  const team = teamByCode(profile.primaryTeam);
  const [primary, secondary] = readableTeamSwatch(team.swatch);
  root.dataset.matchRoomTheme = profile.themeMode === 'pitch' ? 'pitch' : profile.themeMode;
  if (profile.themeMode === 'team') {
    root.style.setProperty('--pitch', primary);
    root.style.setProperty('--pitch-deep', darken(primary));
    root.style.setProperty('--pitch-bright', secondary);
    root.style.setProperty('--pitch-soft', `${primary}20`);
    root.style.setProperty('--gold', secondary);
    root.style.setProperty('--gold-deep', darken(secondary));
    root.style.setProperty('--gold-soft', `${secondary}22`);
  } else {
    for (const property of ['--pitch', '--pitch-deep', '--pitch-bright', '--pitch-soft', '--gold', '--gold-deep', '--gold-soft']) {
      root.style.removeProperty(property);
    }
  }
}

function readableTeamSwatch(swatch: [string, string]): [string, string] {
  const nonWhite = swatch.filter((color) => !['#ffffff', '#fff', '#f4efe4'].includes(color.toLowerCase()));
  return [nonWhite[0] ?? '#0E5C3A', nonWhite[1] ?? swatch[1] ?? '#C9A24B'];
}

function darken(hex: string): string {
  const value = hex.replace('#', '');
  if (value.length !== 6) return hex;
  const parts = [0, 2, 4].map((index) => Math.max(0, Math.round(parseInt(value.slice(index, index + 2), 16) * 0.68)));
  return `#${parts.map((part) => part.toString(16).padStart(2, '0')).join('')}`;
}

function LandingPassport(props: {
  profile: UserProfile;
  locale: Locale;
  timeZone: string;
  latestRoom: SavedRoom | null;
  onCreate: () => void;
  onCreateTemplate: (template?: RoomTemplate, title?: string) => void;
  onProfileChange: (profile: Partial<Omit<UserProfile, 'updatedAt'>>) => void;
  onLocaleChange: (locale: Locale) => void;
  onTimeZoneChange: (timeZone: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const team = teamByCode(props.profile.primaryTeam);

  return (
    <section className="landing-passport" style={{ '--swatch-a': team.swatch[0], '--swatch-b': team.swatch[1] } as CSSProperties}>
      <div className="passport-card">
        <span className="flag-cloth" />
        <div>
          <small>Tournament passport</small>
          <strong>{props.profile.displayName || 'Match Room supporter'}</strong>
          <em>{team.name} · {props.profile.followedTeams.length} followed teams · {props.timeZone.replace('_', ' ')}</em>
        </div>
        <button type="button" onClick={() => setEditing((current) => !current)}>
          {editing ? 'Close' : 'Edit'}
        </button>
      </div>
      {editing ? (
        <ProfileSettings
          variant="panel"
          profile={props.profile}
          locale={props.locale}
          timeZone={props.timeZone}
          onProfileChange={props.onProfileChange}
          onLocaleChange={props.onLocaleChange}
          onTimeZoneChange={props.onTimeZoneChange}
        />
      ) : (
        <div className="passport-actions">
          {props.latestRoom ? <a className="share-card-link" href={props.latestRoom.url}>Enter {props.latestRoom.title}</a> : null}
          <button className="primary-action" type="button" onClick={props.onCreate}>Create room</button>
          <button type="button" onClick={() => props.onCreateTemplate('friends', 'Friends board')}>Friends</button>
          <button type="button" onClick={() => props.onCreateTemplate('office', 'Company board')}>Company</button>
        </div>
      )}
    </section>
  );
}

function LandingRoutes(props: { onCreate: (template?: RoomTemplate, title?: string) => void }) {
  const routes: Array<{ title: string; text: string; action: string; preset: (typeof BOARD_PRESETS)[number] }> = [
    { title: 'Friends', text: 'Score picks, receipts, VAR votes, and just enough chaos for the group chat.', action: 'Start friends room', preset: BOARD_PRESETS[1]! },
    { title: 'Family', text: 'Gentle trivia, flag colours, easy predictions, and no harsh callouts.', action: 'Start family room', preset: BOARD_PRESETS[2]! },
    { title: 'Company', text: '48-team sweepstake, HR-safe banter, daily five, and Monday recap cards.', action: 'Start office board', preset: BOARD_PRESETS[3]! },
    { title: 'Solo', text: 'Follow a team, track kickoff times, build a bracket, and share prediction receipts.', action: 'Start personal board', preset: BOARD_PRESETS[0]! },
  ];

  return (
    <section id="landing-routes" className="landing-routes" aria-label="Ways to use Match Room">
      <div className="panel-head">
        <h2>Pick your route</h2>
        <span>one app, many rooms</span>
      </div>
      <div className="route-grid">
        {routes.map((route) => (
          <article key={route.title}>
            <span>{route.title}</span>
            <p>{route.text}</p>
            <button type="button" onClick={() => props.onCreate(route.preset.template, route.preset.title)}>
              {route.action}
            </button>
          </article>
        ))}
      </div>
      <div className="viral-strip">
        <strong>Share loops built in</strong>
        <span>Prediction receipts</span>
        <span>Room invite cards</span>
        <span>Trivia flexes</span>
        <span>City stamps</span>
      </div>
    </section>
  );
}

function LandingCityPreview() {
  const featured = HOST_CITIES.slice(0, 4);
  return (
    <section className="landing-city-preview" aria-label="Host city preview">
      <div className="panel-head">
        <h2>Host city papers</h2>
        <span>useful, not just pretty</span>
      </div>
      <div className="landing-city-grid">
        {featured.map((city) => {
          const profile = HOST_CITY_PROFILES[city.code]!;
          const matchCount = ALL_FIXTURES.filter((fixture) => fixture.cityCode === city.code).length;
          return (
            <article
              key={city.code}
              style={{
                '--city-a': city.palette[0],
                '--city-b': city.palette[1],
                '--city-c': city.palette[2],
              } as CSSProperties}
            >
              <span>{city.name}</span>
              <strong>{matchCount} matches</strong>
              <p>{profile.paperNote}</p>
              <small>{profile.localBite.replace('Room snack idea: ', '')}</small>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function boardTitle(template: RoomTemplate): string {
  switch (template) {
    case 'family':
      return 'Family board';
    case 'office':
      return 'Company board';
    case 'hardcore':
      return 'Personal board';
    case 'pub':
      return 'Pub board';
    case 'watch-party':
      return 'Watch party board';
    case 'friends':
      return 'Friends board';
  }
}

function templateLabel(copy: ReturnType<typeof copyFor>, template: RoomTemplate): string {
  switch (template) {
    case 'friends':
      return copy.templateFriends;
    case 'pub':
      return copy.templatePub;
    case 'family':
      return copy.templateFamily;
    case 'office':
      return copy.templateOffice;
    case 'hardcore':
      return copy.templateHardcore;
    case 'watch-party':
      return copy.templateWatchParty;
  }
}
