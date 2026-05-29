// Local kick-off times. Everything renders in the viewer's chosen timezone so
// a fan watching the USA/Canada/Mexico tournament from London, Lagos or Sydney
// sees every match in *their* time. Pure Intl — no data, no network.

/** A curated set of common viewing locations + the device's own zone. */
export interface ZoneOption {
  /** IANA timezone id, or "auto" for the device zone. */
  id: string;
  label: string;
  /** Rough UTC offset hint shown in the picker (not used for maths). */
  hint?: string;
}

export const ZONE_OPTIONS: ZoneOption[] = [
  { id: "auto", label: "My location (auto)" },
  { id: "America/Los_Angeles", label: "Los Angeles", hint: "PT" },
  { id: "America/Mexico_City", label: "Mexico City", hint: "CT" },
  { id: "America/New_York", label: "New York / Toronto", hint: "ET" },
  { id: "America/Sao_Paulo", label: "São Paulo", hint: "BRT" },
  { id: "Europe/London", label: "London", hint: "BST" },
  { id: "Europe/Paris", label: "Paris / Madrid / Lagos+1", hint: "CEST" },
  { id: "Africa/Lagos", label: "Lagos / Casablanca", hint: "WAT" },
  { id: "Europe/Athens", label: "Athens / Cairo", hint: "EEST" },
  { id: "Asia/Dubai", label: "Dubai", hint: "GST" },
  { id: "Asia/Kolkata", label: "India", hint: "IST" },
  { id: "Asia/Tokyo", label: "Tokyo / Seoul", hint: "JST" },
  { id: "Australia/Sydney", label: "Sydney", hint: "AEST" },
];

/** The device's own IANA zone, best-effort. */
export function deviceZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Resolve a stored watchZone ("auto"/undefined → device zone) to an IANA id. */
export function resolveZone(watchZone: string | undefined): string {
  if (!watchZone || watchZone === "auto") return deviceZone();
  return watchZone;
}

/** Friendly short label for a resolved zone (city tail of the IANA id). */
export function zoneLabel(watchZone: string | undefined): string {
  if (!watchZone || watchZone === "auto") {
    const z = deviceZone();
    return z.split("/").pop()?.replace(/_/g, " ") ?? z;
  }
  const opt = ZONE_OPTIONS.find((o) => o.id === watchZone);
  if (opt) return opt.label;
  return watchZone.split("/").pop()?.replace(/_/g, " ") ?? watchZone;
}

/** Integer calendar-day index for an instant within a given zone. */
function dayIndex(ms: number, zone: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ms));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return Math.floor(Date.UTC(get("year"), get("month") - 1, get("day")) / 86_400_000);
}

export interface Kickoff {
  /** Local clock time, e.g. "5:00 PM". */
  time: string;
  /** Day label: "Today", "Tomorrow", "Sat 13 Jun", etc. */
  day: string;
  /** Relative hint: "in 3h", "in 2 days", "kicked off". */
  rel: string;
  /** True if the kickoff calendar day == today in the chosen zone. */
  isToday: boolean;
  /** True once kickoff is in the past. */
  past: boolean;
}

/** Format an ISO kickoff for a viewer in `watchZone`, relative to `nowMs`. */
export function formatKickoff(
  iso: string,
  watchZone: string | undefined,
  nowMs: number = Date.now(),
): Kickoff {
  const zone = resolveZone(watchZone);
  const ms = new Date(iso).getTime();

  const time = new Intl.DateTimeFormat(undefined, {
    timeZone: zone,
    hour: "numeric",
    minute: "2-digit",
  }).format(ms);

  const dDiff = dayIndex(ms, zone) - dayIndex(nowMs, zone);
  let day: string;
  if (dDiff === 0) day = "Today";
  else if (dDiff === 1) day = "Tomorrow";
  else if (dDiff === -1) day = "Yesterday";
  else
    day = new Intl.DateTimeFormat(undefined, {
      timeZone: zone,
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(ms);

  const diff = ms - nowMs;
  let rel: string;
  if (diff <= 0) rel = "kicked off";
  else if (diff < 3_600_000) rel = `in ${Math.max(1, Math.round(diff / 60_000))}m`;
  else if (diff < 86_400_000) rel = `in ${Math.round(diff / 3_600_000)}h`;
  else rel = `in ${Math.round(diff / 86_400_000)} days`;

  return { time, day, rel, isToday: dDiff === 0, past: diff <= 0 };
}
