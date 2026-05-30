import type { Insight } from '../lib/insights';

const TAG: Record<Insight['tone'], string> = {
  note: 'pattern',
  positive: 'on track',
  watch: 'worth a look',
};

export function InsightCard({ insight }: { insight: Insight }) {
  return (
    <article className={`insight ${insight.tone}`}>
      <span className="tag">{TAG[insight.tone]}</span>
      <h3>{insight.title}</h3>
      <p>{insight.body}</p>
    </article>
  );
}
