import { diffLines, diffStats } from '../lib/diff.ts';

export interface DiffViewProps {
  before: string;
  after: string;
  beforeLabel: string;
  afterLabel: string;
}

export function DiffView({ before, after, beforeLabel, afterLabel }: DiffViewProps) {
  const lines = diffLines(before, after);
  const stats = diffStats(lines);
  return (
    <div className="diff-view">
      <header className="diff-header">
        <span className="diff-label">
          {beforeLabel} → {afterLabel}
        </span>
        <span className="diff-stats muted small">
          +{stats.added} / −{stats.removed}
        </span>
      </header>
      <pre className="diff-body">
        {lines.map((l, i) => {
          const symbol = l.op === 'added' ? '+' : l.op === 'removed' ? '−' : ' ';
          const cls = `diff-line diff-${l.op}`;
          return (
            <span key={i} className={cls}>
              {symbol} {l.text || ' '}
              {'\n'}
            </span>
          );
        })}
      </pre>
    </div>
  );
}
