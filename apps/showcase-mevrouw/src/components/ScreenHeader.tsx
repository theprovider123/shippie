import type { ReactNode } from 'react';
import { cn } from '@/lib/cn.ts';

interface Props {
  eyebrow?: string | undefined;
  title: string;
  lede?: string | undefined;
  right?: ReactNode;
  className?: string | undefined;
}

export function ScreenHeader({ eyebrow, title, lede, right, className }: Props) {
  return (
    <header className={cn('px-5 pt-8 pb-4 flex items-end justify-between gap-3', className)}>
      <div className="min-w-0 flex flex-col gap-1.5">
        {eyebrow && (
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--gold)]">
            {eyebrow}
          </p>
        )}
        <h1 className="font-serif text-3xl leading-none tracking-tight">{title}</h1>
        {lede && (
          <p className="text-[var(--muted-foreground)] text-sm max-w-[40ch]">{lede}</p>
        )}
      </div>
      {right && <div className="flex-shrink-0">{right}</div>}
    </header>
  );
}
