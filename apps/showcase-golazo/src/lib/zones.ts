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
  { id: "auto", label: "Where I am" },
  { id: "Europe/London", label: "UK & Ireland", hint: "BST" },
  { id: "Europe/Paris", label: "Western Europe", hint: "CEST" },
  { id: "Europe/Athens", label: "Eastern Europe", hint: "EEST" },
  { id: "Africa/Lagos", label: "West Africa", hint: "WAT" },
  { id: "Asia/Dubai", label: "Middle East", hint: "GST" },
  { id: "Asia/Kolkata", label: "South Asia", hint: "IST" },
  { id: "Asia/Tokyo", label: "East Asia", hint: "JST" },
  { id: "Australia/Sydney", label: "Australia", hint: "AEST" },
  { id: "America/New_York", label: "US East", hint: "ET" },
  { id: "America/Chicago", label: "US Central", hint: "CT" },
  { id: "America/Los_Angeles", label: "US West", hint: "PT" },
  { id: "America/Mexico_City", label: "Mexico", hint: "CT" },
  { id: "America/Sao_Paulo", label: "South America", hint: "BRT" },
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
  const zone = !watchZone || watchZone === "auto" ? deviceZone() : watchZone;
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone }).format(0);
    return zone;
  } catch {
    return "UTC";
  }
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

function offsetLike(name: string): boolean {
  return /^GMT(?:[+-]\d{1,2}(?::\d{2})?)?$/.test(name);
}

function shortZoneName(ms: number, zone: string): string {
  const locales = ["en-GB", "en-US"];
  for (const locale of locales) {
    const name =
      new Intl.DateTimeFormat(locale, {
        timeZone: zone,
        timeZoneName: "short",
      })
        .formatToParts(ms)
        .find((part) => part.type === "timeZoneName")?.value;
    if (name && !offsetLike(name)) return name;
  }
  const hint = ZONE_OPTIONS.find((option) => option.id === zone)?.hint;
  if (hint) return hint;
  return (
    new Intl.DateTimeFormat(undefined, {
      timeZone: zone,
      timeZoneName: "short",
    })
      .formatToParts(ms)
      .find((part) => part.type === "timeZoneName")?.value ?? zone
  );
}

export interface Kickoff {
  /** Local clock time, e.g. "5:00 PM". */
  time: string;
  /** Resolved IANA timezone id used for formatting. */
  zone: string;
  /** Short timezone name, e.g. "BST", "ET", "GMT+9". */
  zoneName: string;
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
  const zoneName = shortZoneName(ms, zone);

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

  return { time, zone, zoneName, day, rel, isToday: dDiff === 0, past: diff <= 0 };
}
