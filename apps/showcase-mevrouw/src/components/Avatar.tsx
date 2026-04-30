import { cn } from '@/lib/cn.ts';

interface Props {
  name: string;
  dataUrl?: string | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  className?: string | undefined;
}

const SIZES = {
  sm: 'w-7 h-7 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-16 h-16 text-lg',
};

export function Avatar({ name, dataUrl, size = 'md', className }: Props) {
  if (dataUrl) {
    return (
      <img
        src={dataUrl}
        alt={`${name}'s avatar`}
        className={cn(
          'rounded-full object-cover border border-[var(--gold-glow)]',
          SIZES[size],
          className,
        )}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        'rounded-full bg-[var(--forest-light)] text-[var(--gold)] font-serif',
        'flex items-center justify-center select-none',
        SIZES[size],
        className,
      )}
    >
      {(name[0] ?? '·').toUpperCase()}
    </span>
  );
}
