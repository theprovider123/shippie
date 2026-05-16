const LOOPS = [
  {
    label: 'Before kickoff',
    title: 'Lock the receipt',
    text: 'Exact scores, first goal, upset call, and a shareable ticket before the whistle.',
  },
  {
    label: 'Live match',
    title: 'Tap the room pulse',
    text: 'VAR verdicts, nerves, next goal, player vote, and one-tap reactions when the chat gets loud.',
  },
  {
    label: 'Off day',
    title: 'Keep the streak alive',
    text: 'Daily five trivia, city facts, team trails, and office-family-friendly leaderboard fuel.',
  },
  {
    label: 'After full-time',
    title: 'Make receipts travel',
    text: 'Only-one-called-it cards, leaderboard drama, sweepstake updates, and city-stamped recaps.',
  },
];

export function EngagementLoopPanel() {
  return (
    <section className="engagement-loop-panel" aria-label="Match Room engagement loops">
      <div className="panel-head">
        <h2>Keep the room alive</h2>
        <span>viral rhythm</span>
      </div>
      <div className="engagement-loop-grid">
        {LOOPS.map((loop) => (
          <article key={loop.label}>
            <span>{loop.label}</span>
            <strong>{loop.title}</strong>
            <p>{loop.text}</p>
          </article>
        ))}
      </div>
      <div className="engagement-pulse">
        <strong>Best next move</strong>
        <span>Open one moment, let the room vote, then share the funniest result.</span>
      </div>
    </section>
  );
}
