import { useEffect, useMemo, useRef, useState } from 'react';
import type { RoutePack } from '../data/parade-2026';
import type { ParadeAnalyticsEvent } from '../lib/analytics';
import {
  answerTrivia,
  banterFromPack,
  listBanterVotes,
  pollOptionLabel,
  selectedOptionId,
  selectedTriviaAttempt,
  voteInPoll,
} from '../lib/banter';
import type { RouteBanterPoll, RouteBanterTrivia } from '../data/parade-2026';
import {
  mergeLocalVoteIntoAggregate,
  publishBanterPulse,
  pullBanterPulse,
  type BanterPollAggregate,
} from '../lib/banter-sync';
import { getOrCreateSourceId } from '../lib/group-events';
import { hapticConfirm, hapticWow } from '../lib/haptic';
import { showToast } from '../lib/toast';

type BanterPulseState = 'offline' | 'syncing' | 'live' | 'quiet';

interface BanterScreenProps {
  pack: RoutePack;
  displayName: string;
  supporterTag: string;
  onTrack: (event: ParadeAnalyticsEvent, props?: Record<string, string | number | boolean | null>) => void;
}

export function BanterScreen({ pack, displayName, supporterTag, onTrack }: BanterScreenProps) {
  const banter = useMemo(() => banterFromPack(pack), [pack]);
  const [openChantId, setOpenChantId] = useState<string | null>(null);
  const [voteVersion, setVoteVersion] = useState(0);
  const [openOtherPollId, setOpenOtherPollId] = useState<string | null>(null);
  const [triviaVersion, setTriviaVersion] = useState(0);
  const [activeTriviaIndex, setActiveTriviaIndex] = useState(0);
  const [pollAggregates, setPollAggregates] = useState<BanterPollAggregate[]>([]);
  const [pulseState, setPulseState] = useState<BanterPulseState>('quiet');
  const [lastPulseAt, setLastPulseAt] = useState<string | null>(null);
  const lastPublishedVotes = useRef('');

  const moodPoll = useMemo(() => banter.polls.find((poll) => poll.id === 'parade-mood') ?? null, [banter.polls]);
  const paradePolls = useMemo(() => banter.polls.filter((poll) => poll.id !== 'parade-mood'), [banter.polls]);
  const aggregateByPoll = useMemo(() => new Map(pollAggregates.map((aggregate) => [aggregate.pollId, aggregate])), [pollAggregates]);

  useEffect(() => {
    if (banter.polls.length === 0) return undefined;
    let cancelled = false;

    const sync = async () => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        if (!cancelled) setPulseState('offline');
        return;
      }
      if (!cancelled) setPulseState('syncing');
      try {
        const votes = listBanterVotes();
        const signature = votes
          .map((vote) => `${vote.pollId}:${vote.optionId}:${vote.updatedAt}`)
          .sort()
          .join('|');
        if (signature && signature !== lastPublishedVotes.current) {
          const published = await publishBanterPulse(votes, banter.polls);
          if (published > 0) lastPublishedVotes.current = signature;
        }
        const next = await pullBanterPulse(banter.polls);
        if (cancelled) return;
        setPollAggregates(next);
        setLastPulseAt(new Date().toISOString());
        setPulseState('live');
      } catch {
        if (!cancelled) setPulseState('quiet');
      }
    };

    sync();
    const interval = window.setInterval(sync, 25_000);
    window.addEventListener('online', sync);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('online', sync);
    };
  }, [banter.polls, voteVersion]);

  const onChantToggle = (id: string) => {
    setOpenChantId((current) => {
      const next = current === id ? null : id;
      if (next) onTrack('parade_banter_chant_opened', { chant_id: next });
      return next;
    });
    hapticConfirm();
  };

  const onVote = (poll: RouteBanterPoll, optionId: string) => {
    const saved = voteInPoll(poll, optionId, {
      sourceId: getOrCreateSourceId(),
      displayName,
      supporterTag,
    });
    if (!saved) return;
    setVoteVersion((current) => current + 1);
    onTrack('parade_banter_poll_voted', { poll_id: poll.id, option_id: optionId });
    hapticConfirm();
    showToast('Vote saved. It joins the live count when signal appears.', 'success');
  };

  const onPollOption = (poll: RouteBanterPoll, optionId: string) => {
    if (optionId === 'other' && poll.otherOptions?.length) {
      setOpenOtherPollId((current) => (current === poll.id ? null : poll.id));
      hapticConfirm();
      return;
    }
    onVote(poll, optionId);
    setOpenOtherPollId(null);
  };

  const onTriviaAnswer = (trivia: RouteBanterTrivia, optionId: string) => {
    const attempt = answerTrivia(trivia, optionId);
    if (!attempt) return;
    setTriviaVersion((current) => current + 1);
    onTrack('parade_banter_trivia_answered', {
      trivia_id: trivia.id,
      option_id: optionId,
      correct: attempt.correct,
    });
    if (attempt.correct === true) {
      hapticWow();
      showToast('Correct. Saved on this phone.', 'success');
    } else if (attempt.correct === false) {
      hapticConfirm();
      showToast('Saved. The answer is revealed below.');
    } else {
      hapticConfirm();
      showToast('Pick saved for the debate.', 'success');
    }
  };

  const activeTrivia = banter.trivia?.[activeTriviaIndex] ?? null;

  return (
    <section className="screen banter-hub" aria-label="Parade banter">
      <div className="banter-intro">
        <p className="eyebrow">Banter</p>
        <h1>Chants, pulse, debate.</h1>
        <p>Chants stay offline. Fixed-choice polls sync when the crowd gets even a little signal.</p>
      </div>

      <div className="panel banter-card banter-card--chants">
        <div className="banter-card__head">
          <h2>Chant library</h2>
          <span>{banter.chants.length} saved</span>
        </div>
        <div className="chant-list">
          {banter.chants.map((chant) => {
            const open = openChantId === chant.id;
            return (
              <button
                type="button"
                className={`chant-row ${open ? 'is-open' : ''}`}
                key={chant.id}
                aria-expanded={open}
                onClick={() => onChantToggle(chant.id)}
              >
                <span className="chant-row__title">{chant.title}</span>
                <span className="chant-row__cue">{chant.cue}</span>
                {open ? (
                  <span className="chant-row__detail">
                    <span className="chant-row__words-label">Words to say</span>
                    {chant.detail}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {moodPoll ? (
        <div className="panel banter-card banter-card--pulse">
          <div className="banter-card__head">
            <h2>Parade pulse</h2>
            <span>{pulseLabel(pulseState, lastPulseAt)}</span>
          </div>
          <PollBlock
            poll={moodPoll}
            aggregate={aggregateByPoll.get(moodPoll.id) ?? null}
            selected={selectedOptionId(moodPoll.id)}
            openOtherPollId={openOtherPollId}
            onPollOption={onPollOption}
            onOtherVote={(optionId) => {
              onVote(moodPoll, optionId);
              setOpenOtherPollId(null);
            }}
          />
          <p className="poll-footnote">Anonymous fixed choices only. No names, messages or write-ins go public.</p>
        </div>
      ) : null}

      <div className="panel banter-card">
        <div className="banter-card__head">
          <h2>Live polls</h2>
          <span>{pulseLabel(pulseState, lastPulseAt)}</span>
        </div>
        <div className="poll-list" data-version={voteVersion}>
          {paradePolls.map((poll) => {
            const selected = selectedOptionId(poll.id);
            return (
              <PollBlock
                key={poll.id}
                poll={poll}
                aggregate={aggregateByPoll.get(poll.id) ?? null}
                selected={selected}
                openOtherPollId={openOtherPollId}
                onPollOption={onPollOption}
                onOtherVote={(optionId) => {
                  onVote(poll, optionId);
                  setOpenOtherPollId(null);
                }}
              />
            );
          })}
          <p className="poll-footnote">
            Saved as {displayName} #{supporterTag}. Public counts are anonymous and fixed-choice only.
          </p>
        </div>
      </div>

      <div className="panel banter-card banter-card--trivia" data-version={triviaVersion}>
        <div className="banter-card__head">
          <h2>Season debate</h2>
          <span>{activeTrivia ? `${activeTriviaIndex + 1}/${banter.trivia?.length ?? 0}` : 'offline'}</span>
        </div>
        {activeTrivia ? (
          <TriviaCard
            trivia={activeTrivia}
            attempt={selectedTriviaAttempt(activeTrivia.id)}
            onAnswer={(optionId) => onTriviaAnswer(activeTrivia, optionId)}
            onPrevious={() => setActiveTriviaIndex((index) => (index === 0 ? (banter.trivia?.length ?? 1) - 1 : index - 1))}
            onNext={() => setActiveTriviaIndex((index) => (index + 1) % Math.max(1, banter.trivia?.length ?? 1))}
          />
        ) : (
          <p className="poll-footnote">Trivia cards arrive with the route pack.</p>
        )}
      </div>
    </section>
  );
}

function PollBlock({
  poll,
  aggregate,
  selected,
  openOtherPollId,
  onPollOption,
  onOtherVote,
}: {
  poll: RouteBanterPoll;
  aggregate: BanterPollAggregate | null;
  selected: string | null;
  openOtherPollId: string | null;
  onPollOption: (poll: RouteBanterPoll, optionId: string) => void;
  onOtherVote: (optionId: string) => void;
}) {
  const selectedOtherLabel =
    poll.otherOptions?.some((option) => option.id === selected)
      ? pollOptionLabel(poll, selected)
      : null;
  const hasRelayCounts = Boolean(aggregate && aggregate.total > 0);
  const stats = hasRelayCounts
    ? mergeLocalVoteIntoAggregate(poll, aggregate, selected)
    : { pollId: poll.id, total: 0, options: {}, updatedAt: aggregate?.updatedAt ?? null };
  return (
    <div className="poll-block">
      <h3>{poll.question}</h3>
      <div className="poll-options">
        {poll.options.map((option) => {
          const active = selected === option.id || (option.id === 'other' && Boolean(selectedOtherLabel));
          const count = optionCount(poll, stats, option.id);
          const percent = hasRelayCounts && stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
          return (
            <button
              type="button"
              key={option.id}
              className={`poll-option ${active ? 'is-selected' : ''}`}
              aria-pressed={active}
              aria-expanded={option.id === 'other' && poll.otherOptions?.length ? openOtherPollId === poll.id : undefined}
              onClick={() => onPollOption(poll, option.id)}
            >
              <span className="poll-option__fill" style={{ transform: `scaleX(${Math.max(0, Math.min(100, percent)) / 100})` }} />
              <span className="poll-option__label">{option.label}</span>
              <span className="poll-option__meta">{hasRelayCounts && count > 0 ? `${percent}% · ${count}` : active ? '' : '—'}</span>
              {active ? (
                <span className="poll-option__pick">
                  {selectedOtherLabel ? selectedOtherLabel : 'Your pick'}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {openOtherPollId === poll.id && poll.otherOptions?.length ? (
        <div className="poll-other-grid" aria-label={`${poll.question} other Arsenal players`}>
          {poll.otherOptions.map((option) => {
            const count = stats.options[option.id] ?? 0;
            const percent = hasRelayCounts && stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
            return (
              <button
                type="button"
                key={option.id}
                className={`poll-other-option ${selected === option.id ? 'is-selected' : ''}`}
                aria-pressed={selected === option.id}
                onClick={() => onOtherVote(option.id)}
              >
                <span>{option.label}</span>
                <small>{hasRelayCounts && count > 0 ? `${percent}% · ${count}` : selected === option.id ? 'Your pick' : '—'}</small>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function TriviaCard({
  trivia,
  attempt,
  onAnswer,
  onPrevious,
  onNext,
}: {
  trivia: RouteBanterTrivia;
  attempt: ReturnType<typeof selectedTriviaAttempt>;
  onAnswer: (optionId: string) => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <div className="trivia-card">
      <p className="trivia-card__source">{trivia.source}</p>
      <h3>{trivia.question}</h3>
      <div className="trivia-options">
        {trivia.options.map((option) => {
          const picked = attempt?.optionId === option.id;
          const revealed = Boolean(attempt);
          const hasAnswer = Boolean(trivia.answerId);
          const correct = hasAnswer && option.id === trivia.answerId;
          return (
            <button
              type="button"
              key={option.id}
              className={[
                'trivia-option',
                picked ? 'is-picked' : '',
                revealed && correct ? 'is-correct' : '',
                revealed && picked && hasAnswer && !correct ? 'is-wrong' : '',
              ].filter(Boolean).join(' ')}
              aria-pressed={picked}
              onClick={() => onAnswer(option.id)}
            >
              <strong>{option.label}</strong>
              {option.detail ? <span>{option.detail}</span> : null}
            </button>
          );
        })}
      </div>
      {attempt ? (
        <p className={`trivia-result ${attempt.correct === true ? 'is-correct' : attempt.correct === false ? 'is-wrong' : ''}`}>
          {attempt.correct === true
            ? 'Correct. '
            : attempt.correct === false
              ? 'Not that one. '
              : 'Your pick is saved. '}
          {trivia.explainer}
        </p>
      ) : (
        <p className="trivia-result">Tap once. Your pick saves offline; there is no right answer on debate cards.</p>
      )}
      <div className="trivia-actions">
        <button type="button" className="secondary-action" onClick={onPrevious}>
          Previous
        </button>
        <button type="button" className="secondary-action" onClick={onNext}>
          Next card
        </button>
      </div>
    </div>
  );
}

function optionCount(poll: RouteBanterPoll, aggregate: BanterPollAggregate, optionId: string): number {
  if (optionId !== 'other') return aggregate.options[optionId] ?? 0;
  return [
    aggregate.options.other ?? 0,
    ...(poll.otherOptions ?? []).map((option) => aggregate.options[option.id] ?? 0),
  ].reduce((sum, count) => sum + count, 0);
}

function pulseLabel(state: BanterPulseState, lastPulseAt: string | null): string {
  if (state === 'syncing') return 'syncing';
  if (state === 'offline') return 'offline';
  if (state === 'live') return lastPulseAt ? 'live now' : 'live';
  return 'saved';
}
