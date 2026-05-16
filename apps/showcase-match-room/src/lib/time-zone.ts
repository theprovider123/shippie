export interface TimeZoneOption {
  value: string;
  label: string;
  region: string;
}

export const TIME_ZONE_OPTIONS: TimeZoneOption[] = [
  { value: 'Europe/London', label: 'London', region: 'UK / Ireland' },
  { value: 'Europe/Paris', label: 'Paris', region: 'Central Europe' },
  { value: 'Europe/Madrid', label: 'Madrid', region: 'Spain' },
  { value: 'Africa/Casablanca', label: 'Casablanca', region: 'North Africa' },
  { value: 'Africa/Lagos', label: 'Lagos', region: 'West Africa' },
  { value: 'Africa/Johannesburg', label: 'Johannesburg', region: 'Southern Africa' },
  { value: 'America/Mexico_City', label: 'Mexico City', region: 'Mexico' },
  { value: 'America/New_York', label: 'New York', region: 'US / Canada East' },
  { value: 'America/Chicago', label: 'Chicago', region: 'US / Canada Central' },
  { value: 'America/Los_Angeles', label: 'Los Angeles', region: 'US / Canada Pacific' },
  { value: 'America/Sao_Paulo', label: 'Sao Paulo', region: 'Brazil' },
  { value: 'America/Argentina/Buenos_Aires', label: 'Buenos Aires', region: 'Argentina' },
  { value: 'Asia/Riyadh', label: 'Riyadh', region: 'Arabia' },
  { value: 'Asia/Kolkata', label: 'Kolkata', region: 'India' },
  { value: 'Asia/Tokyo', label: 'Tokyo', region: 'Japan' },
  { value: 'Asia/Seoul', label: 'Seoul', region: 'Korea' },
  { value: 'Australia/Sydney', label: 'Sydney', region: 'Australia East' },
  { value: 'Pacific/Auckland', label: 'Auckland', region: 'New Zealand' },
];

const DEFAULT_TIME_ZONE = 'Europe/London';

export function detectTimeZone(): string {
  if (typeof Intl === 'undefined') return DEFAULT_TIME_ZONE;
  return supportedTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
}

export function supportedTimeZone(value: string | null | undefined): string {
  if (!value) return DEFAULT_TIME_ZONE;
  return TIME_ZONE_OPTIONS.some((option) => option.value === value) ? value : DEFAULT_TIME_ZONE;
}

export function timeZoneLabel(value: string): string {
  const option = TIME_ZONE_OPTIONS.find((item) => item.value === value);
  return option ? `${option.label} (${option.region})` : value;
}

export function formatKickoff(iso: string, timeZone: string, locale = 'en-GB'): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(iso));
}
