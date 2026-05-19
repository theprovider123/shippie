import { useEffect, useMemo, useState } from 'react';
import { HostMatchday } from './host/HostMatchday.tsx';
import { GuestMatchday } from './guest/GuestMatchday.tsx';
import { DisplayMatchday } from './display/DisplayMatchday.tsx';
import { JoinForm } from './guest/JoinForm.tsx';
import { teamByCode } from './data/tournament.ts';
import { copyFor, detectLocale, type Locale } from './i18n.ts';
import { detectTimeZone } from './lib/time-zone.ts';
import { readSavedRooms, readUserProfile, removeRoomShortcut, saveRoomShortcut, saveUserProfile, type SavedRoom, type UserProfile } from './shared/local-store.ts';
import { getStablePeerId, randomId } from './shared/peer-id.ts';
import { matchRoomUrl, readRoomParams } from './shared/signal-config.ts';
import type { RoomTemplate } from './shared/types.ts';
import { ProfileSettings } from './ui/ProfileSettings.tsx';

const TEMPLATE_DEFAULT: RoomTemplate = 'friends';

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
  const [timeZone, setTimeZone] = useState(() => profile.timeZone);
  const [savedRooms, setSavedRooms] = useState<SavedRoom[]>(() => readSavedRooms());
  const [profileOpen, setProfileOpen] = useState(false);
  const copy = useMemo(() => copyFor(locale), [locale]);

  const updateProfile = (next: Partial<Omit<UserProfile, 'updatedAt'>>) => {
    setProfile(saveUserProfile(next));
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

  // Start a room. `solo=true` creates a hidden "just me" room — same data
  // model, no invite expected. Front-door cold-start path that lets you
  // get value before sharing.
  const startHost = (opts: { template?: RoomTemplate; title?: string; solo?: boolean } = {}) => {
    const template = opts.template ?? (opts.solo ? 'hardcore' : TEMPLATE_DEFAULT);
    const title = opts.title ?? (opts.solo ? 'Just me' : 'Match room');
    const roomId = randomId('match').replace(/^match_/, 'match-');
    const roomKey = randomId('key').replace(/^key_/, '');
    const url = matchRoomUrl({ role: 'host', roomId, roomKey, template, locale, timeZone });
    window.history.replaceState(null, '', url);
    setParams(readRoomParams());
    setSavedRooms((rooms) => [
      saveRoomShortcut({ id: roomId, title, role: 'host', template, url }),
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
    setSavedRooms((rooms) => {
      const existing = rooms.find((room) => room.id === roomId && room.role === role);
      return [
        saveRoomShortcut({
          id: roomId,
          title: existing?.title ?? defaultRoomTitle(params.template),
          role,
          template: params.template,
          url,
        }),
        ...rooms.filter((room) => room.id !== roomId || room.role !== role),
      ];
    });
  }, [locale, params.role, params.roomId, params.roomKey, params.signalBase, params.template, timeZone]);

  if (!params.role || !params.roomId || !params.roomKey) {
    return <Landing
      profile={profile}
      locale={locale}
      timeZone={timeZone}
      savedRooms={savedRooms}
      profileOpen={profileOpen}
      onProfileOpen={setProfileOpen}
      onProfileChange={updateProfile}
      onLocaleChange={updateLocale}
      onTimeZoneChange={updateTimeZone}
      onStartHost={startHost}
      onRoomsChange={setSavedRooms}
      copy={copy}
    />;
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

  // The `display` role is preserved for old shared URLs. New "Cast"
  // affordances open `?role=display` in a new window from the host
  // info sheet; the URL contract is unchanged.
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

/**
 * Landing — one CTA, one join, one solo link, saved rooms.
 *
 * Replaces the previous landing's 11 stacked sections (PrivateSpaceHero,
 * LandingPassport, ROOM_TEMPLATES select, JoinForm, optional-setup
 * drawer, InstallPanel, LandingRoutes, tournament-stats strip,
 * ForYouStrip/EngagementLoopPanel, ViralMomentsPanel, and LandingCityPreview)
 * with a single scoreboard-style hero plus a saved-rooms
 * list. Settings live behind a single button (no more landing-passport
 * conditional split).
 */
function Landing(props: {
  profile: UserProfile;
  locale: Locale;
  timeZone: string;
  savedRooms: SavedRoom[];
  profileOpen: boolean;
  onProfileOpen: (open: boolean) => void;
  onProfileChange: (next: Partial<Omit<UserProfile, 'updatedAt'>>) => void;
  onLocaleChange: (next: Locale) => void;
  onTimeZoneChange: (next: string) => void;
  onStartHost: (opts?: { template?: RoomTemplate; title?: string; solo?: boolean }) => void;
  onRoomsChange: (rooms: SavedRoom[]) => void;
  copy: ReturnType<typeof copyFor>;
}) {
  const team = teamByCode(props.profile.primaryTeam);
  const hasIdentity = Boolean(props.profile.updatedAt || props.profile.displayName);
  const rooms = uniqueRooms(props.savedRooms);

  const removeRoom = (roomId: string) => {
    props.onRoomsChange(removeRoomShortcut(roomId));
  };

  return (
    <main className="wc-landing">
      <header className="wc-scoreboard">
        <div className="wc-scoreboard-row">
          <span className="wc-eyebrow">2026 · World Cup</span>
          <button
            type="button"
            className="wc-icon-btn"
            aria-label={props.profileOpen ? 'Close settings' : 'Open settings'}
            aria-expanded={props.profileOpen}
            onClick={() => props.onProfileOpen(!props.profileOpen)}
          >
            ⚙
          </button>
        </div>
        <h1 className="wc-display">Match Room</h1>
        <p className="wc-tagline">Watch the World Cup together. Private rooms. No accounts. No ads.</p>
        {hasIdentity ? (
          <p className="wc-passport">
            <span className="wc-passport-flag" style={{ background: team.swatch[0] }} aria-hidden="true" />
            <strong>{props.profile.displayName || 'Supporter'}</strong>
            <em>following {team.name}</em>
          </p>
        ) : null}
      </header>

      {props.profileOpen ? (
        <section className="wc-card wc-settings" aria-label="Profile and settings">
          <ProfileSettings
            variant="panel"
            profile={props.profile}
            locale={props.locale}
            timeZone={props.timeZone}
            onProfileChange={props.onProfileChange}
            onLocaleChange={props.onLocaleChange}
            onTimeZoneChange={props.onTimeZoneChange}
          />
        </section>
      ) : null}

      <section className="wc-card wc-cta" aria-label="Start or join a room">
        <button
          className="wc-primary"
          type="button"
          onClick={() => props.onStartHost()}
        >
          Start a room
        </button>
        <div className="wc-divider"><span>or</span></div>
        <JoinForm copy={props.copy} />
        <button
          type="button"
          className="wc-link-action"
          onClick={() => props.onStartHost({ title: 'Just me', solo: true })}
        >
          Or: track predictions just for me →
        </button>
      </section>

      {rooms.length > 0 ? (
        <section className="wc-card wc-rooms" aria-labelledby="wc-rooms-title">
          <header className="wc-card-head">
            <h2 id="wc-rooms-title">Your rooms</h2>
            <span className="wc-card-hint">{rooms.length} saved</span>
          </header>
          <ul className="wc-room-list" role="list">
            {rooms.map((room) => (
              <li key={`${room.role}:${room.id}`}>
                <a href={room.url} className="wc-room-link" aria-label={`Enter ${room.title}`}>
                  <span className="wc-room-mark" aria-hidden="true">⚽</span>
                  <span className="wc-room-meta">
                    <strong>{room.title}</strong>
                    <em>{room.role === 'host' ? 'You created · ' : ''}{templateBlurb(room.template)}</em>
                  </span>
                  <span className="wc-room-go" aria-hidden="true">→</span>
                </a>
                <button
                  type="button"
                  className="wc-room-remove"
                  aria-label={`Remove ${room.title}`}
                  onClick={() => removeRoom(room.id)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <footer className="wc-footer">
        <small>
          Private spaces, no login. <a href="/apps/match-room">About this app</a>
        </small>
      </footer>
    </main>
  );
}

function uniqueRooms(rooms: SavedRoom[]): SavedRoom[] {
  const byId = new Map<string, SavedRoom>();
  for (const room of rooms) {
    const existing = byId.get(room.id);
    if (!existing || new Date(room.updatedAt).getTime() > new Date(existing.updatedAt).getTime()) {
      byId.set(room.id, room);
    }
  }
  return Array.from(byId.values());
}

function templateBlurb(template: string): string {
  switch (template) {
    case 'family': return 'Family vibe';
    case 'office': return 'Office vibe';
    case 'hardcore': return 'Solo / hardcore';
    case 'pub': return 'Pub vibe';
    case 'watch-party': return 'Watch party';
    case 'friends':
    default:
      return 'Friends vibe';
  }
}

function defaultRoomTitle(template: RoomTemplate): string {
  switch (template) {
    case 'family': return 'Family room';
    case 'office': return 'Office room';
    case 'hardcore': return 'Just me';
    case 'pub': return 'Pub room';
    case 'watch-party': return 'Watch party';
    case 'friends': return 'Friends room';
  }
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
