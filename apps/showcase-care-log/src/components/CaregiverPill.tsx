import type { CaregiverRole } from '../sync/pairing.ts';

interface Props {
  role: CaregiverRole;
  /** When set, render "you" instead of "the other caregiver" if role matches viewer. */
  viewer?: CaregiverRole;
}

export function CaregiverPill({ role, viewer }: Props) {
  const isYou = viewer === role;
  const label = isYou ? 'you' : 'the other caregiver';
  return (
    <span className="cl-pill" data-role={role}>
      {label}
    </span>
  );
}
