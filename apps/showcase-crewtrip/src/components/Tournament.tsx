import { useMemo, useState } from 'react';
import type {
  CrewGroup,
  CrewtripState,
  EventFormat,
  EventMode,
  Player,
  Role,
  TournamentEvent,
  TournamentMatch,
  TournamentPairingMode,
  TournamentScoringMode,
  TripDay,
} from '../types';
import { newId } from '../utils/ids';
import { GroupMark, PlayerAvatar, SegmentedControl } from './Atoms';
import { Icon } from './Icon';

interface TournamentProps {
  state: CrewtripState;
  role: Role | null;
  activePlayer: Player;
  groups: CrewGroup[];
  days: TripDay[];
  activeDayId: string;
  selectedEventId?: string | null;
  selectedMatchId?: string | null;
  published: boolean;
  deviceId: string;
  onPublish: () => void;
  onSelectEvent: (eventId: string | null) => void;
  onChange: (updater: (current: CrewtripState) => CrewtripState) => void;
}

interface Draft {
  name: string;
  emoji: string;
  format: EventFormat;
  mode: EventMode;
  unlockDayId: string;
  scheduledTime: string;
  scoringMode: TournamentScoringMode;
  gamesPerMatch: string;
  pointTarget: string;
  winBy: string;
  pairingMode: TournamentPairingMode;
  manualPairs: Array<{ sideAId: string; sideBId: string }>;
  pointsFirst: string;
  pointsSecond: string;
  pointsThird: string;
  pointsParticipation: string;
  participantIds: string[];
}

const PRESETS: Array<{ name: string; emoji: string; format: EventFormat; mode: EventMode }> = [
  { name: 'Ping-pong', emoji: '🏓', format: 'bracket', mode: 'individual' },
  { name: 'Football', emoji: '⚽', format: 'round_robin', mode: 'team' },
  { name: 'Cornhole', emoji: '◎', format: 'bracket', mode: 'team' },
  { name: 'Trivia', emoji: '?', format: 'open_scoreboard', mode: 'team' },
  { name: 'Steps challenge', emoji: '↟', format: 'open_scoreboard', mode: 'individual' },
  { name: 'Custom game', emoji: '✦', format: 'bracket', mode: 'individual' },
];

export function Tournament(props: TournamentProps) {
  const activeTournament = useMemo(() => {
    return props.state.tournaments.find((item) => item.status !== 'done') ?? props.state.tournaments.at(-1) ?? null;
  }, [props.state.tournaments]);
  const events = activeTournament
    ? props.state.tournamentEvents.filter((event) => event.tournamentId === activeTournament.id)
    : [];
  const selectedMatch = props.selectedMatchId
    ? props.state.tournamentMatches.find((match) => match.id === props.selectedMatchId)
    : null;
  const activeEvent = events.find((event) => event.id === props.selectedEventId)
    ?? events.find((event) => event.id === selectedMatch?.eventId)
    ?? events[0]
    ?? null;
  const matches = activeEvent ? props.state.tournamentMatches.filter((match) => match.eventId === activeEvent.id) : [];
  const leaderboard = buildLeaderboard(events, props.state.tournamentMatches);
  const isHost = props.role === 'host';

  if (!activeTournament) {
    return (
      <section className="tournament-empty">
        <div>
          <p className="eyebrow">{props.published ? 'Tournament mode' : 'Private host setup'}</p>
          <h3>Plan formats before the crew arrives</h3>
          <p>Create group stages, brackets, and scoreboards now. Publish them when they should appear in Games and on the timeline.</p>
        </div>
        {isHost ? (
          <div className="tournament-empty-actions">
            <button type="button" onClick={() => createTournament(props)}>Create tournament</button>
            {!props.published ? <button type="button" className="ghost" onClick={props.onPublish}>Publish formats</button> : null}
          </div>
        ) : <small>Waiting for the host to publish a tournament.</small>}
      </section>
    );
  }

  return (
    <section className="tournament-view">
      {isHost ? (
        <TournamentSetup
          state={props.state}
          tournamentId={activeTournament.id}
          events={events}
          players={props.state.players}
          groups={props.groups}
          days={props.days}
          published={props.published}
          onPublish={props.onPublish}
          onAddEvent={(draft) => addEvent(props, activeTournament.id, events.length, draft)}
          onStartTournament={() => startTournament(props, activeTournament.id)}
          onStartEvent={(eventId) => startEvent(props, eventId)}
        />
      ) : null}

      <LiveFormats
        events={events}
        matches={matches}
        allMatches={props.state.tournamentMatches}
        activeEvent={activeEvent}
        selectedMatchId={props.selectedMatchId ?? null}
        players={props.state.players}
        groups={props.groups}
        activePlayer={props.activePlayer}
        activeDayId={props.activeDayId}
        days={props.days}
        isHost={isHost}
        leaderboard={leaderboard}
        onSelectEvent={props.onSelectEvent}
        onReady={(matchId, participantId) => readyMatch(props, matchId, participantId)}
        onStartMatch={(matchId) => startMatch(props, matchId)}
        onScore={(matchId, side, score) => scoreMatch(props, matchId, side, score)}
        onReport={(matchId, winnerId) => reportMatch(props, matchId, winnerId)}
        onForfeit={(matchId, winnerId) => reportMatch(props, matchId, winnerId, 'forfeit')}
      />
    </section>
  );
}

function TournamentSetup(props: {
  state: CrewtripState;
  tournamentId: string;
  events: TournamentEvent[];
  players: Player[];
  groups: CrewGroup[];
  days: TripDay[];
  published: boolean;
  onPublish: () => void;
  onAddEvent: (draft: Draft) => void;
  onStartTournament: () => void;
  onStartEvent: (eventId: string) => void;
}) {
  const [presetIndex, setPresetIndex] = useState(0);
  const preset = PRESETS[presetIndex]!;
  const [draft, setDraft] = useState<Draft>(() => initialDraft(preset, props.players, props.groups, props.days));
  const participants = draft.mode === 'team' ? props.groups : props.players;

  function choosePreset(index: number) {
    const next = PRESETS[index] ?? PRESETS[0]!;
    setPresetIndex(index);
    setDraft(initialDraft(next, props.players, props.groups, props.days));
  }

  function setMode(mode: EventMode) {
    const nextParticipantIds = (mode === 'team' ? props.groups : props.players).map((item) => item.id);
    setDraft((current) => ({
      ...current,
      mode,
      participantIds: nextParticipantIds,
      manualPairs: buildManualPairs(nextParticipantIds),
    }));
  }

  function setFormat(format: EventFormat) {
    setDraft((current) => ({
      ...current,
      format,
      pairingMode: format === 'bracket' ? current.pairingMode : 'automatic',
    }));
  }

  function toggleParticipant(id: string) {
    setDraft((current) => ({
      ...current,
      participantIds: current.participantIds.includes(id)
        ? current.participantIds.filter((item) => item !== id)
        : [...current.participantIds, id],
      manualPairs: buildManualPairs(current.participantIds.includes(id)
        ? current.participantIds.filter((item) => item !== id)
        : [...current.participantIds, id]),
    }));
  }

  function useAllParticipants() {
    const nextParticipantIds = participants.map((item) => item.id);
    setDraft((current) => ({ ...current, participantIds: nextParticipantIds, manualPairs: buildManualPairs(nextParticipantIds) }));
  }

  function clearParticipants() {
    setDraft((current) => ({ ...current, participantIds: [], manualPairs: [] }));
  }

  function updateManualPair(index: number, side: 'sideAId' | 'sideBId', value: string) {
    setDraft((current) => {
      const manualPairs = buildManualPairs(current.participantIds, current.manualPairs);
      const next = manualPairs.map((pair, pairIndex) => (pairIndex === index ? { ...pair, [side]: value } : pair));
      return { ...current, manualPairs: next };
    });
  }

  const openingMatchCount = draft.format === 'open_scoreboard' ? draft.participantIds.length : Math.ceil(draft.participantIds.length / 2);
  const manualPairs = buildManualPairs(draft.participantIds, draft.manualPairs);

  return (
    <section className="tournament-setup">
      <header className="tournament-panel-head">
        <div>
          <p className="eyebrow">{props.published ? 'Published tournament' : 'Private tournament'}</p>
          <h3>Tournament control</h3>
          <small>{props.events.length ? `${props.events.length} live format${props.events.length === 1 ? '' : 's'} planned` : 'Add the first live format when you are ready.'}</small>
        </div>
        <div className="tournament-head-actions">
          {!props.published ? <button type="button" className="ghost" onClick={props.onPublish}>Publish formats</button> : null}
          <button type="button" disabled={!props.events.some((event) => event.participantIds.length >= 2)} onClick={props.onStartTournament}>Start ready</button>
        </div>
      </header>

      {props.events.length ? (
        <div className="planned-games-list">
          {props.events.map((event) => (
            <article key={event.id} className={event.participantIds.length < 2 ? 'needs-players' : ''}>
              <span className="planned-game-mark">{event.emoji ?? '✦'}</span>
              <div>
                <strong>{event.name}</strong>
                <small>
                  {event.participantIds.length} {event.mode === 'team' ? 'teams' : 'players'}
                  {' / '}
                  {event.format === 'open_scoreboard' ? `${event.participantIds.length} score rows` : `${openingPairsForEvent(event).length} opening matches`}
                  {' / '}
                  {event.gamesPerMatch ?? 1} games
                  {' / '}
                  {event.pairingMode === 'host_defined' ? 'host pairings' : formatLabel(event.format)}
                  {' / '}
                  {event.scheduledAt ? formatClock(event.scheduledAt) : 'TBC'}
                </small>
              </div>
              <em>{event.status}</em>
              <button type="button" className="ghost" onClick={() => props.onStartEvent(event.id)}>Start</button>
            </article>
          ))}
        </div>
      ) : null}

      <details className="tournament-add-panel">
        <summary>
          <span>{props.events.length ? 'Add another format' : 'Add live format'}</span>
          <small>{draft.name} / {draft.participantIds.length} {draft.mode === 'team' ? 'teams' : 'players'} / {matchRuleLabelForDraft(draft)}</small>
        </summary>
        <div className="tournament-builder">
          <div className="inline-game-presets">
            {PRESETS.map((item, index) => (
              <button key={item.name} type="button" className={index === presetIndex ? 'active' : ''} onClick={() => choosePreset(index)}>
                <strong>{item.emoji} {item.name}</strong>
                <small>{formatLabel(item.format)} / {item.mode === 'team' ? 'teams' : 'players'}</small>
              </button>
            ))}
          </div>
          <div className="event-form setup-flow">
          <section className="setup-step">
            <header>
              <span>1</span>
              <div>
                <h4>Game and timing</h4>
                <small>Set what appears on the timeline and how it should run.</small>
              </div>
            </header>
            <div className="event-field-grid">
              <label>
                <span>Name</span>
                <input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Game name" />
              </label>
              <label>
                <span>Start time</span>
                <input value={draft.scheduledTime} onChange={(event) => setDraft((current) => ({ ...current, scheduledTime: event.target.value }))} placeholder="19:30 or TBC" inputMode="numeric" />
              </label>
              <label>
                <span>Timeline day</span>
                <select value={draft.unlockDayId} onChange={(event) => setDraft((current) => ({ ...current, unlockDayId: event.target.value }))}>
                  {props.days.map((day) => <option key={day.id} value={day.id}>Show on {day.label}</option>)}
                </select>
              </label>
            </div>
            <SegmentedControl
              value={draft.format}
              options={[
                { value: 'bracket', label: 'Knockout' },
                { value: 'round_robin', label: 'Group stage' },
                { value: 'open_scoreboard', label: 'Scoreboard' },
              ]}
              onChange={setFormat}
              ariaLabel="Format"
            />
            <SegmentedControl
              value={draft.mode}
              options={[
                { value: 'individual', label: 'Players' },
                { value: 'team', label: 'Teams' },
              ]}
              onChange={setMode}
              ariaLabel="Participants"
            />
          </section>

          <section className="setup-step">
            <header>
              <span>2</span>
              <div>
                <h4>Roster and matches</h4>
                <small>{draft.format === 'bracket' ? 'Knockouts keep generating until one finalist wins.' : 'Choose who can appear in this event.'}</small>
              </div>
            </header>
            <div className="match-plan">
              <div>
                <strong>{draft.participantIds.length}</strong>
                <span>{draft.mode === 'team' ? 'teams' : 'players'}</span>
              </div>
              <div>
                <strong>{openingMatchCount}</strong>
                <span>{draft.format === 'open_scoreboard' ? 'score rows' : 'opening matches'}</span>
              </div>
              <div>
                <strong>{draft.gamesPerMatch}</strong>
                <span>{draft.format === 'open_scoreboard' ? 'score pass' : 'games per match'}</span>
              </div>
              <div>
                <strong>{draft.format === 'open_scoreboard' ? '-' : draft.pointTarget}</strong>
                <span>{draft.format === 'open_scoreboard' ? 'open total' : `points, win by ${draft.winBy}`}</span>
              </div>
            </div>
            <div className="event-field-grid compact">
              <label>
                <span>Games per match</span>
                <select value={draft.gamesPerMatch} onChange={(event) => setDraft((current) => ({ ...current, gamesPerMatch: event.target.value }))}>
                  <option value="1">1 game</option>
                  <option value="3">Best of 3</option>
                  <option value="5">Best of 5</option>
                  <option value="7">Best of 7</option>
                </select>
              </label>
              {draft.format !== 'open_scoreboard' ? (
                <>
                  <label>
                    <span>Points to win</span>
                    <input type="number" min="1" value={draft.pointTarget} onChange={(event) => setDraft((current) => ({ ...current, pointTarget: event.target.value }))} />
                  </label>
                  <label>
                    <span>Win by</span>
                    <input type="number" min="1" value={draft.winBy} onChange={(event) => setDraft((current) => ({ ...current, winBy: event.target.value }))} />
                  </label>
                </>
              ) : null}
              {draft.format === 'bracket' ? (
                <label>
                  <span>First-round pairings</span>
                  <select value={draft.pairingMode} onChange={(event) => setDraft((current) => ({ ...current, pairingMode: event.target.value as TournamentPairingMode }))}>
                    <option value="automatic">Automatic</option>
                    <option value="host_defined">Host-defined</option>
                  </select>
                </label>
              ) : null}
            </div>
            <div className="audience-actions">
              <button type="button" className="ghost" onClick={useAllParticipants}>Use all current {draft.mode === 'team' ? 'teams' : 'crew'}</button>
              <button type="button" className="ghost" onClick={clearParticipants}>Choose manually</button>
              <small>{draft.participantIds.length} selected</small>
            </div>
            <div className="participant-picker">
              {participants.map((participant) => (
                <button key={participant.id} type="button" className={draft.participantIds.includes(participant.id) ? 'active' : ''} onClick={() => toggleParticipant(participant.id)}>
                  {'score' in participant ? <PlayerAvatar player={participant} /> : <GroupMark group={participant} />}
                  <span>{participant.name}</span>
                </button>
              ))}
            </div>
            {draft.format === 'bracket' && draft.pairingMode === 'host_defined' ? (
              <div className="manual-pairings">
                <header>
                  <strong>Opening matches</strong>
                  <small>Define round-one matchups; leave a second side empty for a bye.</small>
                </header>
                {manualPairs.map((pair, index) => (
                  <div key={`pair-${index}`} className="manual-pair-row">
                    <span>Match {index + 1}</span>
                    <select value={pair.sideAId} onChange={(event) => updateManualPair(index, 'sideAId', event.target.value)}>
                      <option value="">Side A</option>
                      {draft.participantIds.map((id) => <option key={id} value={id}>{participantLabel(id, props.players, props.groups)}</option>)}
                    </select>
                    <select value={pair.sideBId} onChange={(event) => updateManualPair(index, 'sideBId', event.target.value)}>
                      <option value="">Bye</option>
                      {draft.participantIds.map((id) => <option key={id} value={id}>{participantLabel(id, props.players, props.groups)}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <details className="setup-step scoring-step">
            <summary>
              <span>3</span>
              <div>
                <h4>Leaderboard scoring</h4>
                <small>{draft.scoringMode === 'medals_only' ? 'Medals only' : `${draft.pointsFirst}/${draft.pointsSecond}/${draft.pointsThird} points`}</small>
              </div>
            </summary>
            <div className="scoring-control">
              <label>
                <span>Leaderboard scoring</span>
                <select value={draft.scoringMode} onChange={(event) => setDraft((current) => ({ ...current, scoringMode: event.target.value as TournamentScoringMode }))}>
                  <option value="placement">Placement points</option>
                  <option value="winner_take_all">Winner takes all</option>
                  <option value="participation">Participation points</option>
                  <option value="medals_only">Medals only</option>
                </select>
              </label>
              {draft.scoringMode !== 'medals_only' ? (
                <div className="scoring-grid">
                  <label><span>1st</span><input type="number" min="0" value={draft.pointsFirst} onChange={(event) => setDraft((current) => ({ ...current, pointsFirst: event.target.value }))} /></label>
                  <label><span>2nd</span><input type="number" min="0" value={draft.pointsSecond} onChange={(event) => setDraft((current) => ({ ...current, pointsSecond: event.target.value }))} /></label>
                  <label><span>3rd</span><input type="number" min="0" value={draft.pointsThird} onChange={(event) => setDraft((current) => ({ ...current, pointsThird: event.target.value }))} /></label>
                  <label><span>Everyone else</span><input type="number" min="0" value={draft.pointsParticipation} onChange={(event) => setDraft((current) => ({ ...current, pointsParticipation: event.target.value }))} /></label>
                </div>
              ) : <p className="scoring-note">This game contributes medals but no trip points.</p>}
            </div>
          </details>
          <button type="button" disabled={!draft.name.trim() || draft.participantIds.length < 1} onClick={() => props.onAddEvent(draft)}>Add format</button>
          </div>
        </div>
      </details>
    </section>
  );
}

function LiveFormats(props: {
  events: TournamentEvent[];
  matches: TournamentMatch[];
  allMatches: TournamentMatch[];
  activeEvent: TournamentEvent | null;
  selectedMatchId: string | null;
  players: Player[];
  groups: CrewGroup[];
  activePlayer: Player;
  activeDayId: string;
  days: TripDay[];
  isHost: boolean;
  leaderboard: LeaderboardRow[];
  onSelectEvent: (eventId: string | null) => void;
  onReady: (matchId: string, participantId: string) => void;
  onStartMatch: (matchId: string) => void;
  onScore: (matchId: string, side: 'sideA' | 'sideB', score: number) => void;
  onReport: (matchId: string, winnerId: string) => void;
  onForfeit: (matchId: string, winnerId: string) => void;
}) {
  const visibleEvents = props.events.filter((event) => props.isHost || !event.unlockDayId || event.unlockDayId === props.activeDayId);
  const displayEvent = visibleEvents.find((event) => event.id === props.activeEvent?.id) ?? visibleEvents[0] ?? null;
  const displayMatches = displayEvent ? props.allMatches.filter((match) => match.eventId === displayEvent.id) : [];
  const liveMatches = props.allMatches.filter((match) => match.status === 'live');
  const onDeck = props.allMatches.filter((match) => match.status === 'pending').slice(0, 3);

  return (
    <section className="tournament-live">
      {liveMatches.length || onDeck.length ? (
        <>
          <div className="now-playing-strip">
            <strong>Now playing</strong>
            {liveMatches.length ? liveMatches.map((match) => <MatchPill key={match.id} match={match} players={props.players} groups={props.groups} />) : <small>No live matches yet</small>}
          </div>
          <div className="on-deck-strip">
            <strong>On deck</strong>
            {onDeck.length ? onDeck.map((match) => <MatchPill key={match.id} match={match} players={props.players} groups={props.groups} />) : <small>Ready matches will appear here</small>}
          </div>
        </>
      ) : null}

      {displayEvent ? (
        <div className="event-arena">
          {visibleEvents.length > 1 ? (
            <div className="event-switcher" role="tablist" aria-label="Tournament events">
              {visibleEvents.map((event) => (
                <button key={event.id} type="button" className={event.id === displayEvent.id ? 'active' : ''} onClick={() => props.onSelectEvent(event.id)}>
                  <span>{event.emoji ?? '✦'}</span>
                  <strong>{event.name}</strong>
                  <small>{event.scheduledAt ? formatClock(event.scheduledAt) : formatLabel(event.format)}</small>
                </button>
              ))}
            </div>
          ) : null}
          <header className="tournament-panel-head">
            <div>
              <p className="eyebrow">{formatLabel(displayEvent.format)} / {displayEvent.mode === 'team' ? 'teams' : 'players'}</p>
              <h3>{displayEvent.emoji} {displayEvent.name}</h3>
              <small>{matchRuleLabel(displayEvent)} / {displayEvent.pairingMode === 'host_defined' ? 'host-defined opening matchups' : 'automatic matchups'}</small>
            </div>
            <small>{displayEvent.scheduledAt ? `starts ${formatClock(displayEvent.scheduledAt)}` : displayEvent.status}</small>
          </header>
          {displayEvent.format === 'open_scoreboard' ? (
            <Scoreboard event={displayEvent} matches={displayMatches} players={props.players} groups={props.groups} activePlayer={props.activePlayer} onScore={props.onScore} onReport={props.onReport} isHost={props.isHost} />
          ) : (
            <Bracket matches={displayMatches} event={displayEvent} players={props.players} groups={props.groups} activePlayer={props.activePlayer} isHost={props.isHost} focusedMatchId={props.selectedMatchId} onReady={props.onReady} onStartMatch={props.onStartMatch} onScore={props.onScore} onReport={props.onReport} onForfeit={props.onForfeit} />
          )}
          <Scorecard event={displayEvent} matches={displayMatches} players={props.players} groups={props.groups} />
        </div>
      ) : <p className="empty-note">No published formats for this day yet.</p>}

      <TournamentLeaderboard rows={props.leaderboard} players={props.players} groups={props.groups} />
    </section>
  );
}

function Bracket(props: {
  event: TournamentEvent;
  matches: TournamentMatch[];
  players: Player[];
  groups: CrewGroup[];
  activePlayer: Player;
  isHost: boolean;
  focusedMatchId: string | null;
  onReady: (matchId: string, participantId: string) => void;
  onStartMatch: (matchId: string) => void;
  onScore: (matchId: string, side: 'sideA' | 'sideB', score: number) => void;
  onReport: (matchId: string, winnerId: string) => void;
  onForfeit: (matchId: string, winnerId: string) => void;
}) {
  const rounds = Array.from(new Set(props.matches.map((match) => match.roundIndex))).sort((a, b) => a - b);
  return (
    <div className="bracket-board">
      {rounds.map((round) => (
        <section key={round} className="bracket-round">
          <h4>{props.event.format === 'round_robin' ? `Group round ${round}` : `Round ${round}`}</h4>
          {props.matches.filter((match) => match.roundIndex === round).map((match) => (
            <MatchCard
              key={match.id}
              event={props.event}
              match={match}
              players={props.players}
              groups={props.groups}
              activePlayer={props.activePlayer}
              isHost={props.isHost}
              focused={props.focusedMatchId === match.id}
              onReady={(participantId) => props.onReady(match.id, participantId)}
              onStart={() => props.onStartMatch(match.id)}
              onScore={(side, score) => props.onScore(match.id, side, score)}
              onReport={(winnerId) => props.onReport(match.id, winnerId)}
              onForfeit={(winnerId) => props.onForfeit(match.id, winnerId)}
            />
          ))}
        </section>
      ))}
    </div>
  );
}

function MatchCard(props: {
  event: TournamentEvent;
  match: TournamentMatch;
  players: Player[];
  groups: CrewGroup[];
  activePlayer: Player;
  isHost: boolean;
  focused: boolean;
  onReady: (participantId: string) => void;
  onStart: () => void;
  onScore: (side: 'sideA' | 'sideB', score: number) => void;
  onReport: (winnerId: string) => void;
  onForfeit: (winnerId: string) => void;
}) {
  const sides = getSides(props.match);
  const readyIds = props.match.readyParticipantIds ?? [];
  const activeParticipantId = participantIdForPlayer(props.event, props.match, props.activePlayer);
  const canReady = props.match.status === 'pending' && Boolean(activeParticipantId) && !readyIds.includes(activeParticipantId!);
  const canControl = props.isHost || (Boolean(activeParticipantId) && props.match.status !== 'done');
  return (
    <article className={`match-card ${props.match.status}${props.focused ? ' focused' : ''}`}>
      <div className="match-sides">
        {sides.map((side) => (
          <div key={side.key} className={props.match.winnerId === side.participantId ? 'match-side-row winner' : 'match-side-row'}>
            <button type="button" disabled={!canControl} onClick={() => props.onReport(side.participantId)}>
              <ParticipantName id={side.participantId} players={props.players} groups={props.groups} />
              {readyIds.includes(side.participantId) ? <em>Ready</em> : null}
              {props.match.winnerId === side.participantId ? <Icon name="check" size={14} /> : null}
            </button>
            <ScoreStepper value={side.score} disabled={!canControl} onChange={(score) => props.onScore(side.key, score)} />
          </div>
        ))}
      </div>
      <footer>
        <small>{props.match.status} / {matchRuleLabel(props.event)}</small>
        {canReady ? <button type="button" onClick={() => props.onReady(activeParticipantId!)}>Ready / start</button> : null}
        {props.match.status === 'pending' && activeParticipantId && readyIds.includes(activeParticipantId) ? <small>You're ready</small> : null}
        {props.match.status === 'pending' && props.isHost ? <button type="button" onClick={props.onStart}>Start now</button> : null}
        {props.isHost && sides.length === 2 ? <button type="button" className="ghost" onClick={() => props.onForfeit(sides[0]!.participantId)}>Forfeit</button> : null}
      </footer>
    </article>
  );
}

function Scoreboard(props: {
  event: TournamentEvent;
  matches: TournamentMatch[];
  players: Player[];
  groups: CrewGroup[];
  activePlayer: Player;
  isHost: boolean;
  onScore: (matchId: string, side: 'sideA' | 'sideB', score: number) => void;
  onReport: (matchId: string, winnerId: string) => void;
}) {
  const rows = [...props.matches].sort((a, b) => (b.sideA.score ?? 0) - (a.sideA.score ?? 0) || a.index - b.index);
  return (
    <div className="scoreboard-board">
      {rows.map((match) => (
        <article key={match.id} className="score-row">
          <ParticipantName id={match.sideA.participantId} players={props.players} groups={props.groups} />
          <ScoreStepper
            value={match.sideA.score ?? 0}
            disabled={!props.isHost && (!participantIdForPlayer(props.event, match, props.activePlayer) || match.status === 'done')}
            onChange={(score) => props.onScore(match.id, 'sideA', score)}
          />
          {props.isHost ? <button type="button" onClick={() => props.onReport(match.id, match.sideA.participantId)}>Place</button> : null}
        </article>
      ))}
    </div>
  );
}

function Scorecard(props: { event: TournamentEvent; matches: TournamentMatch[]; players: Player[]; groups: CrewGroup[] }) {
  return (
    <aside className="event-scorecard">
      <header>
        <h4>Scorecard</h4>
        <small>{props.event.format === 'open_scoreboard' ? 'Totals' : `Round by round / ${matchRuleLabel(props.event)}`}</small>
      </header>
      {props.event.format === 'open_scoreboard' ? [...props.matches].sort((a, b) => (b.sideA.score ?? 0) - (a.sideA.score ?? 0)).map((match, index) => (
        <article key={match.id}>
          <b>{index + 1}</b>
          <ParticipantName id={match.sideA.participantId} players={props.players} groups={props.groups} />
          <strong>{match.sideA.score ?? 0}</strong>
        </article>
      )) : Array.from(new Set(props.matches.map((match) => match.roundIndex))).sort((a, b) => a - b).map((round) => (
        <section key={round}>
          <h5>Round {round}</h5>
          {props.matches.filter((match) => match.roundIndex === round).map((match) => (
            <article key={match.id}>
              <ParticipantName id={match.sideA.participantId} players={props.players} groups={props.groups} />
              <strong>{match.sideA.score ?? 0}-{match.sideB.score ?? 0}</strong>
              <ParticipantName id={match.sideB.participantId} players={props.players} groups={props.groups} />
              <small>{match.status}</small>
            </article>
          ))}
        </section>
      ))}
    </aside>
  );
}

function TournamentLeaderboard(props: { rows: LeaderboardRow[]; players: Player[]; groups: CrewGroup[] }) {
  return (
    <aside className="tournament-leaderboard">
      <header>
        <h3>Tournament board</h3>
        <small>Points / medals</small>
      </header>
      {props.rows.length ? props.rows.slice(0, 8).map((row, index) => (
        <article key={row.participantId}>
          <b>{index + 1}</b>
          <ParticipantName id={row.participantId} players={props.players} groups={props.groups} />
          <strong>{row.points}</strong>
          <small>{row.gold}-{row.silver}-{row.bronze}</small>
        </article>
      )) : <p className="empty-note">Results appear as matches finish.</p>}
    </aside>
  );
}

function ScoreStepper(props: { value: number; disabled?: boolean; onChange: (score: number) => void }) {
  const score = Number.isFinite(props.value) ? props.value : 0;
  return (
    <div className="score-stepper">
      <button type="button" disabled={props.disabled || score <= 0} onClick={() => props.onChange(Math.max(0, score - 1))} aria-label="Decrease score">-</button>
      <input type="number" min="0" value={score} disabled={props.disabled} onChange={(event) => props.onChange(Math.max(0, Number(event.target.value) || 0))} aria-label="Score" />
      <button type="button" disabled={props.disabled} onClick={() => props.onChange(score + 1)} aria-label="Increase score">+</button>
    </div>
  );
}

function MatchPill(props: { match: TournamentMatch; players: Player[]; groups: CrewGroup[] }) {
  return (
    <span className="match-pill">
      <ParticipantName id={props.match.sideA.participantId} players={props.players} groups={props.groups} compact />
      <b>{props.match.sideA.score ?? 0}</b>
      <i>vs</i>
      <b>{props.match.sideB.score ?? 0}</b>
      <ParticipantName id={props.match.sideB.participantId} players={props.players} groups={props.groups} compact />
    </span>
  );
}

function ParticipantName(props: { id: string; players: Player[]; groups: CrewGroup[]; compact?: boolean }) {
  if (props.id === '__bye__' || props.id === '__score_entry__') return <span>Bye</span>;
  const player = props.players.find((item) => item.id === props.id);
  if (player) return <span className="participant-name">{props.compact ? null : <PlayerAvatar player={player} />}{player.name}</span>;
  const group = props.groups.find((item) => item.id === props.id);
  return <span className="participant-name">{group && !props.compact ? <GroupMark group={group} /> : null}{group?.name ?? props.id}</span>;
}

function createTournament(props: TournamentProps) {
  const at = Date.now();
  props.onChange((current) => ({
    ...current,
    tournaments: [...current.tournaments, {
      id: newId('tour'),
      name: 'Trip tournament',
      hostId: props.activePlayer.id,
      createdAt: at,
      status: 'setup',
      leaderboardView: 'points',
      updatedAt: at,
      updatedBy: props.deviceId,
    }],
  }));
}

function addEvent(props: TournamentProps, tournamentId: string, order: number, draft: Draft) {
  const at = Date.now();
  props.onChange((current) => ({
    ...current,
    tournamentEvents: [...current.tournamentEvents, {
      id: newId('evt'),
      tournamentId,
      name: draft.name.trim() || 'Game',
      emoji: draft.emoji,
      format: draft.format,
      mode: draft.mode,
      participantIds: draft.participantIds,
      unlockDayId: draft.unlockDayId,
      scheduledAt: scheduledAtForDraft(draft.scheduledTime, draft.unlockDayId, props.days),
      status: 'setup',
      scoringMode: draft.scoringMode,
      gamesPerMatch: Math.max(1, Number(draft.gamesPerMatch) || 1),
      pointTarget: Math.max(1, Number(draft.pointTarget) || 11),
      winBy: Math.max(1, Number(draft.winBy) || 2),
      pairingMode: draft.format === 'bracket' ? draft.pairingMode : 'automatic',
      initialPairings: draft.format === 'bracket' && draft.pairingMode === 'host_defined' ? normalizeManualPairings(draft) : undefined,
      pointsFirst: pointValue(draft.pointsFirst, 10),
      pointsSecond: pointValue(draft.pointsSecond, 7),
      pointsThird: pointValue(draft.pointsThird, 5),
      pointsParticipation: pointValue(draft.pointsParticipation, 1),
      order,
      updatedAt: at,
      updatedBy: props.deviceId,
    }],
  }));
}

function startTournament(props: TournamentProps, tournamentId: string) {
  const at = Date.now();
  props.onChange((current) => {
    const events = current.tournamentEvents.filter((event) => event.tournamentId === tournamentId && event.participantIds.length >= 2);
    const openings = events.flatMap((event) => event.status === 'setup' ? openingMatches(event, props.deviceId, at) : []);
    return {
      ...current,
      tournaments: current.tournaments.map((item) => item.id === tournamentId ? { ...item, status: 'live', startedAt: item.startedAt ?? at, updatedAt: at, updatedBy: props.deviceId } : item),
      tournamentEvents: current.tournamentEvents.map((event) => event.tournamentId === tournamentId && event.participantIds.length >= 2 ? { ...event, status: 'live', updatedAt: at, updatedBy: props.deviceId } : event),
      tournamentMatches: [...current.tournamentMatches, ...openings],
    };
  });
}

function startEvent(props: TournamentProps, eventId: string) {
  const at = Date.now();
  props.onChange((current) => {
    const event = current.tournamentEvents.find((item) => item.id === eventId);
    if (!event) return current;
    const hasMatches = current.tournamentMatches.some((match) => match.eventId === eventId);
    return {
      ...current,
      tournamentEvents: current.tournamentEvents.map((item) => item.id === eventId ? { ...item, status: 'live', updatedAt: at, updatedBy: props.deviceId } : item),
      tournamentMatches: hasMatches ? current.tournamentMatches : [...current.tournamentMatches, ...openingMatches(event, props.deviceId, at)],
    };
  });
}

function readyMatch(props: TournamentProps, matchId: string, participantId: string) {
  const at = Date.now();
  props.onChange((current) => ({
    ...current,
    tournamentMatches: current.tournamentMatches.map((match) => {
      if (match.id !== matchId) return match;
      const event = current.tournamentEvents.find((item) => item.id === match.eventId);
      const localParticipantId = event ? participantIdForPlayer(event, match, props.activePlayer) : null;
      if (props.role !== 'host' && localParticipantId !== participantId) return match;
      const readyParticipantIds = Array.from(new Set([...(match.readyParticipantIds ?? []), participantId]));
      const sides = readySides(match);
      const bothReady = sides.length === 2 && sides.every((id) => readyParticipantIds.includes(id));
      return {
        ...match,
        readyParticipantIds,
        status: bothReady ? 'live' : match.status,
        startedAt: bothReady ? match.startedAt ?? at : match.startedAt,
        updatedAt: at,
        updatedBy: props.deviceId,
      };
    }),
  }));
}

function startMatch(props: TournamentProps, matchId: string) {
  const at = Date.now();
  props.onChange((current) => {
    const match = current.tournamentMatches.find((item) => item.id === matchId);
    const event = current.tournamentEvents.find((item) => item.id === match?.eventId);
    if (!match || !event || !canControlTournamentMatch(props, event, match)) return current;
    return {
      ...current,
      tournamentMatches: current.tournamentMatches.map((item) => item.id === matchId ? { ...item, readyParticipantIds: readySides(item), status: 'live', startedAt: item.startedAt ?? at, updatedAt: at, updatedBy: props.deviceId } : item),
    };
  });
}

function scoreMatch(props: TournamentProps, matchId: string, side: 'sideA' | 'sideB', score: number) {
  const at = Date.now();
  props.onChange((current) => {
    const currentMatch = current.tournamentMatches.find((match) => match.id === matchId);
    const currentEvent = current.tournamentEvents.find((item) => item.id === currentMatch?.eventId);
    if (!currentMatch || !currentEvent || !canControlTournamentMatch(props, currentEvent, currentMatch)) return current;
    let patched = current.tournamentMatches.map((match) => match.id === matchId ? { ...match, [side]: { ...match[side], score }, updatedAt: at, updatedBy: props.deviceId } : match);
    const changedMatch = patched.find((match) => match.id === matchId);
    const event = current.tournamentEvents.find((item) => item.id === changedMatch?.eventId);
    const autoWinner = changedMatch && event ? winnerFromScore(event, changedMatch) : null;
    if (!event || !changedMatch || !autoWinner) return { ...current, tournamentMatches: patched };
    patched = patched.map((match) => match.id === matchId
      ? { ...match, winnerId: autoWinner, status: 'done', finishedAt: at, updatedAt: at, updatedBy: props.deviceId }
      : match);
    const reconciled = reconcileEvent(event, current.tournamentEvents, patched, props.deviceId, at);
    return {
      ...current,
      tournamentEvents: reconciled.events,
      tournamentMatches: reconciled.matches,
    };
  });
}

function reportMatch(props: TournamentProps, matchId: string, winnerId: string, status: 'done' | 'forfeit' = 'done') {
  const at = Date.now();
  props.onChange((current) => {
    const currentMatch = current.tournamentMatches.find((match) => match.id === matchId);
    const currentEvent = current.tournamentEvents.find((item) => item.id === currentMatch?.eventId);
    if (!currentMatch || !currentEvent || !canControlTournamentMatch(props, currentEvent, currentMatch)) return current;
    const patched = current.tournamentMatches.map((match) => match.id === matchId ? { ...match, winnerId, status, finishedAt: at, updatedAt: at, updatedBy: props.deviceId } : match);
    const event = current.tournamentEvents.find((item) => item.id === patched.find((match) => match.id === matchId)?.eventId);
    if (!event) return { ...current, tournamentMatches: patched };
    const reconciled = reconcileEvent(event, current.tournamentEvents, patched, props.deviceId, at);
    return {
      ...current,
      tournamentEvents: reconciled.events,
      tournamentMatches: reconciled.matches,
    };
  });
}

function canControlTournamentMatch(props: TournamentProps, event: TournamentEvent, match: TournamentMatch): boolean {
  if (props.role === 'host') return true;
  if (match.status === 'done') return false;
  return Boolean(participantIdForPlayer(event, match, props.activePlayer));
}

function initialDraft(preset: typeof PRESETS[number], players: Player[], groups: CrewGroup[], days: TripDay[]): Draft {
  const participantIds = (preset.mode === 'team' ? groups : players).map((item) => item.id);
  return {
    name: preset.name,
    emoji: preset.emoji,
    format: preset.format,
    mode: preset.mode,
    unlockDayId: days[0]?.id ?? 'day-1',
    scheduledTime: '',
    scoringMode: 'placement',
    gamesPerMatch: preset.name === 'Ping-pong' ? '3' : '1',
    pointTarget: preset.name === 'Ping-pong' ? '11' : '10',
    winBy: preset.name === 'Ping-pong' ? '2' : '1',
    pairingMode: 'automatic',
    manualPairs: buildManualPairs(participantIds),
    pointsFirst: '10',
    pointsSecond: '7',
    pointsThird: '5',
    pointsParticipation: '1',
    participantIds,
  };
}

function openingMatches(event: TournamentEvent, deviceId: string, at: number): TournamentMatch[] {
  if (event.format === 'open_scoreboard') {
    return event.participantIds.map((participantId, index) => ({
      id: `${event.id}:score:${index}`,
      eventId: event.id,
      roundIndex: 1,
      index,
      kind: 'score_entry',
      sideA: { participantId, score: 0 },
      sideB: { participantId: '__score_entry__', score: 0 },
      status: 'live',
      startedAt: at,
      updatedAt: at,
      updatedBy: deviceId,
    }));
  }
  const pairs = event.format === 'round_robin'
    ? roundRobinPairs(event.participantIds)
    : openingPairsForEvent(event);
  return pairs.map(([sideA, sideB], index) => ({
    id: `${event.id}:r1:m${index}`,
    eventId: event.id,
    roundIndex: 1,
    index,
    kind: 'head_to_head',
    sideA: { participantId: sideA, score: 0 },
    sideB: { participantId: sideB ?? '__bye__', score: 0 },
    status: sideB ? 'pending' : 'done',
    winnerId: sideB ? undefined : sideA,
    finishedAt: sideB ? undefined : at,
    updatedAt: at,
    updatedBy: deviceId,
  }));
}

function reconcileEvent(event: TournamentEvent, events: TournamentEvent[], matches: TournamentMatch[], deviceId: string, at: number) {
  if (event.format === 'open_scoreboard') {
    const placement = [...matches].filter((match) => match.eventId === event.id)
      .sort((a, b) => (b.sideA.score ?? 0) - (a.sideA.score ?? 0) || a.index - b.index)
      .map((match) => match.sideA.participantId);
    return {
      events: events.map((item) => item.id === event.id ? { ...item, placement, updatedAt: at, updatedBy: deviceId } : item),
      matches,
    };
  }
  const eventMatches = matches.filter((match) => match.eventId === event.id);
  const maxRound = Math.max(...eventMatches.map((match) => match.roundIndex), 1);
  const currentRound = eventMatches.filter((match) => match.roundIndex === maxRound);
  if (!currentRound.length || currentRound.some((match) => !match.winnerId)) return { events, matches };
  const winners = currentRound.map((match) => match.winnerId!).filter(Boolean);
  if (event.format === 'round_robin' || winners.length <= 1) {
    const placement = placementFromMatches(event, eventMatches);
    return {
      events: events.map((item) => item.id === event.id ? { ...item, status: 'done' as const, placement, updatedAt: at, updatedBy: deviceId } : item),
      matches,
    };
  }
  const nextRound = maxRound + 1;
  const next = chunkPairs(winners).map(([sideA, sideB], index) => ({
    id: `${event.id}:r${nextRound}:m${index}`,
    eventId: event.id,
    roundIndex: nextRound,
    index,
    kind: 'head_to_head' as const,
    sideA: { participantId: sideA, score: 0 },
    sideB: { participantId: sideB ?? '__bye__', score: 0 },
    status: sideB ? 'pending' as const : 'done' as const,
    winnerId: sideB ? undefined : sideA,
    finishedAt: sideB ? undefined : at,
    updatedAt: at,
    updatedBy: deviceId,
  }));
  const existingIds = new Set(matches.map((match) => match.id));
  return { events, matches: [...matches, ...next.filter((match) => !existingIds.has(match.id))] };
}

function placementFromMatches(event: TournamentEvent, matches: TournamentMatch[]): string[] {
  if (event.format === 'round_robin') {
    const scores = new Map(event.participantIds.map((id) => [id, { wins: 0, diff: 0 }]));
    for (const match of matches) {
      if (!match.winnerId) continue;
      const winner = scores.get(match.winnerId);
      if (winner) winner.wins += 1;
      const diff = (match.sideA.score ?? 0) - (match.sideB.score ?? 0);
      const sideA = scores.get(match.sideA.participantId);
      const sideB = scores.get(match.sideB.participantId);
      if (sideA) sideA.diff += diff;
      if (sideB) sideB.diff -= diff;
    }
    return [...scores.entries()].sort((a, b) => b[1].wins - a[1].wins || b[1].diff - a[1].diff || a[0].localeCompare(b[0])).map(([id]) => id);
  }
  const final = [...matches].filter((match) => match.winnerId).sort((a, b) => b.roundIndex - a.roundIndex)[0];
  const losers = matches.filter((match) => match.winnerId).flatMap((match) => getSides(match).map((side) => side.participantId).filter((id) => id !== match.winnerId));
  return [final?.winnerId, ...losers.reverse(), ...event.participantIds].filter((id, index, all): id is string => Boolean(id) && all.indexOf(id) === index);
}

interface LeaderboardRow {
  participantId: string;
  points: number;
  gold: number;
  silver: number;
  bronze: number;
}

function buildLeaderboard(events: TournamentEvent[], matches: TournamentMatch[]): LeaderboardRow[] {
  const rows = new Map<string, LeaderboardRow>();
  for (const event of events) {
    const placement = event.placement ?? placementFromMatches(event, matches.filter((match) => match.eventId === event.id));
    placement.forEach((participantId, index) => {
      const row = rows.get(participantId) ?? { participantId, points: 0, gold: 0, silver: 0, bronze: 0 };
      row.points += pointsFor(event, index);
      if (index === 0) row.gold += 1;
      if (index === 1) row.silver += 1;
      if (index === 2) row.bronze += 1;
      rows.set(participantId, row);
    });
  }
  return [...rows.values()].sort((a, b) => b.points - a.points || b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze || a.participantId.localeCompare(b.participantId));
}

function pointsFor(event: TournamentEvent, index: number): number {
  const mode = event.scoringMode ?? 'placement';
  if (mode === 'medals_only') return 0;
  if (mode === 'winner_take_all') return index === 0 ? event.pointsFirst ?? 10 : 0;
  if (mode === 'participation') return event.pointsParticipation ?? 1;
  if (index === 0) return event.pointsFirst ?? 10;
  if (index === 1) return event.pointsSecond ?? 7;
  if (index === 2) return event.pointsThird ?? 5;
  return event.pointsParticipation ?? 1;
}

function matchRuleLabel(event: TournamentEvent): string {
  if (event.format === 'open_scoreboard') return 'open score';
  const games = event.gamesPerMatch && event.gamesPerMatch > 1 ? `best of ${event.gamesPerMatch}` : '1 game';
  const target = event.pointTarget ?? 11;
  const winBy = event.winBy ?? 1;
  return `${games}, first to ${target}${winBy > 1 ? ` win by ${winBy}` : ''}`;
}

function matchRuleLabelForDraft(draft: Draft): string {
  if (draft.format === 'open_scoreboard') return 'open score';
  const games = Number(draft.gamesPerMatch) > 1 ? `best of ${draft.gamesPerMatch}` : '1 game';
  const target = Number(draft.pointTarget) || 11;
  const winBy = Number(draft.winBy) || 1;
  return `${games}, first to ${target}${winBy > 1 ? ` win by ${winBy}` : ''}`;
}

function winnerFromScore(event: TournamentEvent, match: TournamentMatch): string | null {
  if (event.format === 'open_scoreboard' || match.kind !== 'head_to_head') return null;
  if (match.sideA.participantId === '__bye__' || match.sideB.participantId === '__bye__') return null;
  const target = event.pointTarget ?? 11;
  const winBy = event.winBy ?? 1;
  const a = match.sideA.score ?? 0;
  const b = match.sideB.score ?? 0;
  if (a >= target && a - b >= winBy) return match.sideA.participantId;
  if (b >= target && b - a >= winBy) return match.sideB.participantId;
  return null;
}

function formatLabel(format: EventFormat): string {
  if (format === 'open_scoreboard') return 'Scoreboard';
  if (format === 'round_robin') return 'Group stage';
  return 'Bracket';
}

function formatClock(value?: number): string {
  if (!value) return 'TBC';
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function scheduledAtForDraft(value: string, dayId: string, days: TripDay[]): number | undefined {
  const trimmed = value.trim();
  if (!trimmed || /^tbc$/i.test(trimmed)) return undefined;
  const match = trimmed.match(/^(\d{1,2})(?::?(\d{2}))?$/);
  if (!match) return undefined;
  const hours = Math.min(23, Number(match[1]));
  const minutes = Math.min(59, Number(match[2] ?? '0'));
  const dayIndex = Math.max(0, days.findIndex((day) => day.id === dayId));
  const date = new Date();
  date.setDate(date.getDate() + dayIndex);
  date.setHours(hours, minutes, 0, 0);
  return date.getTime();
}

function pointValue(value: string, fallback: number): number {
  return Math.max(0, Number(value) || fallback);
}

function buildManualPairs(participantIds: string[], existing: Array<{ sideAId: string; sideBId: string }> = []): Array<{ sideAId: string; sideBId: string }> {
  const pairCount = Math.ceil(participantIds.length / 2);
  return Array.from({ length: pairCount }, (_, index) => {
    const pair = existing[index];
    return {
      sideAId: pair?.sideAId && participantIds.includes(pair.sideAId) ? pair.sideAId : participantIds[index * 2] ?? '',
      sideBId: pair?.sideBId && participantIds.includes(pair.sideBId) ? pair.sideBId : participantIds[index * 2 + 1] ?? '',
    };
  });
}

function normalizeManualPairings(draft: Draft): Array<{ sideAId: string; sideBId?: string }> {
  const used = new Set<string>();
  const pairs: Array<{ sideAId: string; sideBId?: string }> = [];
  for (const pair of buildManualPairs(draft.participantIds, draft.manualPairs)) {
    if (!pair.sideAId || used.has(pair.sideAId)) continue;
    used.add(pair.sideAId);
    const sideBId = pair.sideBId && pair.sideBId !== pair.sideAId && !used.has(pair.sideBId) ? pair.sideBId : undefined;
    if (sideBId) used.add(sideBId);
    pairs.push({ sideAId: pair.sideAId, sideBId });
  }
  for (const id of draft.participantIds) {
    if (used.has(id)) continue;
    const previous = pairs.at(-1);
    if (previous && !previous.sideBId) {
      previous.sideBId = id;
    } else {
      pairs.push({ sideAId: id });
    }
    used.add(id);
  }
  return pairs;
}

function openingPairsForEvent(event: TournamentEvent): Array<[string, string | undefined]> {
  if (event.pairingMode !== 'host_defined' || !event.initialPairings?.length) return chunkPairs(event.participantIds);
  const selected = new Set(event.participantIds);
  const used = new Set<string>();
  const pairs: Array<[string, string | undefined]> = [];
  for (const pair of event.initialPairings) {
    if (!selected.has(pair.sideAId) || used.has(pair.sideAId)) continue;
    used.add(pair.sideAId);
    const sideBId = pair.sideBId && selected.has(pair.sideBId) && pair.sideBId !== pair.sideAId && !used.has(pair.sideBId)
      ? pair.sideBId
      : undefined;
    if (sideBId) used.add(sideBId);
    pairs.push([pair.sideAId, sideBId]);
  }
  return [...pairs, ...chunkPairs(event.participantIds.filter((id) => !used.has(id)))];
}

function chunkPairs(ids: string[]): Array<[string, string | undefined]> {
  const pairs: Array<[string, string | undefined]> = [];
  for (let index = 0; index < ids.length; index += 2) pairs.push([ids[index]!, ids[index + 1]]);
  return pairs;
}

function roundRobinPairs(ids: string[]): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (let a = 0; a < ids.length; a += 1) {
    for (let b = a + 1; b < ids.length; b += 1) pairs.push([ids[a]!, ids[b]!]);
  }
  return pairs;
}

function getSides(match: TournamentMatch): Array<{ key: 'sideA' | 'sideB'; participantId: string; score: number }> {
  return [
    { key: 'sideA' as const, participantId: match.sideA.participantId, score: match.sideA.score ?? 0 },
    { key: 'sideB' as const, participantId: match.sideB.participantId, score: match.sideB.score ?? 0 },
  ].filter((side) => side.participantId !== '__bye__' && side.participantId !== '__score_entry__');
}

function readySides(match: TournamentMatch): string[] {
  return getSides(match).map((side) => side.participantId);
}

function participantIdForPlayer(event: TournamentEvent, match: TournamentMatch, player: Player): string | null {
  const participantId = event.mode === 'team' ? player.groupId : player.id;
  if (!participantId) return null;
  return readySides(match).includes(participantId) ? participantId : null;
}

function participantLabel(id: string, players: Player[], groups: CrewGroup[]): string {
  return players.find((player) => player.id === id)?.name
    ?? groups.find((group) => group.id === id)?.name
    ?? id;
}
