import { useMemo, useState } from 'react';
import type { RoutePack } from '../data/parade-2026';
import type { ParadeAnalyticsEvent } from '../lib/analytics';
import {
  banterFromPack,
  CHEER_TILES,
  listCheerCounts,
  pollOptionCount,
  selectedOptionId,
  tapCheer,
  totalPollVotes,
  voteInPoll,
  type CheerId,
} from '../lib/banter';
import { hapticConfirm, hapticWow } from '../lib/haptic';
import { showToast } from '../lib/toast';

interface BanterScreenProps {
  pack: RoutePack;
  onTrack: (event: ParadeAnalyticsEvent, props?: Record<string, string | number | boolean | null>) => void;
}

export function BanterScreen({ pack, onTrack }: BanterScreenProps) {
  const banter = useMemo(() => banterFromPack(pack), [pack]);
  const [openChantId, setOpenChantId] = useState<string | null>(banter.chants[0]?.id ?? null);
  const [voteVersion, setVoteVersion] = useState(0);
  const [cheerCounts, setCheerCounts] = useState(() => listCheerCounts());

  const onChantToggle = (id: string) => {
    setOpenChantId((current) => {
      const next = current === id ? null : id;
      if (next) onTrack('parade_banter_chant_opened', { chant_id: next });
      return next;
    });
    hapticConfirm();
  };

  const onVote = (pollId: string, optionId: string) => {
    const poll = banter.polls.find((item) => item.id === pollId);
    if (!poll) return;
    const saved = voteInPoll(poll, optionId);
    if (!saved) return;
    setVoteVersion((current) => current + 1);
    onTrack('parade_banter_poll_voted', { poll_id: pollId, option_id: optionId });
    hapticConfirm();
    showToast('Vote saved on this phone.', 'success');
  };

  const onCheer = (id: CheerId) => {
    setCheerCounts(tapCheer(id));
    onTrack('parade_banter_cheer_tapped', { cheer_id: id });
    hapticWow();
  };

  return (
    <section className="screen banter-hub" aria-label="Parade banter">
      <div className="banter-intro">
        <p className="eyebrow">Banter</p>
        <h1>Small taps. Big noise.</h1>
        <p>Chants, votes and cheer cues. Built to glance at, then pocket.</p>
      </div>

      <div className="panel banter-card banter-card--chants">
        <div className="banter-card__head">
          <h2>Chants</h2>
          <span>{banter.chants.length} cues</span>
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
          <span>local first</span>
        </div>
        <div className="poll-list" data-version={voteVersion}>
          {banter.polls.map((poll) => {
            const selected = selectedOptionId(poll.id);
            const total = totalPollVotes(poll.id);
            return (
              <div className="poll-block" key={poll.id}>
                <h3>{poll.question}</h3>
                <div className="poll-options">
                  {poll.options.map((option) => {
                    const active = selected === option.id;
                    const count = pollOptionCount(poll.id, option.id);
                    const width = total > 0 ? `${Math.max(8, Math.round((count / total) * 100))}%` : '0%';
                    return (
                      <button
                        type="button"
                        key={option.id}
                        className={`poll-option ${active ? 'is-selected' : ''}`}
                        onClick={() => onVote(poll.id, option.id)}
                      >
                        <span className="poll-option__bar" style={{ width }} aria-hidden />
                        <span className="poll-option__label">{option.label}</span>
                        <span className="poll-option__count">{count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="panel banter-card">
        <div className="banter-card__head">
          <h2>Cheer</h2>
          <span>on this phone</span>
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
