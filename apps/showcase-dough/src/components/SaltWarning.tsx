import type { SaltCheck } from '../lib/salt-check.ts';

interface Props {
  check: SaltCheck;
}

export function SaltWarning({ check }: Props) {
  if (check.severity === 'ok') {
    return <p className="check-line ok">{check.message}</p>;
  }
  return (
    <p className={`check-line ${check.severity}`} role="status">
      {check.message}
    </p>
  );
}
