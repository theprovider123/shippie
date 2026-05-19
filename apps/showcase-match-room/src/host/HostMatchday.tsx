import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { qrSvg } from '@shippie/qr';
import type { PollDescriptor, PollTally } from '@shippie/proximity';
import { OPENING_FIXTURE, fixtureTitle, teamByCode } from '../data/tournament.ts';
import { FantasyLeaguePanel } from '../fantasy/FantasyLeaguePanel.tsx';
import type { Copy, Locale } from '../i18n.ts';
import { cityTreatmentClass } from '../lib/city-flavor.ts';
import { createSweepstakeDraw } from '../lib/draw.ts';
import { templateConfig } from '../lib/room-template.ts';
import { dailyTrivia } from '../lib/trivia-engine.ts';
import { formatKickoff } from '../lib/time-zone.ts';
import { provenanceLabel } from '../shared/live-scores-client.ts';
import type { SavedRoom, UserProfile } from '../shared/local-store.ts';
import { matchRoomUrl } from '../shared/signal-config.ts';
import { useOpeningLiveScore } from '../shared/use-live-score.ts';
import { useMatchdayRoom } from '../shared/use-matchday-room.ts';
import type { RoomTemplate, ScorePoll, ScoreTally } from '../shared/types.ts';
import { BoardSwitcher } from '../ui/BoardSwitcher.tsx';
import { CityPaperAtlas } from '../ui/CityPaperAtlas.tsx';
import { CommentaryRoom } from '../ui/CommentaryRoom.tsx';
import { MatchProgramme } from '../ui/MatchProgramme.tsx';
import { ShareCardButton } from '../ui/ShareCardButton.tsx';
import { TeamFollowPanel } from '../ui/TeamFollowPanel.tsx';
import { ProfileSettings } from '../ui/ProfileSettings.tsx';
import { TournamentStructure } from '../ui/TournamentStructure.tsx';
import { InstallPanel } from '../ui/InstallPanel.tsx';
import { TriviaPanel } from '../guest/TriviaPanel.tsx';
import { durationFromMinutes, randomDrawSeed, randomMemberPlaceholder, randomPlayerPlaceholder } from './host-controller.ts';

type RoomMode = 'predictions' | 'live' | 'trivia' | 'banter';
type RoomModes = Record<RoomMode, boolean>;

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
  const [question, setQuestion] = useState('Player of the match?');
  const [options, setOptions] = useState(() => randomPlayerPlaceholder());
  const [drawSeed, setDrawSeed] = useState(() => randomDrawSeed());
  const [drawMembers, setDrawMembers] = useState(() => randomMemberPlaceholder());
  const [lastMoment, setLastMoment] = useState<string | null>(null);
  const [roomModes, setRoomModes] = useState<RoomModes>({
    predictions: true,
    live: true,
    trivia: true,
    banter: true,
  });
  const config = templateConfig(props.template);
  const liveScore = useOpeningLiveScore();
  const openingHome = teamByCode(OPENING_FIXTURE.home);
  const openingAway = teamByCode(OPENING_FIXTURE.away);
  const openingKickoff = new Date(OPENING_FIXTURE.kickoff).getTime();
  const dailyQuestion = dailyTrivia(new Date('2026-06-11T12:00:00Z'))[0] ?? null;
  const visiblePolls = useMemo(() => {
    const seen = new Set<string>();
    return room.polls.filter((poll) => Date.now() <= poll.closesAt).filter((poll) => {
      const key = `${poll.kind}:${poll.question}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [room.polls]);
  const visibleScorePolls = useMemo(() => {
    const seen = new Set<string>();
    return room.scorePolls.filter((poll) => Date.now() <= poll.closesAt).filter((poll) => {
      const key = `${poll.matchId ?? 'match'}:${poll.question}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [room.scorePolls]);
  const draw = useMemo(
    () => createSweepstakeDraw(drawMembers.split(','), drawSeed),
    [drawMembers, drawSeed],
  );
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
    void qrSvg(guestUrl, { size: 220, ecc: 'M', brand: 'none', fg: '#12382E', bg: '#F7F3EA' })
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

  const openMotm = async () => {
    const parsed = options.split(',').map((item) => item.trim()).filter(Boolean).slice(0, 8);
    if (parsed.length < 2) return;
    await room.openChoicePoll(question, parsed, durationFromMinutes(8));
  };

  const openMoment = async (label: string, action: () => Promise<void>) => {
    setLastMoment(label);
    await action();
  };

  const hasOpenChoicePoll = (questionText: string) => room.polls.some((poll) => poll.question === questionText && Date.now() <= poll.closesAt);
  const hasOpenScorePoll = (matchId: string, questionText: string) => room.scorePolls.some((poll) => {
    return poll.matchId === matchId && poll.question === questionText && Date.now() <= poll.closesAt;
  });

  const openChoiceMoment = async (questionText: string, pollOptions: readonly string[], minutes: number) => {
    if (hasOpenChoicePoll(questionText)) return;
    await room.openChoicePoll(questionText, pollOptions, durationFromMinutes(minutes));
  };

  const openOpeningPrediction = async () => {
    const questionText = `${fixtureTitle(OPENING_FIXTURE)} exact score`;
    if (hasOpenScorePoll(OPENING_FIXTURE.id, questionText)) return;
    await room.openScorePoll({
      matchId: OPENING_FIXTURE.id,
      question: questionText,
      homeLabel: openingHome.code,
      awayLabel: openingAway.code,
      closesAt: openingKickoff,
    });
  };

  const openVarVerdict = async () => {
    await openChoiceMoment('VAR verdict?', ['Agreed', 'Robbed', 'Need another angle', 'No idea'], 6);
  };

  const openDailyTrivia = async () => {
    if (!dailyQuestion) return;
    await openChoiceMoment(dailyQuestion.question, dailyQuestion.options, 2);
  };

  const openNextGoal = async () => {
    await openChoiceMoment('Next goal?', [openingHome.name, openingAway.name, 'No more goals'], 8);
  };

  const openFirstGoal = async () => {
    await openChoiceMoment('First goal?', [openingHome.name, openingAway.name, 'No goals'], 10);
  };

  const openUpsetAlert = async () => {
    await openChoiceMoment('Upset alert?', ['I can see it', 'No chance', 'Draw written all over it', 'Ask me at half-time'], 8);
  };

  const openSnackVote = async () => {
    await openChoiceMoment('Watch snack?', ['Tacos', 'Pizza', 'Wings', 'Sushi', 'Bring your own'], 12);
  };

  const openPulseCheck = async () => {
    await room.openRatingPoll('How nervous is the room?', durationFromMinutes(4));
  };

  const openScorePicksMoment = () => openMoment('Score picks', openOpeningPrediction);
  const openVarMoment = () => openMoment('VAR check', openVarVerdict);
  const openDailyFiveMoment = () => openMoment('Daily five', openDailyTrivia);
  const resetActiveMoments = () => {
    for (const poll of room.polls.filter((item) => Date.now() <= item.closesAt)) void room.closeCrowdPoll(poll.id);
    for (const poll of room.scorePolls.filter((item) => Date.now() <= item.closesAt)) void room.closeScorePoll(poll.id);
    setLastMoment(null);
  };

  return (
    <main className="matchday host-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">{props.copy.hostEyebrow}</p>
          <h1>{props.copy.hostTitle}</h1>
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
          <StatusPill status={room.status.connection} peers={room.status.peerCount} copy={props.copy} />
        </div>
      </header>
      <section className="host-grid">
        <div className="control-column">
          <section className={`operator-panel match-card ${cityTreatmentClass(OPENING_FIXTURE.cityCode)}`.trim()}>
            <div className="panel-head">
              <h2>{fixtureTitle(OPENING_FIXTURE)}</h2>
              <span>{config.title}</span>
            </div>
            <div className="match-card-teams">
              <TeamBadge code={openingHome.code} name={openingHome.name} swatch={openingHome.swatch} />
              <div className="match-score-core">
                <strong>{liveScore.scoreHome ?? '–'}-{liveScore.scoreAway ?? '–'}</strong>
                <span>{provenanceLabel(liveScore.provenance)}</span>
              </div>
              <TeamBadge code={openingAway.code} name={openingAway.name} swatch={openingAway.swatch} />
            </div>
            <p className="muted">
              {OPENING_FIXTURE.stage} · {OPENING_FIXTURE.venue}, {OPENING_FIXTURE.city} · {formatKickoff(OPENING_FIXTURE.kickoff, props.timeZone, props.locale)}
            </p>
            <div className="match-card-foot">
              <span>Mexico City paper</span>
              <strong>Predictions · Votes · Trivia</strong>
            </div>
            <p>{config.tagline}</p>
            <div className="quick-action-row" aria-label="Open a room moment">
              <button className="primary-action" onClick={() => void openScorePicksMoment()}>Open score picks</button>
              <button onClick={() => void openVarMoment()}>VAR vote</button>
              <button onClick={() => void openDailyFiveMoment()}>Daily quiz</button>
            </div>
            {lastMoment ? (
              <div className="moment-feedback" role="status">
                <span>Opened for this room</span>
                <strong>{lastMoment}</strong>
                <small>Guests can play now. Results appear below.</small>
                <ShareCardButton provenance={provenanceLabel(liveScore.provenance)} profile={props.profile} roomName={config.title} moment={lastMoment} />
              </div>
            ) : null}
          </section>

          <details className="simple-drawer">
            <summary>
              <span>More host controls</span>
              <strong>First goal, next goal, player vote, snacks</strong>
            </summary>
            <MomentCockpit
              modes={roomModes}
              onToggle={(mode) => setRoomModes((current) => ({ ...current, [mode]: !current[mode] }))}
              onScorePicks={openScorePicksMoment}
              onFirstGoal={() => openMoment('First goal', openFirstGoal)}
              onUpsetAlert={() => openMoment('Upset alert', openUpsetAlert)}
              onVarVerdict={openVarMoment}
              onPlayerVote={() => openMoment('Player vote', openMotm)}
              onNextGoal={() => openMoment('Next goal', openNextGoal)}
              onDailyTrivia={openDailyFiveMoment}
              onPulseCheck={() => openMoment('Pulse check', openPulseCheck)}
              onSnackVote={() => openMoment('Snack vote', openSnackVote)}
            />
          </details>

          <details className="simple-drawer">
            <summary>
              <span>Match guide</span>
              <strong>Kickoff, venue, city notes</strong>
            </summary>
            <MatchProgramme
              fixture={OPENING_FIXTURE}
              locale={props.locale}
              timeZone={props.timeZone}
              copy={props.copy}
              onTimeZoneChange={props.onTimeZoneChange}
            />
          </details>

          <section className="operator-panel room-share-panel">
            <div className="panel-head">
              <h2>Invite this room</h2>
              <span>Guest and screen links</span>
            </div>
            <div className="room-share-grid">
              <article>
                <div>
                  <strong>Guest room</strong>
                  <span>People join, vote, predict, and play.</span>
                </div>
                {qrMarkup ? <div className="qr-frame" dangerouslySetInnerHTML={{ __html: qrMarkup }} /> : <code>{guestUrl}</code>}
                <button onClick={() => void navigator.clipboard?.writeText(guestUrl)}>Copy guest link</button>
              </article>
              <article>
                <div>
                  <strong>Display room</strong>
                  <span>Put this on a TV, tablet, or pub screen.</span>
                </div>
                <code>{displayUrl}</code>
                <button onClick={() => void navigator.clipboard?.writeText(displayUrl)}>Copy display link</button>
              </article>
            </div>
          </section>

          <section className="operator-panel room-tools-panel">
            <details className="advanced-tools">
              <summary>
                <span>Room game</span>
                <strong>48-team sweepstake</strong>
              </summary>
              <div className="advanced-tools-body">
                <label>
                  Seed
                  <input value={drawSeed} onChange={(event) => setDrawSeed(event.currentTarget.value)} />
                </label>
                <label>
                  Members
                  <input value={drawMembers} onChange={(event) => setDrawMembers(event.currentTarget.value)} />
                </label>
                <div className="draw-list">
                  {draw.slice(0, 4).map((item) => (
                    <div key={item.member} className="draw-row">
                      <strong>{item.member}</strong>
                      <span>{item.teams.slice(0, 4).join(', ')}{item.teams.length > 4 ? '…' : ''}</span>
                    </div>
                  ))}
                </div>
              </div>
            </details>
          </section>

          <section className="operator-panel host-tools-panel">
            <details className="advanced-tools">
              <summary>
                <span>Advanced host tools</span>
                <strong>Custom moment</strong>
              </summary>
              <div className="advanced-tools-body">
                <label>
                  {props.copy.question}
                  <input value={question} onChange={(event) => setQuestion(event.currentTarget.value)} />
                </label>
                <label>
                  {props.copy.choices}
                  <input value={options} onChange={(event) => setOptions(event.currentTarget.value)} />
                </label>
                <div className="command-row">
                  <button className="primary-action" onClick={() => void openMoment('Custom player vote', openMotm)}>Open player vote</button>
                  <button onClick={() => void openMoment('Custom rating', () => room.openRatingPoll('How loud is the ground?', durationFromMinutes(5)))}>Rating</button>
                  <button onClick={() => void openMoment('Custom score poll', () => room.openScorePoll({
                    question: 'Predict the final score',
                    homeLabel: 'Home',
                    awayLabel: 'Away',
                    durationSeconds: durationFromMinutes(8),
                  }))}>Score</button>
                </div>
              </div>
            </details>
          </section>
        </div>

        <div className="results-column">
          <section className="operator-panel live-results" hidden={visiblePolls.length === 0 && visibleScorePolls.length === 0}>
            <div className="panel-head">
              <h2>{props.copy.liveTallies}</h2>
              <span>{visiblePolls.length + visibleScorePolls.length} active</span>
            </div>
            <button className="quiet-action reset-moments-action" onClick={resetActiveMoments}>Reset active moments</button>
            {visiblePolls.map((poll) => (
              <CrowdResult
                key={poll.id}
                poll={poll}
                tally={room.tallies.find((item) => item.pollId === poll.id)}
                onClose={() => void room.closeCrowdPoll(poll.id)}
              />
            ))}
            {visibleScorePolls.map((poll) => (
              <ScoreResult
                key={poll.id}
                poll={poll}
                tally={room.scoreTallies.find((item) => item.pollId === poll.id)}
                onClose={() => void room.closeScorePoll(poll.id)}
              />
            ))}
          </section>

          <details className="simple-drawer">
            <summary>
              <span>Commentary</span>
              <strong>Optional sideband chatter</strong>
            </summary>
            <CommentaryRoom />
            {lastMoment ? (
              <ShareCardButton
                provenance={provenanceLabel(liveScore.provenance)}
                profile={props.profile}
                roomName={config.title}
                moment={lastMoment}
              />
            ) : null}
          </details>

          <div className="tournament-hub">
            <details className="tournament-drawer">
              <summary>
                <span>Tournament format</span>
                <strong>Groups and knockout</strong>
              </summary>
              <TournamentStructure />
            </details>
            <details className="tournament-drawer">
              <summary>
                <span>Your identity</span>
                <strong>Follow a team</strong>
              </summary>
              <TeamFollowPanel
                locale={props.locale}
                timeZone={props.timeZone}
                followedTeam={props.profile.primaryTeam}
                onFollow={(code) => props.onProfileChange({ primaryTeam: code, followedTeams: [code, ...props.profile.followedTeams.filter((item) => item !== code)] })}
              />
            </details>
            <details className="tournament-drawer">
              <summary>
                <span>Squads and chips</span>
                <strong>Fantasy league</strong>
              </summary>
              <FantasyLeaguePanel
                peerId={props.peerId}
                roomId={props.roomId}
                archive={room.archive}
                teams={room.fantasyTeams}
                onSaveTeam={room.saveFantasyTeam}
                onPlayChip={room.playFantasyChip}
              />
            </details>
            <details className="tournament-drawer">
              <summary>
                <span>Cities and quizzes</span>
                <strong>Explore the hosts</strong>
              </summary>
              <CityPaperAtlas />
              <TriviaPanel />
            </details>
          </div>

          <details className="simple-drawer">
            <summary>
              <span>Moderation</span>
              <strong>{room.pendingShoutouts.length} shoutouts pending</strong>
            </summary>
            <div className="moderation-list">
              {room.pendingShoutouts.map((item) => (
                <div key={item.id} className="moderation-item">
                  <p>{item.text}</p>
                  <button onClick={() => void room.approveShoutout(item.id)}>Approve</button>
                </div>
              ))}
              {room.pendingShoutouts.length === 0 ? <p className="muted">{props.copy.queueClear}</p> : null}
            </div>
          </details>
          <details className="simple-drawer">
            <summary>
              <span>App setup</span>
              <strong>Install Match Room</strong>
            </summary>
            <InstallPanel />
          </details>
        </div>
      </section>
    </main>
  );
}

function MomentSection(props: { title: string; children: React.ReactNode }) {
  return (
    <div className="moment-section">
      <span>{props.title}</span>
      <div className="moment-grid">{props.children}</div>
    </div>
  );
}

function NextActionCard(props: {
  hidden?: boolean;
  title: string;
  detail: string;
  meta: string;
  actionLabel: string;
  onAction: () => void | Promise<void>;
}) {
  return (
    <section className="next-action-card" hidden={props.hidden}>
      <div>
        <span>{props.meta}</span>
        <strong>{props.title}</strong>
        <p>{props.detail}</p>
      </div>
      <button className="primary-action" onClick={() => void props.onAction()}>{props.actionLabel}</button>
    </section>
  );
}

function MomentCockpit(props: {
  modes: RoomModes;
  onToggle: (mode: RoomMode) => void;
  onScorePicks: () => void | Promise<void>;
  onFirstGoal: () => void | Promise<void>;
  onUpsetAlert: () => void | Promise<void>;
  onVarVerdict: () => void | Promise<void>;
  onPlayerVote: () => void | Promise<void>;
  onNextGoal: () => void | Promise<void>;
  onDailyTrivia: () => void | Promise<void>;
  onPulseCheck: () => void | Promise<void>;
  onSnackVote: () => void | Promise<void>;
}) {
  return (
    <div className="moment-cockpit" aria-label="Match Room cockpit">
      <div className="cockpit-head">
        <div>
          <span>Run the room</span>
          <strong>Pick a vibe, open one moment</strong>
        </div>
        <small>Keep the screen calm. Hide anything you are not using.</small>
      </div>
      <div className="room-mode-toggles" aria-label="Room modes">
        <ModeToggle title="Picks" detail="scores + first goal" active={props.modes.predictions} onClick={() => props.onToggle('predictions')} />
        <ModeToggle title="Live" detail="VAR + next goal" active={props.modes.live} onClick={() => props.onToggle('live')} />
        <ModeToggle title="Trivia" detail="daily five" active={props.modes.trivia} onClick={() => props.onToggle('trivia')} />
        <ModeToggle title="Banter" detail="pulse + snacks" active={props.modes.banter} onClick={() => props.onToggle('banter')} />
      </div>
      <div className="priority-moments" aria-label="Recommended moments">
        {props.modes.predictions ? <MomentButton title="Score picks" detail="Best before kickoff" primary onClick={props.onScorePicks} /> : null}
        {props.modes.live ? <MomentButton title="VAR check" detail="Best during chaos" onClick={props.onVarVerdict} /> : null}
        {props.modes.trivia ? <MomentButton title="Daily five" detail="Best on off-days" onClick={props.onDailyTrivia} /> : null}
        {props.modes.banter ? <MomentButton title="Pulse check" detail="Best when nerves hit" onClick={props.onPulseCheck} /> : null}
      </div>
      <details className="moment-drawer">
        <summary>
          <span>More moments</span>
          <strong>First goal, upset alert, player vote, next goal, snack vote</strong>
        </summary>
        <div className="moment-sections" aria-label="More match moments">
          {props.modes.predictions ? (
            <MomentSection title="Before kickoff">
              <MomentButton title="First goal" detail="Quick opener call" onClick={props.onFirstGoal} />
              <MomentButton title="Upset alert" detail="Call the surprise early" onClick={props.onUpsetAlert} />
            </MomentSection>
          ) : null}
          {props.modes.live ? (
            <MomentSection title="During the match">
              <MomentButton title="Player vote" detail="Pick the room MVP" onClick={props.onPlayerVote} />
              <MomentButton title="Next goal" detail="Fast live prediction" onClick={props.onNextGoal} />
            </MomentSection>
          ) : null}
          {props.modes.banter ? (
            <MomentSection title="Room fun">
              <MomentButton title="Snack vote" detail="Settle the table" onClick={props.onSnackVote} />
            </MomentSection>
          ) : null}
        </div>
      </details>
    </div>
  );
}

function ModeToggle(props: { title: string; detail: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`mode-toggle ${props.active ? 'active' : ''}`}
      aria-pressed={props.active}
      onClick={props.onClick}
    >
      <span aria-hidden="true" />
      <strong>{props.title}</strong>
      <small>{props.detail}</small>
    </button>
  );
}

function MomentButton(props: { title: string; detail: string; primary?: boolean; onClick: () => void | Promise<void> }) {
  return (
    <button className={props.primary ? 'moment-button primary-action' : 'moment-button'} onClick={() => void props.onClick()}>
      <strong>{props.title}</strong>
      <span>{props.detail}</span>
    </button>
  );
}

function TeamBadge(props: { code: string; name: string; swatch: [string, string] }) {
  return (
    <div className="team-badge">
      <span className="flag-cloth" style={{ '--swatch-a': props.swatch[0], '--swatch-b': props.swatch[1] } as CSSProperties} />
      <div>
        <strong>{props.code}</strong>
        <em>{props.name}</em>
      </div>
    </div>
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
      {!props.tally?.leaders.length ? <p className="muted">Waiting for predictions.</p> : null}
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

function StatusPill(props: { status: string; peers: number; copy: Copy }) {
  const label = hostStatusLabel(props.status, props.peers, props.copy);
  return (
    <div className={`status-pill ${props.status}`}>
      <span />
      {label}
    </div>
  );
}

function hostStatusLabel(status: string, peers: number, copy: Copy): string {
  if (status === 'open' && peers > 0) return copy.connectedPeers(peers);
  if (status === 'open') return 'Waiting for guests';
  if (status === 'connecting') return 'Room ready';
  if (status === 'closed') return 'Room offline';
  return status;
}
