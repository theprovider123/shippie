import type { RoutePack } from '../data/parade-2026';
import type { Readiness } from './ReadinessChip';
import { packFreshnessLabel } from '../lib/route-pack';

interface AboutSheetProps {
  appVersion: string;
  pack: RoutePack;
  readiness: Readiness;
  onClose: () => void;
  onOpenSafety: () => void;
}

export function AboutSheet({ appVersion, pack, readiness, onClose, onOpenSafety }: AboutSheetProps) {
  const primarySource = pack.sources[0];
  const routeSource = pack.sources[1] ?? primarySource;
  return (
    <div
      className="about-sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-sheet-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="about-sheet__surface">
        <p className="eyebrow">About</p>
        <h2 id="about-sheet-title">Unofficial local parade tool</h2>
        <p className="about-sheet__copy">
          Built to be saved before travel, then used with little or no signal. It is not
          affiliated with the club, Islington Council, TfL, or the Met Police.
        </p>

        <dl className="about-sheet__facts">
          <div>
            <dt>App</dt>
            <dd>v{appVersion}</dd>
          </div>
          <div>
            <dt>Offline</dt>
            <dd>{readiness === 'ready' ? 'saved on this phone' : 'open on Wi-Fi before travel'}</dd>
          </div>
          <div>
            <dt>Pack</dt>
            <dd>{packFreshnessLabel(pack)}</dd>
          </div>
        </dl>

        <div className="about-sheet__sources">
          {primarySource ? (
            <a href={primarySource.url} target="_blank" rel="noreferrer">
              Council source
            </a>
          ) : null}
          {routeSource && routeSource !== primarySource ? (
            <a href={routeSource.url} target="_blank" rel="noreferrer">
              Route source
            </a>
          ) : null}
        </div>

        <div className="about-sheet__actions">
          <button
            type="button"
            className="secondary-action"
            onClick={() => {
              onClose();
              onOpenSafety();
            }}
          >
            Safety
          </button>
          <button type="button" className="primary-action" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
