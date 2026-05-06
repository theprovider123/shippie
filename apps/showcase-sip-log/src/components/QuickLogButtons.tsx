/**
 * Four large quick-tap buttons.
 *
 * The whole product fails if logging takes more than one tap, so this
 * component is deliberately dumb: emoji, label, ml/mg meta, click.
 * Long-press → custom amount sheet via onLongPress.
 */
import { PRESETS, type SipKind } from '../db.ts';
import type { Targets } from '../db.ts';
import { cutoffWarningFor } from '../lib/suggestions.ts';

const ORDER: SipKind[] = ['water', 'coffee-espresso', 'coffee-mug', 'tea'];

interface QuickLogButtonsProps {
  targets: Targets;
  onLog: (kind: SipKind) => void;
  onLongPress: (kind: SipKind) => void;
  now?: Date;
}

export function QuickLogButtons({ targets, onLog, onLongPress, now }: QuickLogButtonsProps) {
  return (
    <section className="quick" aria-label="Quick log">
      <div className="quick-grid">
        {ORDER.map((kind) => {
          const p = PRESETS[kind];
          const warn = cutoffWarningFor(kind, targets, now ?? new Date());
          return (
            <button
              key={kind}
              type="button"
              className={`tap-btn tap-${kind} ${warn ? 'tap-warn' : ''}`}
              onClick={() => onLog(kind)}
              onContextMenu={(e) => {
                e.preventDefault();
                onLongPress(kind);
              }}
              aria-label={`Log ${p.label} (${p.short}). Long-press for custom amount.`}
            >
              <span className="tap-emoji" aria-hidden="true">
                {p.emoji}
              </span>
              <span className="tap-label">{p.label}</span>
              <span className="tap-meta">{p.short}</span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className="tap-custom"
        onClick={() => onLongPress('water')}
        aria-label="Custom amount"
      >
        + custom amount or note
      </button>
    </section>
  );
}
