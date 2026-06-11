/**
 * Matches — the season, dynamic and feed-fed. Month nav over the full
 * fixture list; each fixture opens a detail page with kickoff facts, H2H
 * history, and (for played matches) the result and that match's Gauge.
 */
import { useMemo, useState } from 'react';
import { EmptyNote, Rule, StaleBadge } from '../components/chrome';
import { GaugePanel } from '../components/Gauge';
import { ShareButton } from '../components/ShareButton';
import { FEEDS, useFeed } from '../lib/feeds';
import { downloadICS } from '../lib/ics';
import { compShort, fixtureDateParts, kickoffLabel, monthOf } from '../lib/matchday';
import { matchLink } from '../lib/share';
import type { Difficulty, Fixture, FixturesFeed, H2HRecord, ResultLetter } from '../lib/types';

const DIFF_LABEL: Record<Difficulty, string> = { hard: 'Hard', mid: 'Mid', winnable: 'Win' };
const RES_CLASS: Record<ResultLetter, string> = { W: 'res-w', D: 'res-d', L: 'res-l' };

function resultLetter(f: Fixture): ResultLetter | null {
  if (f.status !== 'ft' || !f.score) return null;
  if (f.score.home > f.score.away) return 'W';
  if (f.score.home < f.score.away) return 'L';
  return 'D';
}

// ── Detail ───────────────────────────────────────────────────────────────────
const MatchDetail = ({
  fixture,
  h2h,
  onBack,
  onOpenThread,
}: {
  fixture: Fixture;
  h2h: H2HRecord | null;
  onBack: () => void;
  onOpenThread: (matchId: string) => void;
}) => {
  const letter = resultLetter(fixture);
  const played = letter !== null;
  const wPct = h2h
    ? Math.round((h2h.record.w / Math.max(1, h2h.record.w + h2h.record.d + h2h.record.l)) * 100)
    : 0;

  return (
    <div className="screen detail-screen">
      <div className="detail-head">
        <button className="back-btn" onClick={onBack} aria-label="Back to matches">
          ← Matches
        </button>
        <ShareButton
          ghost
          label="Share"
          moment={{
            title: 'The Cannon — match',
            text: played
              ? `Arsenal ${fixture.score!.home}–${fixture.score!.away} ${fixture.opponent} (${fixture.comp}).`
              : `Arsenal ${fixture.venue === 'A' ? 'away at' : 'vs'} ${fixture.opponent} — ${kickoffLabel(fixture.kickoffUtc)}.`,
            url: matchLink(fixture.id),
          }}
        />
      </div>

      <section className={`detail-hero${played ? ` detail-hero--${RES_CLASS[letter!]}` : ''}`}>
        <span className="detail-comp">{fixture.comp}</span>
        <h2 className="detail-tie">
          Arsenal <em>{fixture.venue === 'A' ? '@' : 'v'}</em> {fixture.opponent}
        </h2>
        {played ? (
          <div className="detail-score">
            {fixture.score!.home}
            <span>–</span>
            {fixture.score!.away}
          </div>
        ) : (
          <div className="detail-when">{kickoffLabel(fixture.kickoffUtc)}</div>
        )}
        <div className="detail-facts">
          <span>{fixture.ground ?? (fixture.venue === 'H' ? 'Emirates Stadium' : 'Away')}</span>
          {fixture.tv && <span>TV — {fixture.tv}</span>}
          {fixture.status === 'postponed' && <span className="detail-postponed">Postponed</span>}
        </div>
        {!played && fixture.status !== 'postponed' && (
          <div className="hero-actions">
            <button className="ghost-btn" onClick={() => downloadICS(fixture)}>
              Add to calendar
            </button>
            <button className="ghost-btn" onClick={() => onOpenThread(fixture.id)}>
              Match thread
            </button>
          </div>
        )}
      </section>

      {h2h && (
        <>
          <Rule label="Head to head" accent="var(--gold)" />
          <div className="h2h">
            <div className="h2h-record">
              <div className="h2h-cell h2h-cell--w">
                <strong>{h2h.record.w}</strong>
                <em>Arsenal wins</em>
              </div>
              <div className="h2h-cell">
                <strong>{h2h.record.d}</strong>
                <em>Draws</em>
              </div>
              <div className="h2h-cell">
                <strong>{h2h.record.l}</strong>
                <em>{fixture.opponent} wins</em>
              </div>
            </div>
            <div className="h2h-bar">
              <div className="h2h-bar-fill" style={{ width: `${wPct}%` }} />
            </div>
          </div>

          <Rule label="Last five meetings" />
          <ul className="meetings">
            {h2h.recent.map((mt, i) => (
              <li key={i} className="meeting">
                <span className={`meeting-res ${RES_CLASS[mt.r]}`}>{mt.r}</span>
                <span className="meeting-score">{mt.score}</span>
                <span className="meeting-where">{mt.home ? 'Arsenal (H)' : `${fixture.opponent} (A)`}</span>
                <span className="meeting-date">{mt.date}</span>
              </li>
            ))}
          </ul>

          <Rule label="The read" accent="var(--gold)" />
          <blockquote className="oracle">
            <p>“{h2h.insight}”</p>
          </blockquote>
        </>
      )}

      {played && (
        <>
          <Rule label="The gauge" accent="#EF0107" />
          <GaugePanel
            matchId={fixture.id}
            matchLabel={`Arsenal ${fixture.score!.home}–${fixture.score!.away} ${fixture.opponent}`}
          />
        </>
      )}
    </div>
  );
};

// ── Row ──────────────────────────────────────────────────────────────────────
const FixtureRow = ({ fixture, onOpen }: { fixture: Fixture; onOpen: (f: Fixture) => void }) => {
  const { day, mon } = fixtureDateParts(fixture);
  const letter = resultLetter(fixture);
  const diff = fixture.difficulty ?? 'mid';

  return (
    <button className="fixture-row" onClick={() => onOpen(fixture)}>
      <span className="fixture-date">
        <strong>{day}</strong>
        <em>{mon}</em>
      </span>
      <span className="fixture-main">
        <span className="fixture-opp">
          {fixture.opponent}
          {fixture.status === 'postponed' && <i className="fixture-pp">PP</i>}
        </span>
        <span className="fixture-sub">
          {compShort(fixture.comp)} · {fixture.venue}
          {fixture.tv ? ` · ${fixture.tv}` : ''}
        </span>
      </span>
      {letter ? (
        <span className={`fixture-result ${RES_CLASS[letter]}`}>
          {fixture.score!.home}–{fixture.score!.away}
        </span>
      ) : fixture.status === 'live' ? (
        <span className="fixture-live">
          <span className="live-dot pulse" /> Live
        </span>
      ) : (
        <span className={`fixture-diff fixture-diff--${diff}`}>{DIFF_LABEL[diff]}</span>
      )}
    </button>
  );
};

// ── Screen ───────────────────────────────────────────────────────────────────
export const MatchesScreen = ({
  openMatchId,
  onOpenMatch,
  onCloseMatch,
  onOpenThread,
}: {
  openMatchId: string | null;
  onOpenMatch: (matchId: string) => void;
  onCloseMatch: () => void;
  onOpenThread: (matchId: string) => void;
}) => {
  const feed = useFeed(FEEDS.fixtures);
  const data: FixturesFeed = feed.data;
  const [month, setMonth] = useState('All');

  const months = useMemo(() => {
    const seen: string[] = [];
    for (const f of data.fixtures) {
      const mo = monthOf(f.kickoffUtc);
      if (mo && !seen.includes(mo)) seen.push(mo);
    }
    return ['All', ...seen];
  }, [data.fixtures]);

  const open = openMatchId ? data.fixtures.find((f) => f.id === openMatchId) ?? null : null;
  if (open) {
    return (
      <MatchDetail
        fixture={open}
        h2h={data.h2h?.[open.opponent] ?? null}
        onBack={onCloseMatch}
        onOpenThread={onOpenThread}
      />
    );
  }

  const filtered =
    month === 'All' ? data.fixtures : data.fixtures.filter((f) => monthOf(f.kickoffUtc) === month);

  return (
    <div className="screen matches-screen">
      <div className="screen-head">
        <h1 className="screen-title">Matches</h1>
        <div className="screen-head-right">
          <span className="season-chip">{data.season}</span>
          <StaleBadge stale={feed.stale} asOf={feed.asOf} />
        </div>
      </div>

      <div className="chip-strip" role="tablist" aria-label="Filter by month">
        {months.map((mo) => (
          <button
            key={mo}
            className={`chip${month === mo ? ' active' : ''}`}
            onClick={() => setMonth(mo)}
            role="tab"
            aria-selected={month === mo}
          >
            {mo}
          </button>
        ))}
      </div>

      <div className="fixture-list">
        {filtered.map((f) => (
          <FixtureRow key={f.id} fixture={f} onOpen={(fx) => onOpenMatch(fx.id)} />
        ))}
        {filtered.length === 0 && <EmptyNote>No fixtures in {month} yet.</EmptyNote>}
      </div>
    </div>
  );
};
