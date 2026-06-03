import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  ADMIN_SEED,
  AWARDS,
  DEFAULT_STREAMS,
  DIETARY_GROUPS,
  EVENT,
  FLOOR_PLANS,
  SESSIONS,
  SPEAKERS,
  T,
  type AwardCategory,
  type BreakoutChoice,
  type DayNumber,
  type Session,
  type Speaker,
} from './data.ts';
import {
  dayLabel,
  floorForRoom,
  formatTime,
  getCurrentSession,
  getUpcomingSessions,
  isRevealReady,
  progressForSession,
  resolveBreakoutChoice,
  resolveEventClock,
  roomForSession,
  roomIdForName,
  sessionPhase,
  type EventClock,
} from './schedule.ts';

type Tab = 'now' | 'schedule' | 'my-day' | 'venue' | 'more' | 'speakers' | 'live' | 'awards' | 'dinner' | 'feedback' | 'about' | 'admin';

interface Question {
  id: string;
  body: string;
  votes: number;
  mine?: boolean;
  anonymous?: boolean;
  session: string;
}

interface FeedbackState {
  rating: number;
  text: string;
  anonymous: boolean;
  submitted: boolean;
}

const QA_SEED: Question[] = [
  {
    id: 'q1',
    body: 'How will Apex decide which AI opportunities get central investment first?',
    votes: 24,
    session: 'AI and the future of our sector',
  },
  {
    id: 'q2',
    body: 'What does accountable leadership look like when teams are moving this quickly?',
    votes: 17,
    session: 'Leadership in uncertainty',
  },
  {
    id: 'q3',
    body: 'Which client experience metrics will matter most in 2027?',
    votes: 11,
    session: 'Client Experience',
  },
];

const POLL = {
  question: 'Which annual priority needs the strongest executive focus?',
  options: [
    { id: 'growth', label: 'Commercial growth', votes: 38 },
    { id: 'people', label: 'People and culture', votes: 31 },
    { id: 'tech', label: 'Technology roadmap', votes: 44 },
    { id: 'client', label: 'Client experience', votes: 27 },
  ],
};

function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

function vibrate(pattern: number | number[]): void {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return;
  navigator.vibrate(pattern);
}

function readStored<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function useStoredState<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => readStored(key, fallback));
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Local persistence is best-effort.
    }
  }, [key, value]);
  return [value, setValue] as const;
}

function useEventClock(): EventClock {
  const [tick, setTick] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setTick(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return useMemo(() => resolveEventClock(tick, typeof window === 'undefined' ? '' : window.location.search), [tick]);
}

function hasAdminRoute(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return window.location.hash === '#admin' || params.has('admin');
}

function hasAdminToken(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('admin') === 'apex-2026' || window.sessionStorage.getItem('apex.admin') === 'ok';
}

function speakerById(id: string): Speaker | undefined {
  return SPEAKERS.find((speaker) => speaker.id === id);
}

function sessionById(id: string): Session | undefined {
  return SESSIONS.find((session) => session.id === id);
}

function speakerNames(ids: string[] | undefined): string {
  if (!ids?.length) return 'Apex leadership team';
  return ids.map((id) => speakerById(id)?.name).filter(Boolean).join(', ');
}

function sessionLabel(session: Session, selectedStreams: Record<string, string>): { title: string; room?: string; level?: string; speakerIds?: string[] } {
  const choice = resolveBreakoutChoice(session, selectedStreams);
  if (!choice) return { title: session.title, room: session.room, level: session.level, speakerIds: session.speakerIds };
  return { title: choice.title, room: choice.room, level: choice.level, speakerIds: choice.speakerIds };
}

function greetingFor(minutes: number): string {
  if (minutes < T(12)) return 'Good morning';
  if (minutes < T(17)) return 'Good afternoon';
  return 'Good evening';
}

function countdownToReveal(clock: EventClock): string {
  const target = EVENT.reveal;
  let minutes = (target.day - clock.day) * 24 * 60 + target.minutes - clock.minutes;
  if (minutes < 0) minutes = 0;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  return `${hours}h ${String(mins).padStart(2, '0')}m`;
}

function copyExport(payload: unknown, fileName: string): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function App() {
  const clock = useEventClock();
  const [tab, setTab] = useState<Tab>(() => (hasAdminRoute() ? 'admin' : 'now'));
  const [selectedDay, setSelectedDay] = useState<DayNumber>(clock.day);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [selectedSpeaker, setSelectedSpeaker] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [floor, setFloor] = useState(() => 'G');
  const [highlightRoom, setHighlightRoom] = useState<string | undefined>();
  const [revealOpen, setRevealOpen] = useState(false);
  const [awardSeen, setAwardSeen] = useStoredState('apex.awards.seen', false);
  const [name, setName] = useStoredState('apex.attendee.name', '');
  const [dietary, setDietary] = useStoredState('apex.attendee.dietary', 'Vegetarian');
  const [selectedStreams, setSelectedStreams] = useStoredState<Record<string, string>>('my-streams', DEFAULT_STREAMS);
  const [questions, setQuestions] = useStoredState<Question[]>('apex.qa', []);
  const [pollVote, setPollVote] = useStoredState<string | null>('apex.poll.vote', null);
  const [feedback, setFeedback] = useStoredState<FeedbackState>('apex.feedback', {
    rating: 0,
    text: '',
    anonymous: true,
    submitted: false,
  });
  const [adminAuthed, setAdminAuthed] = useState(hasAdminToken);

  useEffect(() => {
    const syncRoute = () => {
      if (hasAdminRoute()) setTab('admin');
      if (hasAdminToken()) setAdminAuthed(true);
    };
    syncRoute();
    window.addEventListener('hashchange', syncRoute);
    return () => window.removeEventListener('hashchange', syncRoute);
  }, []);

  useEffect(() => {
    setSelectedDay(clock.day);
  }, [clock.day]);

  useEffect(() => {
    if (!isRevealReady(clock) || awardSeen) return;
    setRevealOpen(true);
    setAwardSeen(true);
    vibrate([20, 10, 20, 10, 30]);
  }, [awardSeen, clock, setAwardSeen]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const currentSession = useMemo(() => getCurrentSession(SESSIONS, clock), [clock]);
  const upcoming = useMemo(() => getUpcomingSessions(SESSIONS, clock), [clock]);
  const upNext = upcoming[0];
  const allQuestions = useMemo(() => [...questions, ...QA_SEED], [questions]);

  const changeTab = (next: Tab) => {
    setSelectedSession(null);
    setSelectedSpeaker(null);
    setTab(next);
  };

  const selectBreakout = (session: Session, choice: BreakoutChoice) => {
    setSelectedStreams((current) => ({ ...current, [session.id]: choice.id }));
    vibrate(10);
    setToast(`${choice.stream} selected`);
  };

  const findCurrentRoom = () => {
    const target = currentSession ?? upNext;
    const room = target ? roomForSession(target, selectedStreams) : undefined;
    if (room?.toLowerCase().includes('sushisamba')) {
      setHighlightRoom(undefined);
      setTab('dinner');
      setToast('Dinner details opened');
      return;
    }
    const floorId = floorForRoom(room);
    setFloor(floorId);
    setHighlightRoom(roomIdForName(room));
    setTab('venue');
    setToast(room ? `${room} highlighted` : 'No room is active right now');
  };

  const openReveal = () => {
    setRevealOpen(true);
    setAwardSeen(true);
    vibrate([20, 10, 20, 10, 30]);
  };

  const renderTab = (): ReactNode => {
    switch (tab) {
      case 'now':
        return (
          <HomeScreen
            clock={clock}
            currentSession={currentSession}
            upNext={upNext}
            selectedStreams={selectedStreams}
            onGo={changeTab}
            onOpenSession={setSelectedSession}
            onFindRoom={findCurrentRoom}
          />
        );
      case 'schedule':
        return (
          <ScheduleScreen
            clock={clock}
            day={selectedDay}
            selectedStreams={selectedStreams}
            onDay={setSelectedDay}
            onOpenSession={setSelectedSession}
            onSelectBreakout={selectBreakout}
          />
        );
      case 'my-day':
        return (
          <MyDayScreen
            clock={clock}
            name={name}
            dietary={dietary}
            selectedStreams={selectedStreams}
            onName={setName}
            onDietary={setDietary}
            onOpenSession={setSelectedSession}
          />
        );
      case 'venue':
        return (
          <VenueScreen
            floor={floor}
            highlightRoom={highlightRoom}
            currentSession={currentSession}
            selectedStreams={selectedStreams}
            onFloor={setFloor}
            onFindRoom={findCurrentRoom}
          />
        );
      case 'speakers':
        return <SpeakersScreen onOpenSpeaker={setSelectedSpeaker} />;
      case 'live':
        return (
          <LiveScreen
            currentSession={currentSession}
            questions={allQuestions}
            pollVote={pollVote}
            onQuestions={setQuestions}
            onPollVote={setPollVote}
          />
        );
      case 'awards':
        return <AwardsScreen clock={clock} onReveal={openReveal} />;
      case 'dinner':
        return <DinnerScreen />;
      case 'feedback':
        return <FeedbackScreen feedback={feedback} onFeedback={setFeedback} />;
      case 'about':
        return <AboutScreen />;
      case 'admin':
        return (
          <AdminScreen
            authed={adminAuthed}
            onAuthed={() => {
              window.sessionStorage.setItem('apex.admin', 'ok');
              setAdminAuthed(true);
            }}
            questions={allQuestions}
            selectedStreams={selectedStreams}
            feedback={feedback}
            pollVote={pollVote}
            onReveal={openReveal}
          />
        );
      case 'more':
      default:
        return <MoreScreen onGo={changeTab} />;
    }
  };

  return (
    <div className="conference-app">
      <AppHeader
        clock={clock}
        name={name}
        activeTab={tab}
        onAvatar={() => changeTab('my-day')}
      />
      <main className="app-main">{renderTab()}</main>
      <BottomNav active={tab} onTab={changeTab} />
      {selectedSession && (
        <SessionDetail
          sessionId={selectedSession}
          selectedStreams={selectedStreams}
          onClose={() => setSelectedSession(null)}
          onSpeaker={(id) => {
            setSelectedSession(null);
            setSelectedSpeaker(id);
          }}
        />
      )}
      {selectedSpeaker && <SpeakerDetail speakerId={selectedSpeaker} onClose={() => setSelectedSpeaker(null)} onSession={setSelectedSession} />}
      {revealOpen && <AwardsReveal onClose={() => setRevealOpen(false)} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function AppHeader({ clock, name, activeTab, onAvatar }: { clock: EventClock; name: string; activeTab: Tab; onAvatar: () => void }) {
  const currentDay = EVENT.days.find((day) => day.n === clock.day) ?? EVENT.days[0];
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  return (
    <header className="app-header">
      <div>
        <p className="eyebrow">Private link</p>
        <h1>{activeTab === 'admin' ? 'Admin dashboard' : 'APEX CONFERENCE 2026'}</h1>
        <p className="header-sub">
          {currentDay?.subline} <span /> {currentDay?.full} <span /> {formatTime(clock.minutes)}
        </p>
      </div>
      <button className={cx('avatar', !initials && 'avatar-empty')} type="button" onClick={onAvatar} aria-label="Open my day">
        {initials || 'ME'}
      </button>
    </header>
  );
}

type NavIconName = 'now' | 'schedule' | 'my-day' | 'venue' | 'more';

function NavIcon({ name }: { name: NavIconName }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  if (name === 'now') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5V12l3 2" />
      </svg>
    );
  }
  if (name === 'schedule') {
    return (
      <svg {...common}>
        <rect x="3.5" y="5" width="17" height="15" rx="1.6" />
        <line x1="3.5" y1="9.5" x2="20.5" y2="9.5" />
        <line x1="8" y1="3" x2="8" y2="6.5" />
        <line x1="16" y1="3" x2="16" y2="6.5" />
      </svg>
    );
  }
  if (name === 'my-day') {
    return (
      <svg {...common}>
        <circle cx="12" cy="8.5" r="3.6" />
        <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
      </svg>
    );
  }
  if (name === 'venue') {
    return (
      <svg {...common}>
        <path d="M12 21s6.5-5.6 6.5-11A6.5 6.5 0 0 0 5.5 10c0 5.4 6.5 11 6.5 11z" />
        <circle cx="12" cy="10" r="2.4" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="6.5" cy="6.5" r="2" />
      <circle cx="17.5" cy="6.5" r="2" />
      <circle cx="6.5" cy="17.5" r="2" />
      <circle cx="17.5" cy="17.5" r="2" />
    </svg>
  );
}

function BottomNav({ active, onTab }: { active: Tab; onTab: (tab: Tab) => void }) {
  const items: Array<{ id: Tab; label: string; icon: NavIconName }> = [
    { id: 'now', label: 'Now', icon: 'now' },
    { id: 'schedule', label: 'Schedule', icon: 'schedule' },
    { id: 'my-day', label: 'My day', icon: 'my-day' },
    { id: 'venue', label: 'Map', icon: 'venue' },
    { id: 'more', label: 'More', icon: 'more' },
  ];
  return (
    <nav className="bottom-nav" aria-label="Primary">
      {items.map((item) => (
        <button key={item.id} className={cx(active === item.id && 'active')} type="button" onClick={() => onTab(item.id)} aria-label={item.label}>
          <span aria-hidden="true"><NavIcon name={item.icon} /></span>
          {item.label}
        </button>
      ))}
    </nav>
  );
}

function HomeScreen({
  clock,
  currentSession,
  upNext,
  selectedStreams,
  onGo,
  onOpenSession,
  onFindRoom,
}: {
  clock: EventClock;
  currentSession?: Session;
  upNext?: Session;
  selectedStreams: Record<string, string>;
  onGo: (tab: Tab) => void;
  onOpenSession: (id: string) => void;
  onFindRoom: () => void;
}) {
  const live = currentSession;
  const headlineSession = live ?? upNext;
  const remaining = SESSIONS.filter((session) => session.day === clock.day && session.end > clock.minutes).slice(0, 6);
  const day = EVENT.days.find((item) => item.n === clock.day) ?? EVENT.days[0];

  return (
    <section className="screen">
      <div className="hero-strip">
        <div>
          <p className="eyebrow eyebrow-accent">{EVENT.legalTitle}</p>
          <h2>{EVENT.tagline}</h2>
        </div>
        <div className="hero-meta">
          <strong>{EVENT.attendeeCount}</strong>
          <span>senior leaders</span>
        </div>
      </div>

      <div className="status-grid">
        <Metric label="Venue" value="133 Houndsditch" />
        <Metric label="WiFi" value={EVENT.wifi.network} />
        <Metric label="Dinner coaches" value="18:30" />
      </div>

      <article className={cx('live-panel', live && 'is-live')}>
        <div className="panel-kicker">
          {live && <span className="live-dot" />}
          <span>{live ? 'Happening now' : `Up next on ${day?.label}`}</span>
        </div>
        {headlineSession ? (
          <>
            <h3>{sessionLabel(headlineSession, selectedStreams).title}</h3>
            <p className="meta-line">
              <span className="mono">{formatTime(headlineSession.start)}-{formatTime(headlineSession.end)}</span>
              <span>{sessionLabel(headlineSession, selectedStreams).room}</span>
              <span>{speakerNames(sessionLabel(headlineSession, selectedStreams).speakerIds)}</span>
            </p>
            {live && (
              <div className="progress">
                <i style={{ width: `${Math.round(progressForSession(live, clock) * 100)}%` }} />
              </div>
            )}
            <div className="button-row">
              <button className="primary-action" type="button" onClick={() => onOpenSession(headlineSession.id)}>
                Details
              </button>
              <button className="ghost-action" type="button" onClick={onFindRoom}>
                Find room
              </button>
            </div>
          </>
        ) : (
          <p className="muted">The formal programme is complete for today.</p>
        )}
      </article>

      {upNext && live && (
        <button className="next-panel" type="button" onClick={() => onOpenSession(upNext.id)}>
          <span className="mono">{formatTime(upNext.start)}</span>
          <strong>{sessionLabel(upNext, selectedStreams).title}</strong>
          <em>{sessionLabel(upNext, selectedStreams).room}</em>
        </button>
      )}

      <div className="quick-grid">
        <button type="button" onClick={() => onGo('schedule')}>
          <span>Schedule</span>
          <strong>Full agenda</strong>
        </button>
        <button type="button" onClick={() => onGo('venue')}>
          <span>Venue</span>
          <strong>Map and WiFi</strong>
        </button>
        <button type="button" onClick={() => onGo('my-day')}>
          <span>Personal</span>
          <strong>My day</strong>
        </button>
      </div>

      <SectionHeading title="Today at a glance" detail={dayLabel(clock.day)} />
      <div className="agenda-list compact">
        {remaining.map((session) => (
          <button key={session.id} className="agenda-row" type="button" onClick={() => onOpenSession(session.id)}>
            <span className="mono">{formatTime(session.start)}</span>
            <strong>{sessionLabel(session, selectedStreams).title}</strong>
            <em>{sessionLabel(session, selectedStreams).room ?? session.level}</em>
          </button>
        ))}
      </div>
    </section>
  );
}

function ScheduleScreen({
  clock,
  day,
  selectedStreams,
  onDay,
  onOpenSession,
  onSelectBreakout,
}: {
  clock: EventClock;
  day: DayNumber;
  selectedStreams: Record<string, string>;
  onDay: (day: DayNumber) => void;
  onOpenSession: (id: string) => void;
  onSelectBreakout: (session: Session, choice: BreakoutChoice) => void;
}) {
  const sessions = SESSIONS.filter((session) => session.day === day);
  return (
    <section className="screen">
      <div className="segmented">
        {EVENT.days.map((item) => (
          <button key={item.n} className={day === item.n ? 'active' : ''} type="button" onClick={() => onDay(item.n)}>
            <span>{item.label}</span>
            <small>{item.subline}</small>
          </button>
        ))}
      </div>
      <div className="track-legend" aria-label="Track legend">
        <span className="track-main">Main</span>
        <span className="track-breakout">Breakouts</span>
        <span className="track-social">Social</span>
      </div>
      <div className="timeline">
        {sessions.map((session) => (
          <SessionCard
            key={session.id}
            session={session}
            clock={clock}
            selectedStreams={selectedStreams}
            onOpen={() => onOpenSession(session.id)}
            onSelect={(choice) => onSelectBreakout(session, choice)}
          />
        ))}
      </div>
    </section>
  );
}

function SessionCard({
  session,
  clock,
  selectedStreams,
  onOpen,
  onSelect,
}: {
  session: Session;
  clock: EventClock;
  selectedStreams: Record<string, string>;
  onOpen: () => void;
  onSelect: (choice: BreakoutChoice) => void;
}) {
  const phase = sessionPhase(session, clock);
  const label = sessionLabel(session, selectedStreams);
  return (
    <article className={cx('session-card', `track-${session.track}`, phase)}>
      <div className="time-rail">
        <span className="mono">{formatTime(session.start)}</span>
        <i />
      </div>
      <div className="session-body">
        <button className="session-top" type="button" onClick={onOpen}>
          <span>
            {phase === 'live' && (
              <em className="live-badge">
                <span className="live-dot" /> Live
              </em>
            )}
            <strong>{session.breakout ? session.title : label.title}</strong>
            <small>{formatTime(session.start)}-{formatTime(session.end)} · {label.room ?? session.room ?? 'Multiple rooms'}</small>
          </span>
          <b>View</b>
        </button>
        {session.breakout && (
          <div className="choice-grid">
            {session.breakout.map((choice) => (
              <button
                key={choice.id}
                className={cx(selectedStreams[session.id] === choice.id && 'selected')}
                type="button"
                onClick={() => onSelect(choice)}
              >
                <span>{choice.stream}</span>
                <strong>{choice.title}</strong>
                <em>{choice.room}</em>
              </button>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

function MyDayScreen({
  clock,
  name,
  dietary,
  selectedStreams,
  onName,
  onDietary,
  onOpenSession,
}: {
  clock: EventClock;
  name: string;
  dietary: string;
  selectedStreams: Record<string, string>;
  onName: (name: string) => void;
  onDietary: (dietary: string) => void;
  onOpenSession: (id: string) => void;
}) {
  const personalSessions = SESSIONS.filter((session) => session.day === clock.day && (session.allAttendees || session.breakout));
  return (
    <section className="screen">
      <div className="personal-hero">
        <p className="eyebrow">{EVENT.dateRange}</p>
        <h2>{name.trim() ? `${greetingFor(clock.minutes)}, ${name.trim()}.` : `${greetingFor(clock.minutes)}.`}</h2>
        <p>{name.trim() ? 'Here is your day at Apex.' : 'Add your name below to personalise your day at Apex.'}</p>
      </div>

      <div className="form-grid">
        <label>
          <span>Name</span>
          <input value={name} placeholder="Your name" onChange={(event) => onName(event.target.value)} />
        </label>
        <label>
          <span>Dietary</span>
          <select value={dietary} onChange={(event) => onDietary(event.target.value)}>
            {DIETARY_GROUPS.map((group) => (
              <option key={group.label} value={group.label}>
                {group.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="info-band">
        <Metric label="Dinner table" value="Table 7, seat C" />
        <Metric label="Meal note" value={dietary} />
        <Metric label="Awards vote" value="Submitted" />
      </div>

      <SectionHeading title="Personal timeline" detail={dayLabel(clock.day)} />
      <div className="agenda-list">
        {personalSessions.map((session) => {
          const label = sessionLabel(session, selectedStreams);
          return (
            <button key={session.id} className="agenda-row" type="button" onClick={() => onOpenSession(session.id)}>
              <span className="mono">{formatTime(session.start)}</span>
              <strong>{label.title}</strong>
              <em>{label.room ?? session.room}</em>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function VenueScreen({
  floor,
  highlightRoom,
  currentSession,
  selectedStreams,
  onFloor,
  onFindRoom,
}: {
  floor: string;
  highlightRoom?: string;
  currentSession?: Session;
  selectedStreams: Record<string, string>;
  onFloor: (floor: string) => void;
  onFindRoom: () => void;
}) {
  const plan = FLOOR_PLANS.find((item) => item.id === floor) ?? FLOOR_PLANS[0];
  const currentRoom = currentSession ? roomForSession(currentSession, selectedStreams) : undefined;
  return (
    <section className="screen venue-screen">
      <div className="segmented compact-segmented">
        {FLOOR_PLANS.map((item) => (
          <button key={item.id} className={floor === item.id ? 'active' : ''} type="button" onClick={() => onFloor(item.id)}>
            <span>{item.label}</span>
            <small>{item.name}</small>
          </button>
        ))}
      </div>
      <button className="primary-action wide" type="button" onClick={onFindRoom}>
        Where do I need to be now?
      </button>
      <div className="map-shell">
        <div className="map-title">
          <strong>{plan?.name}</strong>
          <span>{currentRoom ? `Current room: ${currentRoom}` : 'Facilities and rooms'}</span>
        </div>
        <svg className="venue-map" viewBox="0 0 360 300" role="img" aria-label={`${plan?.name} map`}>
          <rect x="6" y="6" width="348" height="288" rx="16" className="map-floor" />
          {plan?.rooms.map((room) => (
            <g key={room.id} className={cx('map-room', room.kind, highlightRoom === room.id && 'highlight')}>
              <rect x={room.x} y={room.y} width={room.w} height={room.h} rx="10" />
              <text x={room.x + 12} y={room.y + 24}>
                {room.name}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <div className="facility-list">
        <p><strong>Toilets</strong><span>Each floor</span></p>
        <p><strong>Cloakroom</strong><span>Ground floor reception</span></p>
        <p><strong>AV support</strong><span>Levels 1 and 2</span></p>
        <p><strong>Nearest tube</strong><span>Aldgate 2 min, Liverpool Street 4 min</span></p>
        <p><strong>WiFi</strong><span>{EVENT.wifi.network} / {EVENT.wifi.password}</span></p>
      </div>
    </section>
  );
}

function SpeakersScreen({ onOpenSpeaker }: { onOpenSpeaker: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const filtered = SPEAKERS.filter((speaker) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return `${speaker.name} ${speaker.title} ${speaker.org}`.toLowerCase().includes(q);
  });
  return (
    <section className="screen">
      <div className="searchbar">
        <input value={query} placeholder="Search speakers" onChange={(event) => setQuery(event.target.value)} />
      </div>
      {filtered.length === 0 ? (
        <p className="list-empty">No speakers match “{query.trim()}”.</p>
      ) : (
        <div className="speaker-grid">
          {filtered.map((speaker) => (
            <button key={speaker.id} className="speaker-card" type="button" onClick={() => onOpenSpeaker(speaker.id)}>
              <span>{speaker.initials}</span>
              <strong>{speaker.name}</strong>
              <em>{speaker.title}</em>
              <small>{speaker.org}</small>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function LiveScreen({
  currentSession,
  questions,
  pollVote,
  onQuestions,
  onPollVote,
}: {
  currentSession?: Session;
  questions: Question[];
  pollVote: string | null;
  onQuestions: (questions: Question[] | ((current: Question[]) => Question[])) => void;
  onPollVote: (vote: string | null) => void;
}) {
  const [question, setQuestion] = useState('');
  const [anonymous, setAnonymous] = useState(true);
  const currentTitle = currentSession?.title ?? 'General conference';
  const submitQuestion = (event: FormEvent) => {
    event.preventDefault();
    const body = question.trim();
    if (!body) return;
    onQuestions((current) => [
      {
        id: `local-${Date.now()}`,
        body,
        votes: 1,
        mine: true,
        anonymous,
        session: currentTitle,
      },
      ...current,
    ]);
    setQuestion('');
    vibrate([15, 5, 10]);
  };

  const totalVotes = POLL.options.reduce((total, option) => total + option.votes + (pollVote === option.id ? 1 : 0), 0);
  return (
    <section className="screen live-screen">
      <form className="qa-panel" onSubmit={submitQuestion}>
        <SectionHeading title="Live Q&A" detail={currentTitle} />
        <textarea
          value={question}
          maxLength={200}
          placeholder="Ask the room host a question"
          onChange={(event) => setQuestion(event.target.value)}
        />
        <div className="form-footer">
          <label className="toggle-row">
            <input type="checkbox" checked={anonymous} onChange={(event) => setAnonymous(event.target.checked)} />
            <span>Anonymous</span>
          </label>
          <span className="mono">{question.length}/200</span>
        </div>
        <button className="primary-action wide" type="submit" disabled={!question.trim()}>
          Submit question
        </button>
      </form>

      <div className="question-list">
        {questions.length === 0 ? (
          <p className="list-empty">No questions yet — be the first to ask the room.</p>
        ) : (
          questions.slice(0, 5).map((item) => (
            <article key={item.id} className={cx('question-card', item.mine && 'mine')}>
              <p>{item.body}</p>
              <span>{item.anonymous ? 'Anonymous' : 'Named'} · {item.session}</span>
              <strong>{item.votes}</strong>
            </article>
          ))
        )}
      </div>

      <div className="poll-panel">
        <SectionHeading title="Live polling" detail="Results update after voting" />
        <h3>{POLL.question}</h3>
        <div className="poll-options">
          {POLL.options.map((option) => {
            const votes = option.votes + (pollVote === option.id ? 1 : 0);
            const width = totalVotes ? Math.round((votes / totalVotes) * 100) : 0;
            return (
              <button
                key={option.id}
                className={cx(pollVote === option.id && 'selected')}
                type="button"
                onClick={() => {
                  onPollVote(option.id);
                  vibrate(10);
                }}
              >
                <span>{option.label}</span>
                <strong>{width}%</strong>
                <i style={{ width: `${width}%` }} />
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function AwardsScreen({ clock, onReveal }: { clock: EventClock; onReveal: () => void }) {
  const ready = isRevealReady(clock);
  return (
    <section className="screen awards-screen">
      <div className="awards-hero">
        <p className="eyebrow">Apex Awards</p>
        <h2>Five categories. One closing moment.</h2>
        <p>Nominees are shown throughout the day. The final category unlocks at 13:30 on Day 2.</p>
        <button className="primary-action" type="button" onClick={onReveal} disabled={!ready}>
          {ready ? 'Open winner reveal' : `Reveal in ${countdownToReveal(clock)}`}
        </button>
      </div>
      <div className="award-list">
        {AWARDS.map((award) => (
          <AwardCard key={award.id} award={award} ready={ready} />
        ))}
      </div>
    </section>
  );
}

function AwardCard({ award, ready }: { award: AwardCategory; ready: boolean }) {
  const hidden = Boolean(award.hiddenUntil && !ready);
  return (
    <article className={cx('award-card', hidden && 'locked')}>
      <div>
        <span>{award.title}</span>
        <strong>{hidden ? 'Hidden until ceremony' : award.winner}</strong>
      </div>
      <ul>
        {(hidden ? ['Nominee reveal pending'] : award.nominees).map((nominee) => (
          <li key={nominee}>{nominee}</li>
        ))}
      </ul>
    </article>
  );
}

function DinnerScreen() {
  return (
    <section className="screen dinner-screen">
      <div className="dinner-hero">
        <p className="eyebrow">Evening dinner</p>
        <h2>Sushisamba, 41st floor.</h2>
        <p>Private dining room, 110 Bishopsgate, London EC2N 4AY.</p>
      </div>
      <div className="dinner-list">
        <p><span>18:30</span><strong>Coaches depart</strong><em>Main entrance, EC3A 7BX</em></p>
        <p><span>19:00</span><strong>Cocktail reception</strong><em>Private dining room</em></p>
        <p><span>19:45</span><strong>Three-course dinner</strong><em>Dietary arrangements confirmed</em></p>
        <p><span>23:30</span><strong>Return coach one</strong><em>Meet at restaurant entrance</em></p>
        <p><span>00:30</span><strong>Return coach two</strong><em>Late bar closes at midnight</em></p>
      </div>
      <span className="map-link">
        Sushisamba · 110 Bishopsgate, London EC2N 4AY
      </span>
    </section>
  );
}

function FeedbackScreen({ feedback, onFeedback }: { feedback: FeedbackState; onFeedback: (feedback: FeedbackState) => void }) {
  const ratings = [
    { value: 1, label: 'Very poor', mark: '1' },
    { value: 2, label: 'Poor', mark: '2' },
    { value: 3, label: 'Okay', mark: '3' },
    { value: 4, label: 'Good', mark: '4' },
    { value: 5, label: 'Excellent', mark: '5' },
  ];
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onFeedback({ ...feedback, submitted: true });
    vibrate(15);
  };
  return (
    <section className="screen">
      <form className="feedback-panel" onSubmit={submit}>
        <p className="eyebrow">Feedback</p>
        <h2>How was today?</h2>
        <div className="rating-row" role="radiogroup" aria-label="Rating">
          {ratings.map((rating) => (
            <button
              key={rating.value}
              className={feedback.rating === rating.value ? 'selected' : ''}
              type="button"
              aria-label={rating.label}
              onClick={() => onFeedback({ ...feedback, rating: rating.value, submitted: false })}
            >
              {rating.mark}
            </button>
          ))}
        </div>
        <textarea
          value={feedback.text}
          placeholder="Optional notes for the event team"
          onChange={(event) => onFeedback({ ...feedback, text: event.target.value, submitted: false })}
        />
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={feedback.anonymous}
            onChange={(event) => onFeedback({ ...feedback, anonymous: event.target.checked, submitted: false })}
          />
          <span>Anonymous</span>
        </label>
        <button className="primary-action wide" type="submit" disabled={!feedback.rating}>
          {feedback.submitted ? 'Feedback saved' : 'Save feedback'}
        </button>
      </form>
    </section>
  );
}

function MoreScreen({ onGo }: { onGo: (tab: Tab) => void }) {
  const items: Array<{ tab: Tab; label: string; detail: string }> = [
    { tab: 'speakers', label: 'Speakers', detail: 'Directory and session links' },
    { tab: 'live', label: 'Live Q&A and polling', detail: 'Questions, voting, room host feed' },
    { tab: 'awards', label: 'Apex Awards', detail: 'Nominees and ceremony reveal' },
    { tab: 'dinner', label: 'Dinner info', detail: 'Coaches, address, dress code' },
    { tab: 'feedback', label: 'Feedback', detail: 'End-of-day pulse' },
    { tab: 'about', label: 'Venue details', detail: 'Facilities, WiFi, travel' },
  ];
  return (
    <section className="screen">
      <div className="more-list">
        {items.map((item) => (
          <button key={item.tab} type="button" onClick={() => onGo(item.tab)}>
            <strong>{item.label}</strong>
            <span>{item.detail}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function AboutScreen() {
  return (
    <section className="screen">
      <div className="about-panel">
        <p className="eyebrow">Event details</p>
        <h2>{EVENT.venue}</h2>
        <p>{EVENT.attendeeCount} senior leaders across the UK business.</p>
      </div>
      <SectionHeading title="Dietary groups" detail="Pre-noted for catering" />
      <div className="diet-grid">
        {DIETARY_GROUPS.map((group) => (
          <Metric key={group.label} label={group.label} value={String(group.count)} />
        ))}
      </div>
      <div className="facility-list">
        <p><strong>WiFi</strong><span>{EVENT.wifi.network} / {EVENT.wifi.password}</span></p>
        <p><strong>Taxis</strong><span>Use Gett app, or ask reception</span></p>
        <p><strong>Nearest tube</strong><span>Aldgate 2 min, Liverpool Street 4 min</span></p>
      </div>
    </section>
  );
}

function AdminScreen({
  authed,
  onAuthed,
  questions,
  selectedStreams,
  feedback,
  pollVote,
  onReveal,
}: {
  authed: boolean;
  onAuthed: () => void;
  questions: Question[];
  selectedStreams: Record<string, string>;
  feedback: FeedbackState;
  pollVote: string | null;
  onReveal: () => void;
}) {
  const [token, setToken] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (token.trim() === 'apex-2026') onAuthed();
  };

  if (!authed) {
    return (
      <section className="screen">
        <form className="admin-login" onSubmit={submit}>
          <p className="eyebrow">Secure route</p>
          <h2>Admin access</h2>
          <input value={token} placeholder="Token" onChange={(event) => setToken(event.target.value)} />
          <button className="primary-action wide" type="submit">Open dashboard</button>
        </form>
      </section>
    );
  }

  const streamTotals = buildStreamTotals(selectedStreams);
  const exportPayload = {
    exportedAt: new Date().toISOString(),
    questions,
    pollVote,
    feedback,
    selectedStreams,
    streamTotals,
  };

  return (
    <section className="screen admin-screen">
      <div className="status-grid">
        <Metric label="Opened app" value={String(ADMIN_SEED.attendeeOpens + 1)} />
        <Metric label="Q&A received" value={String(questions.length)} />
        <Metric label="Feedback avg" value={feedback.submitted ? String(feedback.rating) : String(ADMIN_SEED.feedbackAverage)} />
      </div>
      <div className="button-row">
        <button className="primary-action" type="button" onClick={() => copyExport(exportPayload, 'apex-event-export.json')}>
          Export data
        </button>
        <button className="ghost-action" type="button" onClick={onReveal}>
          Open reveal
        </button>
      </div>

      <SectionHeading title="Stream selection" detail="Single-device demo plus seeded counts" />
      <div className="admin-bars">
        {streamTotals.map((item) => (
          <p key={item.label}>
            <span>{item.label}</span>
            <strong>{item.count}</strong>
            <i style={{ width: `${Math.min(100, item.count * 2)}%` }} />
          </p>
        ))}
      </div>

      <SectionHeading title="Room host questions" detail="Latest first" />
      <div className="question-list">
        {questions.slice(0, 6).map((item) => (
          <article key={item.id} className="question-card">
            <p>{item.body}</p>
            <span>{item.session}</span>
            <strong>{item.votes}</strong>
          </article>
        ))}
      </div>
    </section>
  );
}

function buildStreamTotals(selectedStreams: Record<string, string>) {
  const seed = [
    { id: 'd1-breakout1-A', label: 'Commercial Strategy', count: 33 },
    { id: 'd1-breakout1-B', label: 'People and Culture', count: 28 },
    { id: 'd1-breakout1-C', label: 'Technology Roadmap', count: 39 },
    { id: 'd1-breakout2-A', label: 'Financial Deep Dive', count: 31 },
    { id: 'd1-breakout2-B', label: 'Client Experience', count: 34 },
    { id: 'd1-breakout2-C', label: 'Innovation Lab', count: 37 },
  ];
  const selected = new Set(Object.values(selectedStreams));
  return seed.map((item) => ({ ...item, count: item.count + (selected.has(item.id) ? 1 : 0) }));
}

function SessionDetail({
  sessionId,
  selectedStreams,
  onClose,
  onSpeaker,
}: {
  sessionId: string;
  selectedStreams: Record<string, string>;
  onClose: () => void;
  onSpeaker: (id: string) => void;
}) {
  const session = sessionById(sessionId);
  if (!session) return null;
  const label = sessionLabel(session, selectedStreams);
  const choice = resolveBreakoutChoice(session, selectedStreams);
  const speakerIds = choice?.speakerIds ?? session.speakerIds ?? [];
  return (
    <div className="sheet-backdrop" role="presentation" onClick={onClose}>
      <article className="detail-sheet" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <button className="close-button" type="button" onClick={onClose} aria-label="Close">Close</button>
        <p className="eyebrow">{formatTime(session.start)}-{formatTime(session.end)}</p>
        <h2>{label.title}</h2>
        <p className="detail-location">{label.room ?? 'Multiple rooms'} · {label.level ?? session.level ?? dayLabel(session.day)}</p>
        {session.description && <p className="detail-copy">{session.description}</p>}
        {session.note && <p className="detail-copy">{session.note}</p>}
        {session.breakout && (
          <div className="detail-box">
            <span>Your selected stream</span>
            <strong>{choice?.stream}: {choice?.title}</strong>
            <em>{choice?.room} · {choice?.capacity ? `Max ${choice.capacity}` : 'Pre-booked room'}</em>
          </div>
        )}
        {speakerIds.length > 0 && (
          <div className="speaker-chips">
            {speakerIds.map((id) => {
              const speaker = speakerById(id);
              if (!speaker) return null;
              return (
                <button key={id} type="button" onClick={() => onSpeaker(id)}>
                  <span>{speaker.initials}</span>
                  {speaker.name}
                </button>
              );
            })}
          </div>
        )}
      </article>
    </div>
  );
}

function SpeakerDetail({ speakerId, onClose, onSession }: { speakerId: string; onClose: () => void; onSession: (id: string) => void }) {
  const speaker = speakerById(speakerId);
  if (!speaker) return null;
  return (
    <div className="sheet-backdrop" role="presentation" onClick={onClose}>
      <article className="detail-sheet" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <button className="close-button" type="button" onClick={onClose} aria-label="Close">Close</button>
        <div className="speaker-hero">
          <span>{speaker.initials}</span>
          <div>
            <p className="eyebrow">{speaker.org}</p>
            <h2>{speaker.name}</h2>
            <p>{speaker.title}</p>
          </div>
        </div>
        <p className="detail-copy">{speaker.bio}</p>
        <div className="agenda-list compact">
          {speaker.sessions.map((sessionId) => {
            const session = sessionById(sessionId);
            if (!session) return null;
            return (
              <button key={sessionId} className="agenda-row" type="button" onClick={() => onSession(sessionId)}>
                <span className="mono">{formatTime(session.start)}</span>
                <strong>{session.title}</strong>
                <em>{session.room ?? 'Breakout stream'}</em>
              </button>
            );
          })}
        </div>
      </article>
    </div>
  );
}

function AwardsReveal({ onClose }: { onClose: () => void }) {
  return (
    <div className="reveal-screen" role="dialog" aria-modal="true">
      <div className="confetti" />
      <p className="eyebrow">Colleague's Choice</p>
      <h2>The Client Success Team</h2>
      <p>Voted by colleagues across Apex Group.</p>
      <button type="button" onClick={onClose}>Return to guide</button>
    </div>
  );
}

function SectionHeading({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="section-heading">
      <h3>{title}</h3>
      {detail && <span>{detail}</span>}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
