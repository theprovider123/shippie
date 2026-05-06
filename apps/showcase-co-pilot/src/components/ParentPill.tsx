import type { ParentRole } from '../sync/pairing.ts';

interface Props {
  role: ParentRole;
  /** When true, render "you" instead of "parent A/B" if role matches viewer. */
  viewer?: ParentRole;
}

export function ParentPill({ role, viewer }: Props) {
  const isYou = viewer === role;
  const label = isYou ? 'you' : 'other parent';
  return (
    <span className="co-pill" data-role={role}>
      {label}
    </span>
  );
}
