export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
}

export function newEventCode(): string {
  return 'CREW-' + Math.floor(1000 + Math.random() * 9000);
}

export function safeFileName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'memory';
}

export function timeNow(): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
}

export function timeRank(value?: string): number {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const [hours = Number.NaN, minutes = Number.NaN] = value.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return Number.MAX_SAFE_INTEGER;
  return hours * 60 + minutes;
}
