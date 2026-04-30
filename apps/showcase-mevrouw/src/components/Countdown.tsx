import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn.ts';

interface Props {
  /** ISO datetime to count down to. */
  target: string;
  label: string;
  transport?: { name: string; ref?: string | null } | null;
  className?: string;
}

interface Parts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  passed: boolean;
}

function partsTo(target: string, now = Date.now()): Parts {
  const ms = new Date(target).getTime() - now;
  const passed = ms < 0;
  const abs = Math.abs(ms);
  return {
    days: Math.floor(abs / 86_400_000),
    hours: Math.floor((abs % 86_400_000) / 3_600_000),
    minutes: Math.floor((abs % 3_600_000) / 60_000),
    seconds: Math.floor((abs % 60_000) / 1_000),
    passed,
  };
}

export function Countdown({ target, label, transport, className }: Props) {
  const [parts, setParts] = useState<Parts>(() => partsTo(target));

  useEffect(() => {
    setParts(partsTo(target));
    const tick = () => setParts(partsTo(target));
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [target]);

  return (
    <div
      className={cn(
        'rounded-3xl p-6 sm:p-8 border border-[var(--gold-glow)] gold-wash flex flex-col gap-3',
        className,
      )}
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--gold)]">
        {parts.passed ? 'Just gone' : 'Until'}
      </p>
      <h2 className="font-serif text-3xl sm:text-4xl leading-tight tracking-tight">
        {label}
      </h2>
      <div className="grid grid-cols-4 gap-2 sm:gap-4 mt-2">
        <Cell value={parts.days} unit="days" />
        <Cell value={parts.hours} unit="hrs" />
        <Cell value={parts.minutes} unit="min" />
        <Cell value={parts.seconds} unit="sec" />
      </div>
      {transport && (
        <p className="text-[var(--muted-foreground)] text-xs font-mono uppercase tracking-wider">
          {transport.name}
          {transport.ref ? ` · ${transport.ref}` : ''}
        </p>
      )}
    </div>
  );
}

function Cell({ value, unit }: { value: number; unit: string }) {
  return (
    <div className="flex flex-col items-center gap-1 bg-[var(--background)]/40 rounded-xl py-2.5 sm:py-3">
      <span className="font-serif text-2xl sm:text-3xl tabular-nums">{value}</span>
      <span className="text-[9px] sm:text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] font-mono">
        {unit}
      </span>
    </div>
  );
}
