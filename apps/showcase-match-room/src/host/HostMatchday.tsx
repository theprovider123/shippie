import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { qrSvg } from '@shippie/qr';
import type { PollDescriptor, PollTally } from '@shippie/proximity';
import { OPENING_FIXTURE, fixtureTitle, teamByCode } from '../data/tournament.ts';
import type { Copy, Locale } from '../i18n.ts';
import { formatKickoff } from '../lib/time-zone.ts';
import { provenanceLabel } from '../shared/live-scores-client.ts';
import type { SavedRoom, UserProfile } from '../shared/local-store.ts';
import { matchRoomUrl } from '../shared/signal-config.ts';
import { useOpeningLiveScore } from '../shared/use-live-score.ts';
import { useMatchdayRoom } from '../shared/use-matchday-room.ts';
import type { RoomTemplate, ScorePoll, ScoreTally } from '../shared/types.ts';
import { MatchGuide } from '../ui/MatchGuide.tsx';
import { ProfileSettings } from '../ui/ProfileSettings.tsx';
import { RoomFeed } from '../ui/RoomFeed.tsx';
import { ShareCardButton } from '../ui/ShareCardButton.tsx';
import { durationFromMinutes, randomPlayerPlaceholder } from './host-controller.ts';

export function HostMatchday(props: {
  roomId: string;
  roomKey: string;
  signalBase: string;
  peerId: string;
  locale: Locale;
  template: RoomTemplate;
  copy: Copy;
  timeZone: string;
  onTimeZoneChange: (timeZone: string) => void;
  profile: UserProfile;
  onProfileChange: (profile: Partial<Omit<UserProfile, 'updatedAt'>>) => void;
  onLocaleChange: (locale: Locale) => void;
  savedRooms: SavedRoom[];
  onRoomsChange: (rooms: SavedRoom[]) => void;
}) {
  const room = useMatchdayRoom(props);
  const [qrMarkup, setQrMarkup] = useState<string | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [lastMoment, setLastMoment] = useState<string | null>(null);
  const [playerOptions] = useState(() => randomPlayerPlaceholder());
  const liveScore = useOpeningLiveScore();
  const home = teamByCode(OPENING_FIXTURE.home);
  const away = teamByCode(OPENING_FIXTURE.away);
  const kickoff = new Date(OPENING_FIXTURE.kickoff).getTime();

  const visiblePolls = useMemo(() => {
    const seen = new Set<string>();
    return room.polls.filter((poll) => Date.now() < poll.closesAt).filter((poll) => {
      const key = `${poll.kind}:${poll.question}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [room.polls]);

  const visibleScorePolls = useMemo(() => {
    const seen = new Set<string>();
    return room.scorePolls.filter((poll) => Date.now() < poll.closesAt).filter((poll) => {
      const key = `${poll.matchId ?? 'match'}:${poll.question}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [room.scorePolls]);

  const guestUrl = useMemo(
    () => matchRoomUrl({
      role: 'play',
      roomId: props.roomId,
      roomKey: props.roomKey,
      signalBase: props.signalBase,
      template: props.template,
      locale: props.locale,
      timeZone: props.timeZone,
    }),
    [props.roomId, props.roomKey, props.signalBase, props.template, props.locale, props.timeZone],
  );

  const displayUrl = useMemo(
    () => matchRoomUrl({
      role: 'display',
      roomId: props.roomId,
      roomKey: props.roomKey,
      signalBase: props.signalBase,
      template: props.template,
      locale: props.locale,
      timeZone: props.timeZone,
    }),
    [props.roomId, props.roomKey, props.signalBase, props.template, props.locale, props.timeZone],
  );

  useEffect(() => {
    let cancelled = false;
    void qrSvg(guestUrl, { size: 220, ecc: 'M', brand: 'none', fg: '#12382E', bg: '#F8F4E8' })
      .then((svg) => {
        if (!cancelled) setQrMarkup(svg);
      })
      .catch(() => {
        if (!cancelled) setQrMarkup(null);
      });
    return () => {
      cancelled = true;
    };
  }, [guestUrl]);

  const openMoment = async (label: string, action: () => Promise<void>) => {
    setLastMoment(label);
    setActionsOpen(false);
    await action();
  };

  const hasOpenChoicePoll = (questionText: string) => room.polls.some((poll) => poll.question === questionText && Date.now() <= poll.closesAt);
  const hasOpenScorePoll = (matchId: string, questionText: string) => room.scorePolls.some((poll) => poll.matchId === matchId && poll.question === questionText && Date.now() <= poll.closesAt);

  const openChoiceMoment = async (question: string, options: readonly string[], minutes: number) => {
    if (hasOpenChoicePoll(question)) return;
    await room.openChoicePoll(question, options, durationFromMinutes(minutes));
  };

  const openScorePicks = async () => {
    const question = 'Predict the final score';
    if (hasOpenScorePoll(OPENING_FIXTURE.id, question)) return;
    await room.openScorePoll({
      matchId: OPENING_FIXTURE.id,
      question,
      homeLabel: home.name,
      awayLabel: away.name,
      closesAt: kickoff,
    });
  };

  const resetActiveMoments = () => {
    for (const poll of visiblePolls) void room.closeCrowdPoll(poll.id);
    for (const poll of visibleScorePolls) void room.closeScorePoll(poll.id);
    setLastMoment(null);
  };

  const shareRoom = async () => {
    if (navigator.share) {
      await navigator.share({ title: 'Join my Match Room', text: 'World Cup predictions, votes, and banter.', url: guestUrl }).catch(() => undefined);
      return;
    }
    await navigator.clipboard?.writeText(guestUrl).catch(() => undefined);
  };

  return (
    <main className="match-room host">
      <RoomTopbar
        eyebrow="Host"
        title="Match Room"
        status={<StatusPill status={room.status.connection} peers={room.status.peerCount} copy={props.copy} />}
        profile={props.profile}
        locale={props.locale}
        timeZone={props.timeZone}
        onProfileChange={props.onProfileChange}
        onLocaleChange={props.onLocaleChange}
        onTimeZoneChange={props.onTimeZoneChange}
      />

      <div className="room-workspace">
        <section className="room-main">
          <MatchHeader
            home={home}
            away={away}
            liveScore={liveScore}
            timeZone={props.timeZone}
            locale={props.locale}
          />

          <MatchGuide locale={props.locale} timeZone={props.timeZone} />

          <section className="host-play-panel" aria-label="Start something for the room">
            <div className="section-head">
              <div>
                <span>Play together</span>
                <h2>Start a prediction</h2>
              </div>
            </div>
            <div className="host-quickbar">
              <button className="primary-action" onClick={() => void openMoment('Score prediction', openScorePicks)}>Predict score</button>
              <button onClick={() => void openMoment('First goal', () => openChoiceMoment('First goal?', [home.name, away.name, 'No goals'], 10))}>First goal</button>
              <button onClick={() => void openMoment('Player vote', () => openChoiceMoment('Player of the match?', playerOptions.split(',').map((item) => item.trim()).filter(Boolean).slice(0, 6), 8))}>Player vote</button>
              <button onClick={() => void openMoment('Room mood', () => room.openRatingPoll('How are we feeling?', durationFromMinutes(4)))}>Room mood</button>
            </div>
          </section>

          <ActiveMoments
            polls={visiblePolls}
            tallies={room.tallies}
            scorePolls={visibleScorePolls}
            scoreTallies={room.scoreTallies}
            onCloseChoice={(id) => void room.closeCrowdPoll(id)}
            onCloseScore={(id) => void room.closeScorePoll(id)}
            onReset={resetActiveMoments}
          />

          <RoomFeed
            title="Room chat"
            disabled={false}
            approved={room.approvedShoutouts}
            pending={room.pendingShoutouts}
            canModerate
            onSubmit={room.submitShoutout}
            onApprove={room.approveShoutout}
          />
        </section>

        <aside className="room-side" aria-label="Room tools">
          <InvitePanel
            qrMarkup={qrMarkup}
            guestUrl={guestUrl}
            displayUrl={displayUrl}
            onShare={shareRoom}
          />
          <section className="room-side-panel">
            <div className="section-head">
              <div>
                <span>Room</span>
                <h2>Status</h2>
              </div>
              <strong>{room.status.peerCount}</strong>
            </div>
            <dl className="status-list">
              <div>
                <dt>Archive</dt>
                <dd>{formatArchiveStatus(room.archive)}</dd>
              </div>
              <div>
                <dt>Active</dt>
                <dd>{visiblePolls.length + visibleScorePolls.length} open</dd>
              </div>
              <div>
                <dt>Screen</dt>
                <dd><button type="button" onClick={() => window.open(displayUrl, '_blank', 'noopener,noreferrer')}>Cast</button></dd>
              </div>
            </dl>
            {lastMoment ? (
              <ShareCardButton provenance={provenanceLabel(liveScore.provenance)} profile={props.profile} roomName="Match Room" moment={lastMoment} />
            ) : null}
          </section>
        </aside>
      </div>

      <nav className="room-bottom-bar" aria-label="Room actions">
        <button className="primary-action" onClick={() => setActionsOpen(true)}>Start play</button>
        <button onClick={() => setInviteOpen(true)}>Invite</button>
        <button onClick={() => window.open(displayUrl, '_blank', 'noopener,noreferrer')}>Cast</button>
      </nav>

      {actionsOpen ? (
        <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setActionsOpen(false);
        }}>
          <section className="action-sheet" role="dialog" aria-modal="true" aria-label="Start something">
            <div className="sheet-head">
              <h2>Start something</h2>
              <button onClick={() => setActionsOpen(false)}>Done</button>
            </div>
            <div className="moment-list">
              <MomentButton title="Predict score" detail="Everyone calls the final score" onClick={() => openMoment('Score prediction', openScorePicks)} />
              <MomentButton title="First goal" detail="Who scores first?" onClick={() => openMoment('First goal', () => openChoiceMoment('First goal?', [home.name, away.name, 'No goals'], 10))} />
              <MomentButton title="VAR call" detail="Settle a big decision" onClick={() => openMoment('VAR call', () => openChoiceMoment('VAR call?', ['Good call', 'Robbed', 'Need another angle'], 6))} />
              <MomentButton title="Player vote" detail="Pick player of the match" onClick={() => openMoment('Player vote', () => openChoiceMoment('Player of the match?', playerOptions.split(',').map((item) => item.trim()).filter(Boolean).slice(0, 6), 8))} />
              <MomentButton title="Room mood" detail="Rate how the room feels" onClick={() => openMoment('Room mood', () => room.openRatingPoll('How are we feeling?', durationFromMinutes(4)))} />
            </div>
          </section>
        </div>
      ) : null}

      {inviteOpen ? (
        <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setInviteOpen(false);
        }}>
          <section className="action-sheet invite-sheet" role="dialog" aria-modal="true" aria-label="Invite people">
            <div className="sheet-head">
              <h2>Invite</h2>
              <button onClick={() => setInviteOpen(false)}>Done</button>
            </div>
            <InvitePanel qrMarkup={qrMarkup} guestUrl={guestUrl} displayUrl={displayUrl} onShare={shareRoom} compact />
          </section>
        </div>
      ) : null}
    </main>
  );
}

function RoomTopbar(props: {
  eyebrow: string;
  title: string;
  status: ReactNode;
  profile: UserProfile;
  locale: Locale;
  timeZone: string;
  onProfileChange: (profile: Partial<Omit<UserProfile, 'updatedAt'>>) => void;
  onLocaleChange: (locale: Locale) => void;
  onTimeZoneChange: (timeZone: string) => void;
}) {
  return (
    <header className="room-topbar">
      <div>
        <p className="eyebrow">{props.eyebrow}</p>
        <h1>{props.title}</h1>
      </div>
      <div className="topbar-actions">
        <ProfileSettings
          profile={props.profile}
          locale={props.locale}
          timeZone={props.timeZone}
          onProfileChange={props.onProfileChange}
          onLocaleChange={props.onLocaleChange}
          onTimeZoneChange={props.onTimeZoneChange}
        />
        {props.status}
      </div>
    </header>
  );
}

function MatchHeader(props: {
  home: ReturnType<typeof teamByCode>;
  away: ReturnType<typeof teamByCode>;
  liveScore: ReturnType<typeof useOpeningLiveScore>;
  timeZone: string;
  locale: Locale;
}) {
  return (
    <section className="match-header">
      <div className="match-meta">
        <span>Opening match</span>
        <h2>{fixtureTitle(OPENING_FIXTURE)}</h2>
        <p>{OPENING_FIXTURE.venue}, {OPENING_FIXTURE.city} · {formatKickoff(OPENING_FIXTURE.kickoff, props.timeZone, props.locale)}</p>
      </div>
      <div className="score-line">
        <TeamMark team={props.home} />
        <div className="score-core">
          <strong>{props.liveScore.scoreHome ?? '-'}-{props.liveScore.scoreAway ?? '-'}</strong>
          <span>{provenanceLabel(props.liveScore.provenance)}</span>
        </div>
        <TeamMark team={props.away} align="right" />
      </div>
    </section>
  );
}

function TeamMark(props: { team: ReturnType<typeof teamByCode>; align?: 'right' }) {
  return (
    <div className={props.align === 'right' ? 'team-mark right' : 'team-mark'}>
      <i style={{ background: `linear-gradient(135deg, ${props.team.swatch[0]}, ${props.team.swatch[1]})` }} />
      <strong>{props.team.code}</strong>
      <span>{props.team.name}</span>
    </div>
  );
}

function ActiveMoments(props: {
  polls: readonly PollDescriptor[];
  tallies: readonly PollTally[];
  scorePolls: readonly ScorePoll[];
  scoreTallies: readonly ScoreTally[];
  onCloseChoice: (id: string) => void;
  onCloseScore: (id: string) => void;
  onReset: () => void;
}) {
  const total = props.polls.length + props.scorePolls.length;
  return (
    <section className="active-moments">
      <div className="section-head">
        <div>
          <span>Live play</span>
          <h2>{total ? 'Open predictions' : 'Nothing open yet'}</h2>
        </div>
        {total ? <button onClick={props.onReset}>Reset</button> : <strong>Ready</strong>}
      </div>
      {total === 0 ? (
        <p className="quiet-copy">Start a prediction, vote, or room mood check when you want everyone to join in.</p>
      ) : null}
      {props.polls.map((poll) => (
        <CrowdResult
          key={poll.id}
          poll={poll}
          tally={props.tallies.find((item) => item.pollId === poll.id)}
          onClose={() => props.onCloseChoice(poll.id)}
        />
      ))}
      {props.scorePolls.map((poll) => (
        <ScoreResult
          key={poll.id}
          poll={poll}
          tally={props.scoreTallies.find((item) => item.pollId === poll.id)}
          onClose={() => props.onCloseScore(poll.id)}
        />
      ))}
    </section>
  );
}

function CrowdResult(props: { poll: PollDescriptor; tally: PollTally | undefined; onClose: () => void }) {
  const total = props.tally?.totalVotes ?? 0;
  const closed = Date.now() > props.poll.closesAt;
  return (
    <article className="result-block">
      <div className="result-title">
        <h3>{props.poll.question}</h3>
        <button disabled={closed} onClick={props.onClose}>{closed ? 'Closed' : 'Close'}</button>
      </div>
      {props.poll.kind === 'choice' ? props.poll.options.map((option, index) => {
        const count = props.tally?.perBucket[index] ?? 0;
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        return <Bar key={option} label={option} value={pct} count={count} />;
      }) : [1, 2, 3, 4, 5].map((score, index) => {
        const count = props.tally?.perBucket[index] ?? 0;
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        return <Bar key={score} label={`${score}`} value={pct} count={count} />;
      })}
    </article>
  );
}

function ScoreResult(props: { poll: ScorePoll; tally: ScoreTally | undefined; onClose: () => void }) {
  const closed = Date.now() > props.poll.closesAt;
  return (
    <article className="result-block">
      <div className="result-title">
        <h3>{props.poll.question}</h3>
        <button disabled={closed} onClick={props.onClose}>{closed ? 'Closed' : 'Close'}</button>
      </div>
      {(props.tally?.leaders ?? []).map((item) => (
        <Bar key={item.score} label={item.score} value={props.tally?.totalVotes ? Math.round((item.count / props.tally.totalVotes) * 100) : 0} count={item.count} />
      ))}
      {!props.tally?.leaders.length ? <p className="quiet-copy">Waiting for predictions.</p> : null}
    </article>
  );
}

function Bar(props: { label: string; value: number; count: number }) {
  return (
    <div className="bar-row">
      <div>
        <span>{props.label}</span>
        <strong>{props.count}</strong>
      </div>
      <i style={{ transform: `scaleX(${Math.max(0.02, props.value / 100)})` }} />
    </div>
  );
}

function InvitePanel(props: {
  qrMarkup: string | null;
  guestUrl: string;
  displayUrl: string;
  compact?: boolean;
  onShare: () => Promise<void>;
}) {
  return (
    <section className={props.compact ? 'invite-panel compact' : 'invite-panel'}>
      <div className="section-head">
        <div>
          <span>Invite</span>
          <h2>Bring people in</h2>
        </div>
      </div>
      {props.qrMarkup ? <div className="qr-frame" dangerouslySetInnerHTML={{ __html: props.qrMarkup }} /> : null}
      <div className="invite-actions">
        <button className="primary-action" onClick={() => void props.onShare()}>Share room</button>
        <button onClick={() => void navigator.clipboard?.writeText(props.guestUrl)}>Copy invite</button>
        <button onClick={() => void navigator.clipboard?.writeText(props.displayUrl)}>Copy cast link</button>
      </div>
    </section>
  );
}

function MomentButton(props: { title: string; detail: string; onClick: () => Promise<void> }) {
  return (
    <button type="button" className="moment-button" onClick={() => void props.onClick()}>
      <strong>{props.title}</strong>
      <span>{props.detail}</span>
    </button>
  );
}

function StatusPill(props: { status: string; peers: number; copy: Copy }) {
  const label = props.status === 'open' && props.peers > 0
    ? props.copy.connectedPeers(props.peers)
    : props.status === 'open'
      ? 'Room ready'
      : props.status === 'connecting'
        ? 'Room ready'
        : 'Room offline';
  return (
    <div className={`status-pill ${props.status}`}>
      <span />
      {label}
    </div>
  );
}

function formatArchiveStatus(archive: { documentId: string | null; pendingCount: number; lastSyncedAt: number | null }): string {
  if (archive.pendingCount > 0) return `${archive.pendingCount} saving`;
  if (archive.lastSyncedAt) return 'Saved';
  if (archive.documentId) return 'Ready';
  return 'Local';
}
