import { useMemo, useState } from 'react';
import { OPENING_FIXTURE, fixtureTitle, teamByCode } from '../data/tournament.ts';
import { FantasyLeaguePanel } from '../fantasy/FantasyLeaguePanel.tsx';
import type { Copy, Locale } from '../i18n.ts';
import { cityTreatmentClass } from '../lib/city-flavor.ts';
import { formatKickoff } from '../lib/time-zone.ts';
import { provenanceLabel } from '../shared/live-scores-client.ts';
import { readPredictionReceipts, savePredictionReceipt, type PredictionReceipt, type SavedRoom, type UserProfile } from '../shared/local-store.ts';
import { useOpeningLiveScore } from '../shared/use-live-score.ts';
import { useMatchdayRoom } from '../shared/use-matchday-room.ts';
import type { RoomTemplate } from '../shared/types.ts';
import { CityPaperAtlas } from '../ui/CityPaperAtlas.tsx';
import { CommentaryRoom } from '../ui/CommentaryRoom.tsx';
import { ShareCardButton } from '../ui/ShareCardButton.tsx';
import { TeamFollowPanel } from '../ui/TeamFollowPanel.tsx';
import { ProfileSettings } from '../ui/ProfileSettings.tsx';
import { TournamentStructure } from '../ui/TournamentStructure.tsx';
import { InstallPanel } from '../ui/InstallPanel.tsx';
import { BanterPanel } from './BanterPanel.tsx';
import { ChoiceBallot } from './ballots/ChoiceBallot.tsx';
import { RatingBallot } from './ballots/RatingBallot.tsx';
import { ScorePredictBallot } from './ballots/ScorePredictBallot.tsx';
import { ShoutoutForm } from './ShoutoutForm.tsx';
import { SweepstakePanel } from './SweepstakePanel.tsx';
import { TriviaPanel } from './TriviaPanel.tsx';
import { WallChart } from './WallChart.tsx';
import { MatchProgramme } from '../ui/MatchProgramme.tsx';

export function GuestMatchday(props: {
  roomId: string;
  roomKey: string;
  signalBase: string;
  peerId: string;
  template: RoomTemplate;
  copy: Copy;
  locale: Locale;
  timeZone: string;
  onTimeZoneChange: (timeZone: string) => void;
  profile: UserProfile;
  onProfileChange: (profile: Partial<Omit<UserProfile, 'updatedAt'>>) => void;
  onLocaleChange: (locale: Locale) => void;
  savedRooms: SavedRoom[];
  onRoomsChange: (rooms: SavedRoom[]) => void;
}) {
  const room = useMatchdayRoom(props);
  const [receipts, setReceipts] = useState<PredictionReceipt[]>(() => readPredictionReceipts());
  const openPolls = useMemo(() => {
    const seen = new Set<string>();
    return room.polls.filter((poll) => Date.now() <= poll.closesAt).filter((poll) => {
      const key = `${poll.kind}:${poll.question}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [room.polls]);
  const openScorePolls = useMemo(() => {
    const seen = new Set<string>();
    return room.scorePolls.filter((poll) => Date.now() <= poll.closesAt).filter((poll) => {
      const key = `${poll.matchId ?? 'match'}:${poll.question}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [room.scorePolls]);
  const latestApproved = useMemo(() => room.approvedShoutouts[0], [room.approvedShoutouts]);
  const liveScore = useOpeningLiveScore();
  const home = teamByCode(OPENING_FIXTURE.home);
  const away = teamByCode(OPENING_FIXTURE.away);
  const latestReceipt = receipts[0] ?? null;

  return (
    <main className="matchday guest-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">{props.copy.guestEyebrow}</p>
          <h1>{props.copy.guestTitle}</h1>
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
      {latestApproved ? (
        <section className="screen-strip">
          <span>On screen</span>
          <strong>{latestApproved.text}</strong>
        </section>
      ) : null}

      <section className="next-action-card guest-priority-action">
        <div>
          <span>{openPolls.length + openScorePolls.length ? 'play now' : 'waiting room'}</span>
          <strong>{openPolls.length + openScorePolls.length ? 'Your room has a moment open' : 'Nothing open yet'}</strong>
          <p>{openPolls.length + openScorePolls.length ? 'Vote, predict, then turn the result into a receipt.' : 'Check the tournament while the host opens the next pick, vote, or quiz.'}</p>
        </div>
        {openPolls.length + openScorePolls.length ? (
          <button className="primary-action" onClick={() => document.querySelector('.ballot-stack')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Play now</button>
        ) : (
          <button onClick={() => document.querySelector('.tournament-hub')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Explore tournament</button>
        )}
      </section>

      <section className={`guest-match-card ${cityTreatmentClass(OPENING_FIXTURE.cityCode)}`.trim()}>
        <p className="eyebrow">Opening match</p>
        <h2>{fixtureTitle(OPENING_FIXTURE)}</h2>
        <div className="match-card-teams compact">
          <span>{home.code}</span>
          <strong>v</strong>
          <span>{away.code}</span>
        </div>
        <div className="score-provenance">
          <strong>{liveScore.scoreHome ?? '–'}-{liveScore.scoreAway ?? '–'}</strong>
          <span>{provenanceLabel(liveScore.provenance)}</span>
        </div>
        <p className="muted">{OPENING_FIXTURE.venue}, {OPENING_FIXTURE.city} · {formatKickoff(OPENING_FIXTURE.kickoff, props.timeZone, props.locale)}</p>
      </section>

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

      <section className="ballot-stack">
        {openPolls.map((poll) => {
          const tally = room.tallies.find((item) => item.pollId === poll.id);
          if (poll.kind === 'choice') {
            return (
              <ChoiceBallot
                key={poll.id}
                poll={poll}
                tally={tally}
                disabled={room.status.connection !== 'open'}
                onVote={(value) => void room.voteCrowd(poll, value)}
              />
            );
          }
          return (
            <RatingBallot
              key={poll.id}
              poll={poll}
              tally={tally}
              disabled={room.status.connection !== 'open'}
              onVote={(value) => void room.voteCrowd(poll, value)}
            />
          );
        })}
        {openScorePolls.map((poll) => (
          <ScorePredictBallot
            key={poll.id}
            poll={poll}
            tally={room.scoreTallies.find((item) => item.pollId === poll.id)}
            disabled={room.status.connection !== 'open'}
            onVote={(home, away) => {
              void room.voteScore(poll, home, away);
              const receipt = savePredictionReceipt({
                matchId: poll.matchId ?? OPENING_FIXTURE.id,
                matchTitle: poll.question.replace(' exact score', ''),
                home,
                away,
              });
              setReceipts((current) => [receipt, ...current.filter((item) => item.matchId !== receipt.matchId)]);
            }}
          />
        ))}
        {openPolls.length === 0 && openScorePolls.length === 0 ? (
          <section className="empty-state">
            <p>{props.copy.waitingMoment}</p>
          </section>
        ) : null}
      </section>

      {latestReceipt ? (
        <section className="receipt-strip">
          <span>Latest receipt</span>
          <strong>{latestReceipt.matchTitle} · {latestReceipt.home}-{latestReceipt.away}</strong>
          <ShareCardButton provenance={provenanceLabel(liveScore.provenance)} profile={props.profile} prediction={`${latestReceipt.matchTitle} ${latestReceipt.home}-${latestReceipt.away}`} moment="Prediction receipt" />
        </section>
      ) : null}

      <details className="simple-drawer">
        <summary>
          <span>Room chat</span>
          <strong>Banter and commentary</strong>
        </summary>
        <BanterPanel template={props.template} disabled={room.status.connection !== 'open'} onPrompt={room.submitShoutout} />
        <CommentaryRoom />
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
            <span>Poster mode</span>
            <strong>Wall chart and fixtures</strong>
          </summary>
          <WallChart locale={props.locale} timeZone={props.timeZone} />
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
      <div className="room-management-stack">
        <SweepstakePanel />
        <details className="simple-drawer">
          <summary>
            <span>Screen message</span>
            <strong>Send a shoutout</strong>
          </summary>
          <ShoutoutForm disabled={room.status.connection !== 'open'} onSubmit={room.submitShoutout} />
        </details>
        <details className="simple-drawer">
          <summary>
            <span>App setup</span>
            <strong>Install Match Room</strong>
          </summary>
          <InstallPanel />
        </details>
      </div>
    </main>
  );
}

function StatusPill(props: { status: string; peers: number; copy: Copy }) {
  const label = guestStatusLabel(props.status, props.peers, props.copy);
  return (
    <div className={`status-pill ${props.status}`}>
      <span />
      {label}
    </div>
  );
}

function guestStatusLabel(status: string, peers: number, copy: Copy): string {
  if (status === 'open') return peers > 0 ? copy.nearbyPeers(peers) : 'Room ready';
  if (status === 'connecting') return 'Joining secure room';
  if (status === 'closed') return 'Room offline';
  return status;
}
