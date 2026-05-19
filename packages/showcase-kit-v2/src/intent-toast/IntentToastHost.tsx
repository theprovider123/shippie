import { useEffect } from 'react';
import { useToastQueue } from './useToastQueue';
import type { IntentMatcher, IntentToastHostProps } from './types';

export function IntentToastHost({
  matchers,
  source,
  position = 'top',
  autoDismissMs = 4000,
}: IntentToastHostProps) {
  const { visible, push, dismiss } = useToastQueue({ autoDismissMs });

  useEffect(() => {
    const byKind = new Map<string, IntentMatcher>();
    for (const m of matchers) byKind.set(m.kind, m);
    return source.subscribe((intent) => {
      const m = byKind.get(intent.kind);
      if (m) push(m, intent);
    });
  }, [matchers, source, push]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`shippie-intent-toast shippie-intent-toast--${position}`}
      onClick={() => {
        if (visible.href) window.location.assign(visible.href);
      }}
    >
      {visible.icon ? <span className="shippie-intent-toast__icon">{visible.icon}</span> : null}
      <div className="shippie-intent-toast__text">
        <strong>{visible.title}</strong>
        {visible.body ? <span>{visible.body}</span> : null}
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        className="shippie-intent-toast__close"
        onClick={(e) => {
          e.stopPropagation();
          dismiss();
        }}
      >
        ×
      </button>
    </div>
  );
}
