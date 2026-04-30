import { Avatar } from './Avatar.tsx';
import { cn } from '@/lib/cn.ts';

interface Props {
  meName: string;
  partnerName: string | null;
  meStatus: string;
  partnerStatus: string;
  meAvatar?: string | null | undefined;
  partnerAvatar?: string | null | undefined;
  meOnline?: boolean | undefined;
  partnerOnline?: boolean | undefined;
  bothHere?: boolean | undefined;
  className?: string | undefined;
}

export function PresenceCard({
  meName,
  partnerName,
  meStatus,
  partnerStatus,
  meAvatar,
  partnerAvatar,
  meOnline,
  partnerOnline,
  bothHere,
  className,
}: Props) {
  return (
    <div
      className={cn(
        'rounded-2xl p-5 border bg-[var(--card)] flex flex-col gap-3 transition-colors',
        bothHere
          ? 'border-[var(--gold)] bg-[var(--gold-wash)]'
          : 'border-[var(--border)]',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-4">
        <Side name={meName} status={meStatus} avatar={meAvatar} online={meOnline} />
        <span className="text-[var(--muted-foreground)] font-serif italic text-lg">·</span>
        <Side
          name={partnerName ?? 'partner'}
          status={partnerStatus}
          avatar={partnerAvatar}
          online={partnerOnline}
          align="end"
        />
      </div>
      {bothHere && (
        <div className="flex items-center justify-center gap-2 -mt-1">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--gold)] opacity-60 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--gold)]" />
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--gold)]">
            both here, right now
          </span>
        </div>
      )}
    </div>
  );
}

function Side({
  name,
  status,
  avatar,
  online,
  align = 'start',
}: {
  name: string;
  status: string;
  avatar?: string | null | undefined;
  online?: boolean | undefined;
  align?: 'start' | 'end';
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 min-w-0',
        align === 'end' ? 'flex-row-reverse text-right' : '',
      )}
    >
      <div className="relative">
        <Avatar name={name} dataUrl={avatar} size="md" />
        {online !== undefined && (
          <span
            className={cn(
              'absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--card)]',
              online ? 'bg-[var(--gold)]' : 'bg-[var(--muted)]',
            )}
            aria-label={online ? 'online' : 'offline'}
          />
        )}
      </div>
      <div className={cn('flex flex-col gap-1 min-w-0', align === 'end' ? 'items-end' : 'items-start')}>
        <p className="font-serif text-base leading-tight truncate max-w-[12ch]">{name}</p>
        <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
          {status}
        </p>
      </div>
    </div>
  );
}
