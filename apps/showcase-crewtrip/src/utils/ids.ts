export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
}

// Word-based event codes — easier to read aloud than CREW-3847.
// Two adjective+noun pairs from a small curated wordbank, plus a number suffix.
const CODE_ADJECTIVES = [
  'OLIVE', 'SUNSET', 'PORCH', 'LEMON', 'DUSK', 'CORAL', 'SAGE',
  'MARLIN', 'MOSS', 'LINEN', 'CIDER', 'AMBER', 'PEACH', 'CEDAR',
  'WILLOW', 'BRINE', 'PIPER', 'FENNEL', 'INDIGO', 'WHEAT',
];

const CODE_NOUNS = [
  'PORCH', 'KITE', 'LANE', 'BAY', 'TIDE', 'POOL', 'PATIO', 'MEADOW',
  'GARDEN', 'TERRACE', 'PIER', 'MARKET', 'GROVE', 'BRIDGE', 'BARN',
  'CAFE', 'CABIN', 'CREEK', 'DOCK', 'HARBOR',
];

function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)]!;
}

export function newEventCode(): string {
  const number = String(Math.floor(2 + Math.random() * 18)).padStart(2, '0');
  return `${pick(CODE_ADJECTIVES)}-${pick(CODE_NOUNS)}-${number}`;
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
