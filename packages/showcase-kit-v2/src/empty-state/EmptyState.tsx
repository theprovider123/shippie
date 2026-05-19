import type { EmptyStateProps } from './types';

export function EmptyState({ eyebrow, headline, body, cta, className }: EmptyStateProps) {
  return (
    <div className={`shippie-empty-state${className ? ' ' + className : ''}`}>
      <p className="shippie-empty-state__eyebrow">{eyebrow}</p>
      <h2 className="shippie-empty-state__headline">{headline}</h2>
      {body ? <p className="shippie-empty-state__body">{body}</p> : null}
      {cta ? (
        'href' in cta ? (
          <a className="shippie-empty-state__cta" href={cta.href}>
            {cta.label}
          </a>
        ) : (
          <button type="button" className="shippie-empty-state__cta" onClick={cta.onClick}>
            {cta.label}
          </button>
        )
      ) : null}
    </div>
  );
}
