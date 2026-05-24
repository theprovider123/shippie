import { useMemo, useState } from 'react';
import type { RoutePack } from '../data/parade-2026';
import type { ParadeAnalyticsEvent } from '../lib/analytics';
import {
  banterFromPack,
  CHEER_TILES,
  listCheerCounts,
  pollOptionLabel,
  resetCheerCounts,
  selectedOptionId,
  tapCheer,
  voteInPoll,
  type CheerId,
} from '../lib/banter';
import type { RouteBanterPoll } from '../data/parade-2026';
import { hapticConfirm, hapticWow } from '../lib/haptic';
import { showToast } from '../lib/toast';

interface BanterScreenProps {
  pack: RoutePack;
  onTrack: (event: ParadeAnalyticsEvent, props?: Record<string, string | number | boolean | null>) => void;
}

export function BanterScreen({ pack, onTrack }: BanterScreenProps) {
  const banter = useMemo(() => banterFromPack(pack), [pack]);
  const [openChantId, setOpenChantId] = useState<string | null>(null);
  const [voteVersion, setVoteVersion] = useState(0);
  const [openOtherPollId, setOpenOtherPollId] = useState<string | null>(null);
  const [cheerCounts, setCheerCounts] = useState(() => listCheerCounts());

  const onChantToggle = (id: string) => {
    setOpenChantId((current) => {
      const next = current === id ? null : id;
      if (next) onTrack('parade_banter_chant_opened', { chant_id: next });
      return next;
    });
    hapticConfirm();
  };

  const onVote = (poll: RouteBanterPoll, optionId: string) => {
    const saved = voteInPoll(poll, optionId);
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

  const onCheer = (id: CheerId) => {
    setCheerCounts(tapCheer(id));
    onTrack('parade_banter_cheer_tapped', { cheer_id: id });
    hapticWow();
  };

  const onResetCheers = () => {
    setCheerCounts(resetCheerCounts());
    hapticConfirm();
    showToast('Cheer taps reset on this phone.');
  };

  return (
    <section className="screen banter-hub" aria-label="Parade banter">
      <div className="banter-intro">
        <p className="eyebrow">Banter</p>
        <h1>Small taps. Big noise.</h1>
        <p>Lyrics, votes and cheer taps. Open fast, sing, then pocket.</p>
      </div>

      <div className="panel banter-card banter-card--chants">
        <div className="banter-card__head">
          <h2>Chants</h2>
          <span>{banter.chants.length} lyrics</span>
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
          <span>local only</span>
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
          <p className="poll-footnote">Saved on this phone. Group counts arrive when the relay ships.</p>
        </div>
      </div>

      <div className="panel banter-card">
        <div className="banter-card__head">
          <h2>Cheer</h2>
          <button type="button" className="banter-reset" onClick={onResetCheers}>
            Reset
          </button>
        </div>
        <div className="cheer-grid" role="group" aria-label="Cheer taps">
          {CHEER_TILES.map((tile) => (
            <button
              type="button"
              key={tile.id}
              className="cheer-tile"
              onClick={() => onCheer(tile.id)}
            >
              <strong>{tile.label}</strong>
              <span>{tile.detail}</span>
              <em>{cheerCounts[tile.id]}</em>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
