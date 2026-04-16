/**
 * <Logo /> — Shippie horizontal logo (rocket + wordmark).
 *
 * Uses the rocket mark inline + text. Auto-adapts to current theme
 * via CSS custom properties.
 */
import { RocketMark } from './rocket-mark';

export function Logo({
  size = 'md',
  className = '',
}: {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const textSize = size === 'sm' ? 'text-lg' : size === 'lg' ? 'text-3xl' : 'text-xl';
  const rocketSize = size === 'sm' ? 'sm' : size === 'lg' ? 'lg' : 'md';

  return (
    <span className={`inline-flex items-center gap-2 ${className}`} aria-label="Shippie">
      <RocketMark size={rocketSize} />
      <span className={`${textSize} font-semibold tracking-tight`} style={{ color: 'var(--text-primary)' }}>
        Shippie
      </span>
    </span>
  );
}
