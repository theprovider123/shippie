import type { Observation } from '../lib/observations';

interface ObservationCardProps {
  observation: Observation;
  onDismiss: (id: string) => void;
}

export function ObservationCard({ observation, onDismiss }: ObservationCardProps) {
  return (
    <div className="chiwit-observation">
      <div className="chiwit-observation__header">
        <span className="chiwit-observation__icon">{observation.icon}</span>
        <p className="chiwit-observation__text">{observation.text}</p>
        <button
          type="button"
          className="chiwit-observation__dismiss"
          aria-label="Dismiss observation"
          onClick={() => onDismiss(observation.id)}
        >
          ×
        </button>
      </div>
      <p className="chiwit-observation__evidence">{observation.evidence}</p>
      <p className="chiwit-observation__microcopy">{observation.microcopy}</p>
    </div>
  );
}
