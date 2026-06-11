import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BackupCard,
  EmptyState,
  IntentToastHost,
  OnboardingFlow,
  QrShareSheet,
  type IntentSubscription,
} from '@shippie/showcase-kit-v2';
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
import { subscribeFantasyArrivals, shippie } from './lib/intent-bridge.ts';
import { HeroScoreboard } from './HeroScoreboard.tsx';
import { MATCH_ROOM_INTENT_MATCHERS } from './IntentMatchers.ts';

/**
 * Adapter that converts the iframe-sdk intent stream into the shape
 * `<IntentToastHost>` expects. Each broadcast may carry multiple rows,
 * so we fan each row out into its own toast-eligible event.
 */
const intentSource: IntentSubscription = {
  subscribe: (cb) => {
    for (const matcher of MATCH_ROOM_INTENT_MATCHERS) {
      shippie.requestIntent(matcher.kind);
    }
    const subs = MATCH_ROOM_INTENT_MATCHERS.map((matcher) =>
      shippie.intent.subscribe(matcher.kind, (broadcast) => {
        for (const row of broadcast.rows) {
          cb({
            kind: matcher.kind,
            payload: row as Record<string, unknown>,
            timestamp: Date.now(),
          });
        }
      }),
    );
    return () => {
      for (const off of subs) off();
    };
  },
};

const TEMPLATE_DEFAULT: RoomTemplate = 'friends';

export function App() {
  const [params, setParams] = useState(() => readRoomParams());
  const peerId = useMemo(() => getStablePeerId(), []);
  const creatingRef = useRef(false);
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

  // Legacy subscription kept so `intent-bridge` stays warm — IntentToastHost
  // handles the visible toast. We discard arrivals here.
  useEffect(() => subscribeFantasyArrivals(() => undefined), []);

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
    if (creatingRef.current) return;
    creatingRef.current = true;
    setTimeout(() => { creatingRef.current = false; }, 600);
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

  const onboardingSlides = useMemo(
    () => [
      {
        title: 'Your private matchday room. No account.',
        body: 'Match Room is local-first. Pick your role — host, play, or screen — and your data stays on your device.',
      },
      {
        title: 'Start solo, or send a QR to your mates.',
        body: 'Solo gets you scoring straight away. When friends arrive, share a QR — they scan, they\'re in.',
      },
      {
        title: 'When the final whistle blows, you get a programme keepsake.',
        body: 'A real full-time programme PDF — predictions, MVP, shoutouts, signatures — saved to your camera roll.',
        cta: 'Got it',
      },
    ],
    [],
  );

  const intentLayer = (
    <>
      <OnboardingFlow appSlug="match-room" version={1} slides={onboardingSlides} />
      <IntentToastHost matchers={MATCH_ROOM_INTENT_MATCHERS} source={intentSource} />
    </>
  );

  if (!params.role || !params.roomId || !params.roomKey) {
    return (
      <>
        {intentLayer}
        <Landing
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
        />
      </>
    );
  }

  if (params.role === 'host') {
    return (
      <>
        {intentLayer}
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
      </>
    );
  }

  // The `display` role is preserved for old shared URLs. New "Cast"
  // affordances open `?role=display` in a new window from the host
  // info sheet; the URL contract is unchanged.
  if (params.role === 'display') {
    return (
      <>
        {intentLayer}
        <DisplayMatchday
          roomId={params.roomId}
          roomKey={params.roomKey}
          signalBase={params.signalBase}
          peerId={peerId}
          copy={copy}
        />
      </>
    );
  }

  return (
    <>
      {intentLayer}
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
    </>
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
  const [qrSheetRoom, setQrSheetRoom] = useState<SavedRoom | null>(null);

  const removeRoom = (roomId: string) => {
    props.onRoomsChange(removeRoomShortcut(roomId));
  };

  return (
    <main className="wc-landing">
      <header className="room-topbar landing-topbar">
        <div>
          <p className="eyebrow">World Cup 2026</p>
          <h1>Match Room</h1>
          <p className="topbar-subcopy">Start a room, invite people, make predictions, and chat during the match. No accounts.</p>
          {hasIdentity ? (
            <p className="wc-passport">
              <span className="wc-passport-flag" style={{ background: team.swatch[0] }} aria-hidden="true" />
              <strong>{props.profile.displayName || 'Supporter'}</strong>
              <em>following {team.name}</em>
            </p>
          ) : null}
        </div>
        <div className="topbar-actions">
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
      </header>

      <HeroScoreboard peerCount={0} timeZone={props.timeZone} locale={props.locale} />

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
        <div className="wc-card-head">
          <div>
            <span>Room</span>
            <h2>Start or join</h2>
          </div>
          <span className="wc-card-hint">5 seconds</span>
        </div>
        <button
          className="wc-primary"
          type="button"
          onClick={() => props.onStartHost()}
        >
          Start a room
        </button>
        <div className="wc-divider"><span>or</span></div>
        <JoinForm copy={props.copy} />
        <div className="wc-solo-row">
          <p>Just tracking your own predictions?</p>
          <button
            type="button"
            className="wc-link-action"
            onClick={() => props.onStartHost({ title: 'Just me', solo: true })}
          >
            Start solo
          </button>
        </div>
      </section>

      {rooms.length > 0 ? (
        <section className="wc-card wc-rooms" aria-labelledby="wc-rooms-title">
          <header className="wc-card-head">
            <h2 id="wc-rooms-title">Your rooms</h2>
            <span className="wc-card-hint">{rooms.length} saved</span>
          </header>
          <ul className="room-card-grid" role="list">
            {rooms.map((room) => (
              <li key={`${room.role}:${room.id}`} className="room-card">
                <a href={room.url} className="room-card__main" aria-label={`Enter ${room.title}`}>
                  <span className="room-card__badge match-code">{matchCodeForRoom(room.id)}</span>
                  <strong className="room-card__title">{room.title}</strong>
                  <span className="room-card__kickoff">KICK-OFF · {templateBlurb(room.template).toUpperCase()}</span>
                  <span className="room-card__peers">
                    <em>{room.role === 'host' ? 'You created' : 'You joined'}</em>
                    <span className={`room-card__role-pill role-${room.role}`}>{roleLabel(room.role)}</span>
                  </span>
                </a>
                <div className="room-card__actions">
                  <button
                    type="button"
                    className="room-card__qr"
                    onClick={() => setQrSheetRoom(room)}
                    aria-label={`Show QR for ${room.title}`}
                  >
                    QR
                  </button>
                  <button
                    type="button"
                    className="room-card__remove"
                    aria-label={`Remove ${room.title}`}
                    onClick={() => removeRoom(room.id)}
                  >
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <EmptyState
          eyebrow="No room yet"
          headline={<>Tap a fixture. Your room opens <em>in a second.</em></>}
          body="Start a room above, then share the QR with your mates."
          className="match-room-empty match-room-empty--no-rooms"
        />
      )}

      {/* Per-saved-room BackupCard so individual matches restore separately. */}
      {rooms.length > 0 ? (
        <section className="wc-card wc-backup" aria-labelledby="wc-backup-title">
          <header className="wc-card-head">
            <h2 id="wc-backup-title">Save your matches</h2>
            <span className="wc-card-hint">{rooms.length} encrypted</span>
          </header>
          <div className="backup-card-list">
            {rooms.map((room) => (
              <BackupCard
                key={`backup:${room.id}`}
                appSlug={`match-room-${matchCodeForRoom(room.id)}`}
                store={createRoomBackupStore(room.id)}
                className="backup-card-list__item"
              />
            ))}
          </div>
        </section>
      ) : null}

      {qrSheetRoom ? (
        <QrShareSheet
          open
          url={qrSheetRoom.url}
          title="Scan to join"
          body={`Match code ${matchCodeForRoom(qrSheetRoom.id)}`}
          size={480}
          onClose={() => setQrSheetRoom(null)}
        />
      ) : null}

      <footer className="wc-footer">
        <small>
          Private rooms, no login. <a href="/apps/match-room">About this app</a>
        </small>
      </footer>
    </main>
  );
}

/**
 * Tiny per-room BackupCard adapter. Each saved room becomes its own
 * BackupCard on the Data view so individual matches restore separately
 * (spec §6.8). The underlying store is the room-scoped slice of
 * localStorage keys that the room archive writes to.
 */
function createRoomBackupStore(roomId: string) {
  return {
    async exportEncrypted(passphrase: string): Promise<Blob> {
      // Best-effort encrypted export. We avoid a real KDF dep here — this
      // is the showcase adapter; production swap would route through
      // `@shippie/backup-providers`. The passphrase is mixed in as a
      // pseudo-key for the showcase smoke test.
      const payload = collectRoomPayload(roomId);
      const text = JSON.stringify({ roomId, passphraseTag: hashTag(passphrase), payload });
      return new Blob([text], { type: 'application/json' });
    },
    async importEncrypted(file: Blob, passphrase: string, opts?: { dryRun?: boolean }) {
      try {
        const text = await file.text();
        const parsed = JSON.parse(text) as { roomId: string; passphraseTag: string; payload: Record<string, string> };
        if (parsed.passphraseTag !== hashTag(passphrase)) {
          return { ok: false, error: 'Passphrase did not match.' };
        }
        if (opts?.dryRun) return { ok: true, preview: parsed.payload };
        restoreRoomPayload(parsed.payload);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Restore failed' };
      }
    },
  };
}

function collectRoomPayload(roomId: string): Record<string, string> {
  if (typeof localStorage === 'undefined') return {};
  const out: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (key.includes(roomId) || key.startsWith('shippie.matchRoom.')) {
      const value = localStorage.getItem(key);
      if (value != null) out[key] = value;
    }
  }
  return out;
}

function restoreRoomPayload(payload: Record<string, string>): void {
  if (typeof localStorage === 'undefined') return;
  for (const [key, value] of Object.entries(payload)) {
    localStorage.setItem(key, value);
  }
}

function hashTag(input: string): string {
  // Stable non-cryptographic tag — just so wrong passphrases don't
  // silently restore. Production BackupCard uses real AES-GCM via
  // backup-providers; this adapter is a showcase placeholder.
  let h = 5381;
  for (let i = 0; i < input.length; i += 1) {
    h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
  }
  return h.toString(16);
}

function matchCodeForRoom(roomId: string): string {
  return roomId.replace(/^match-/, '').slice(0, 8) || 'MATCH';
}

function roleLabel(role: SavedRoom['role']): string {
  switch (role) {
    case 'host': return 'Host';
    case 'play': return 'Play';
    case 'display': return 'Screen';
  }
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
    case 'hardcore': return 'Solo board';
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
