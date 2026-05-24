import type { LiveSyncStatus } from '../lib/live-sync';

interface LiveSyncStripProps {
  status: LiveSyncStatus;
  online: boolean;
}

export function LiveSyncStrip({ status, online }: LiveSyncStripProps) {
  const copy = syncCopy(status, online);
  return (
    <div className={`live-sync-strip ${copy.tone}`} role="status" aria-live="polite">
      <span>{copy.title}</span>
      <strong>{copy.detail}</strong>
    </div>
  );
}

function syncCopy(status: LiveSyncStatus, online: boolean): { title: string; detail: string; tone: string } {
  if (!online || status.state === 'offline') {
    return { title: 'Crowd sync', detail: 'offline · saving taps here', tone: 'offline' };
  }
  if (status.state === 'syncing') {
    return { title: 'Crowd sync', detail: 'checking the relay', tone: 'syncing' };
  }
  if (status.state === 'synced') {
    const count = status.received > 0 ? `${status.received} in` : 'live';
    return { title: 'Crowd sync', detail: `${count} · ${timeLabel(status.lastSyncAt)}`, tone: 'synced' };
  }
  if (status.state === 'failed') {
    return { title: 'Crowd sync', detail: 'patchy · will retry', tone: 'failed' };
  }
  return { title: 'Crowd sync', detail: 'ready when signal appears', tone: 'idle' };
}

function timeLabel(value: string | null): string {
  if (!value) return 'just now';
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return 'just now';
  const minutes = Math.max(0, Math.round((Date.now() - ms) / 60_000));
  if (minutes < 1) return 'just now';
  return `${minutes} min ago`;
}
