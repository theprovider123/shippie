import { useMemo, useState } from 'react';
import { OPENING_FIXTURE, fixtureTitle, teamByCode } from '../data/tournament.ts';
import type { Copy, Locale } from '../i18n.ts';
import { formatKickoff } from '../lib/time-zone.ts';
import { provenanceLabel } from '../shared/live-scores-client.ts';
import { readPredictionReceipts, savePredictionReceipt, type PredictionReceipt, type SavedRoom, type UserProfile } from '../shared/local-store.ts';
import { useOpeningLiveScore } from '../shared/use-live-score.ts';
import { useMatchdayRoom } from '../shared/use-matchday-room.ts';
import type { RoomTemplate } from '../shared/types.ts';
import { MatchGuide } from '../ui/MatchGuide.tsx';
import { ProfileSettings } from '../ui/ProfileSettings.tsx';
import { RoomFeed } from '../ui/RoomFeed.tsx';
import { ShareCardButton } from '../ui/ShareCardButton.tsx';
import { ChoiceBallot } from './ballots/ChoiceBallot.tsx';
import { RatingBallot } from './ballots/RatingBallot.tsx';
import { ScorePredictBallot } from './ballots/ScorePredictBallot.tsx';

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
    return room.polls.filter((poll) => Date.now() < poll.closesAt).filter((poll) => {
      const key = `${poll.kind}:${poll.question}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [room.polls]);
  const openScorePolls = useMemo(() => {
    const seen = new Set<string>();
    return room.scorePolls.filter((poll) => Date.now() < poll.closesAt).filter((poll) => {
      const key = `${poll.matchId ?? 'match'}:${poll.question}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [room.scorePolls]);
  const liveScore = useOpeningLiveScore();
  const home = teamByCode(OPENING_FIXTURE.home);
  const away = teamByCode(OPENING_FIXTURE.away);
  const latestReceipt = receipts[0] ?? null;
  const activeCount = openPolls.length + openScorePolls.length;

  const shareThisRoom = async () => {
    if (navigator.share) {
      await navigator.share({ title: 'Join this Match Room', text: 'World Cup room on Shippie.', url: window.location.href }).catch(() => undefined);
      return;
    }
    await navigator.clipboard?.writeText(window.location.href).catch(() => undefined);
  };

  return (
    <main className="match-room guest">
      <header className="room-topbar">
        <div>
          <p className="eyebrow">Play</p>
          <h1>Match Room</h1>
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

      <div className="room-workspace guest-workspace">
        <section className="room-main">
          <MatchHeader home={home} away={away} liveScore={liveScore} timeZone={props.timeZone} locale={props.locale} />

          <section className={activeCount ? 'guest-next active' : 'guest-next'}>
            <div>
              <span>{activeCount ? 'Make your pick' : 'Room ready'}</span>
              <h2>{activeCount ? 'A prediction is open' : 'Waiting for the first prediction'}</h2>
              <p>{activeCount ? 'Pick once, then watch the room change.' : 'Check the kickoff, city notes, and chat while the host starts something.'}</p>
            </div>
            <button type="button" onClick={() => activeCount ? document.querySelector('.ballot-stack')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) : void shareThisRoom()}>
              {activeCount ? 'Make pick' : 'Invite someone'}
            </button>
          </section>

          <MatchGuide locale={props.locale} timeZone={props.timeZone} />

          <section className="ballot-stack">
            {openPolls.map((poll) => {
              const tally = room.tallies.find((item) => item.pollId === poll.id);
              if (poll.kind === 'choice') {
                return (
                  <ChoiceBallot
                    key={poll.id}
                    poll={poll}
                    tally={tally}
                    disabled={false}
                    onVote={(value) => void room.voteCrowd(poll, value)}
                  />
                );
              }
              return (
                <RatingBallot
                  key={poll.id}
                  poll={poll}
                  tally={tally}
                  disabled={false}
                  onVote={(value) => void room.voteCrowd(poll, value)}
                />
              );
            })}
            {openScorePolls.map((poll) => (
              <ScorePredictBallot
                key={poll.id}
                poll={poll}
                tally={room.scoreTallies.find((item) => item.pollId === poll.id)}
                disabled={false}
                onVote={(homeScore, awayScore) => {
                  void room.voteScore(poll, homeScore, awayScore);
                  const receipt = savePredictionReceipt({
                    matchId: poll.matchId ?? OPENING_FIXTURE.id,
                    matchTitle: fixtureTitle(OPENING_FIXTURE),
                    home: homeScore,
                    away: awayScore,
                  });
                  setReceipts((current) => [receipt, ...current.filter((item) => item.matchId !== receipt.matchId)]);
                }}
              />
            ))}
          </section>

          {latestReceipt ? (
            <section className="receipt-strip">
              <div>
                <span>Your pick</span>
                <strong>{latestReceipt.matchTitle} · {latestReceipt.home}-{latestReceipt.away}</strong>
              </div>
              <ShareCardButton provenance={provenanceLabel(liveScore.provenance)} profile={props.profile} prediction={`${latestReceipt.matchTitle} ${latestReceipt.home}-${latestReceipt.away}`} moment="Prediction" />
            </section>
          ) : null}

          <RoomFeed
            title="Room chat"
            disabled={false}
            approved={room.approvedShoutouts}
            pending={room.pendingShoutouts}
            onSubmit={room.submitShoutout}
          />
        </section>
      </div>

      <nav className="room-bottom-bar" aria-label="Room actions">
        <button className="primary-action" onClick={() => document.querySelector('.ballot-stack')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Make pick</button>
        <button onClick={() => void shareThisRoom()}>Share</button>
      </nav>
    </main>
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

function StatusPill(props: { status: string; peers: number; copy: Copy }) {
  const label = props.status === 'open'
    ? props.peers > 0 ? props.copy.nearbyPeers(props.peers) : 'Room ready'
    : props.status === 'connecting'
      ? 'Joined locally'
      : 'Room offline';
  return (
    <div className={`status-pill ${props.status}`}>
      <span />
      {label}
    </div>
  );
}
