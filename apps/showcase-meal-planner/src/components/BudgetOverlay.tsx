import type { BudgetStatus } from '../lib/cost-estimate.ts';

interface BudgetOverlayProps {
  status: BudgetStatus;
  estimatedSlots: number;
  taggedSlots: number;
  filledSlots: number;
  /** Optional currency prefix — falls back to plain numbers. */
  currency?: string;
}

/**
 * Honest cost overlay: shows the estimate vs the cap with a thin bar.
 * Copy says "estimate" not "exact". If most slots used the fallback,
 * we say so plainly.
 */
export function BudgetOverlay({
  status,
  estimatedSlots,
  taggedSlots,
  filledSlots,
  currency = '',
}: BudgetOverlayProps) {
  if (filledSlots === 0) {
    return (
      <p className="empty">Plan a meal and an estimated cost lands here.</p>
    );
  }

  const ratio = status.ratio ?? 0;
  const pct = Math.min(100, Math.max(0, ratio * 100));
  const ariaLabel =
    status.cap !== null
      ? `Estimated ${currency}${status.estimate.toFixed(2)} of ${currency}${status.cap.toFixed(2)} cap`
      : `Estimated ${currency}${status.estimate.toFixed(2)}`;

  return (
    <div className={`budget budget-${status.state}`} aria-label={ariaLabel}>
      <div className="budget-row">
        <strong>
          ~{currency}
          {status.estimate.toFixed(2)}
        </strong>
        <span className="muted">
          {status.cap !== null ? (
            <>
              of {currency}
              {status.cap.toFixed(2)} cap
            </>
          ) : (
            <>no cap set — open a budget app to share one</>
          )}
        </span>
      </div>
      {status.cap !== null ? (
        <div className="budget-bar" aria-hidden="true">
          <div className="budget-bar-fill" style={{ width: `${pct}%` }} />
        </div>
      ) : null}
      <p className="caveat">
        {taggedSlots > 0 && estimatedSlots > 0 ? (
          <>
            {taggedSlots} slot{taggedSlots === 1 ? '' : 's'} priced from the recipe; {estimatedSlots} used a per-serving fallback.
          </>
        ) : estimatedSlots > 0 ? (
          <>All {estimatedSlots} slots used a per-serving fallback — set tighter prices in slot details for a better estimate.</>
        ) : (
          <>Every slot priced from its recipe — this is as honest as it gets without till receipts.</>
        )}
      </p>
    </div>
  );
}
