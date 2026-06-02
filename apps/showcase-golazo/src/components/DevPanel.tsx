import { useStore } from "../state";
import { hasResults } from "../lib/scoring";
import { tap, confirmBuzz } from "../lib/haptics";

/**
 * Demo aid (open with #demo). Plays out a plausible tournament so live scoring,
 * pool leaderboards, and sweepstake standings/settle can be shown without the
 * real feed. Not part of the normal UX.
 */
export function DevPanel({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const live = hasResults(store.results);
  return (
    <div className="dev-panel" role="dialog" aria-label="Demo controls">
      <span className="dev-title">Demo</span>
      <p className="dev-note">{live ? "Results are live — standings + settle are active." : "No results yet."}</p>
      <button className="cta sm" onClick={() => { confirmBuzz(); store.simulateResults(); }}>
        Simulate tournament
      </button>
      <button className="ghost-btn sm" disabled={!live} onClick={() => { tap(); store.clearResults(); }}>
        Clear results
      </button>
      <button className="dev-close" onClick={() => { tap(); onClose(); }} aria-label="Close demo panel">✕</button>
    </div>
  );
}
