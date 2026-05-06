import type { HydrationCheck } from '../lib/hydration-check.ts';

interface Props {
  check: HydrationCheck;
}

export function HydrationWarning({ check }: Props) {
  if (check.severity === 'ok') {
    return <p className="check-line ok">{check.message}</p>;
  }
  return (
    <p className={`check-line ${check.severity}`} role="status">
      {check.message}
    </p>
  );
}
