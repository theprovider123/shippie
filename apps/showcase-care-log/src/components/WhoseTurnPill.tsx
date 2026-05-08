/**
 * WhoseTurnPill — for paired mode, who logged the most recent dose.
 *
 * Solo mode: returns null (no peer to attribute to).
 */
import type { MedDose } from '../sync/care-doc.ts';
import type { CaregiverRole } from '../sync/pairing.ts';

interface Props {
  recentDoses: readonly MedDose[];
  viewer: CaregiverRole;
  solo: boolean;
}

export function WhoseTurnPill({ recentDoses, viewer, solo }: Props) {
  if (solo) return null;
  const last = recentDoses[0];
  if (!last) return null;
  const byYou = last.given_by === viewer;
  return (
    <span className="cl-turn-pill" data-by-you={byYou}>
      Last dose: {byYou ? 'you' : 'the other caregiver'}
    </span>
  );
}
