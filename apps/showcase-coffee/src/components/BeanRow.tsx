import { METHOD_LABEL, PROCESS_LABEL, type Bean } from '../db.ts';
import { reading } from '../lib/freshness.ts';

interface BeanRowProps {
  bean: Bean;
  active?: boolean;
  onClick: (id: string) => void;
}

export function BeanRow({ bean, active, onClick }: BeanRowProps) {
  const r = reading(bean.method, bean.roast_date);
  return (
    <button
      type="button"
      className={`bean-row ${active ? 'active' : ''}`}
      onClick={() => onClick(bean.id)}
    >
      <div className="bean-row-main">
        <span className="bean-name">{bean.name}</span>
        <span className="bean-meta">
          {bean.roaster ? `${bean.roaster} · ` : ''}
          {METHOD_LABEL[bean.method]} · 1:{bean.ratio}
        </span>
        {bean.origin || bean.process ? (
          <span className="bean-meta-2">
            {bean.origin ?? ''}
            {bean.origin && bean.process ? ' · ' : ''}
            {bean.process ? PROCESS_LABEL[bean.process] : ''}
          </span>
        ) : null}
      </div>
      <div className="bean-row-tail">
        {r ? (
          <span className={`freshness-tag tag-${r.band}`}>{r.label}</span>
        ) : (
          <span className="freshness-tag tag-unknown">—</span>
        )}
        {bean.cupping_score ? <span className="cupping-score">{bean.cupping_score}</span> : null}
      </div>
    </button>
  );
}
