import { useMemo, useState } from 'react';
import type { RoutePack } from '../data/parade-2026';
import type { ParadeAnalyticsEvent } from '../lib/analytics';
import {
  answerTrivia,
  banterFromPack,
  pollOptionLabel,
  selectedOptionId,
  selectedTriviaAttempt,
  voteInPoll,
} from '../lib/banter';
import type { RouteBanterPoll, RouteBanterTrivia } from '../data/parade-2026';
import { getOrCreateSourceId } from '../lib/group-events';
import { hapticConfirm, hapticWow } from '../lib/haptic';
import { showToast } from '../lib/toast';

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
    showToast('Vote saved on this phone.', 'success');
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
    if (attempt.correct) {
      hapticWow();
      showToast('Correct. Saved on this phone.', 'success');
    } else {
      hapticConfirm();
      showToast('Saved. The answer is revealed below.');
    }
  };

  const activeTrivia = banter.trivia?.[activeTriviaIndex] ?? null;

  return (
    <section className="screen banter-hub" aria-label="Parade banter">
      <div className="banter-intro">
        <p className="eyebrow">Banter</p>
        <h1>Sing, vote, quiz.</h1>
        <p>Quick chants, local votes and offline season cards for queues and train rides.</p>
      </div>

      <div className="panel banter-card banter-card--chants">
        <div className="banter-card__head">
          <h2>Chants</h2>
          <span>{banter.chants.length} cards</span>
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
                {open ? <span className="chant-row__detail">{chant.detail}</span> : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="panel banter-card">
        <div className="banter-card__head">
          <h2>Votes</h2>
          <span>as #{supporterTag}</span>
        </div>
        <div className="poll-list" data-version={voteVersion}>
          {banter.polls.map((poll) => {
            const selected = selectedOptionId(poll.id);
            const selectedOtherLabel =
              poll.otherOptions?.some((option) => option.id === selected)
                ? pollOptionLabel(poll, selected)
                : null;
            return (
              <div className="poll-block" key={poll.id}>
                <h3>{poll.question}</h3>
                <div className="poll-options">
                  {poll.options.map((option) => {
                    const active = selected === option.id || (option.id === 'other' && Boolean(selectedOtherLabel));
                    return (
                      <button
                        type="button"
                        key={option.id}
                        className={`poll-option ${active ? 'is-selected' : ''}`}
                        aria-pressed={active}
                        aria-expanded={option.id === 'other' && poll.otherOptions?.length ? openOtherPollId === poll.id : undefined}
                        onClick={() => onPollOption(poll, option.id)}
                      >
                        <span className="poll-option__label">{option.label}</span>
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
                    {poll.otherOptions.map((option) => (
                      <button
                        type="button"
                        key={option.id}
                        className={`poll-other-option ${selected === option.id ? 'is-selected' : ''}`}
                        aria-pressed={selected === option.id}
                        onClick={() => {
                          onVote(poll, option.id);
                          setOpenOtherPollId(null);
                        }}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
          <p className="poll-footnote">
            Saved as {displayName} #{supporterTag}. Group counts arrive when the relay ships.
          </p>
        </div>
      </div>

      <div className="panel banter-card banter-card--trivia" data-version={triviaVersion}>
        <div className="banter-card__head">
          <h2>Season quiz</h2>
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
          const correct = option.id === trivia.answerId;
          return (
            <button
              type="button"
              key={option.id}
              className={[
                'trivia-option',
                picked ? 'is-picked' : '',
                revealed && correct ? 'is-correct' : '',
                revealed && picked && !correct ? 'is-wrong' : '',
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
        <p className={`trivia-result ${attempt.correct ? 'is-correct' : 'is-wrong'}`}>
          {attempt.correct ? 'Correct.' : 'Not that one.'} {trivia.explainer}
        </p>
      ) : (
        <p className="trivia-result">Tap once for instant results. Works fully offline.</p>
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
