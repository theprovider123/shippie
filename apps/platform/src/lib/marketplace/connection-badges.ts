import type { AppKind } from '$lib/types/app-kind';

export interface ConnectionSummary {
  host?: string | null;
  category?: string | null;
  purpose?: string | null;
  data?: readonly string[] | null;
}

export interface ConnectionDisclosureBadge {
  label: string;
  title: string;
  tone: 'ai' | 'service' | 'payment' | 'location' | 'weather' | 'hosted';
}

const AI_HOST_RE =
  /(^|\.)((api\.openai\.com)|(api\.anthropic\.com)|(generativelanguage\.googleapis\.com)|(api\.mistral\.ai)|(api\.groq\.com))$/i;
const PAYMENT_HOST_RE = /(^|\.)((stripe\.com)|(paypal\.com)|(paddle\.com)|(checkout\.com))$/i;
const WEATHER_HOST_RE = /(^|\.)((api\.openweathermap\.org)|(weatherapi\.com)|(api\.weather\.gov)|(metoffice\.gov\.uk))$/i;

export function connectionsFromGuard(guard: unknown): ConnectionSummary[] {
  const connections = (guard as { connections?: unknown } | null | undefined)?.connections;
  if (!Array.isArray(connections)) return [];
  const out: ConnectionSummary[] = [];
  for (const connection of connections) {
    if (!connection || typeof connection !== 'object') continue;
    const c = connection as {
      host?: unknown;
      category?: unknown;
      purpose?: unknown;
      data?: unknown;
    };
    if (typeof c.host !== 'string') continue;
    out.push({
      host: c.host,
      category: typeof c.category === 'string' ? c.category : null,
      purpose: typeof c.purpose === 'string' ? c.purpose : null,
      data: Array.isArray(c.data) ? c.data.filter((item): item is string => typeof item === 'string') : null,
    });
  }
  return out;
}

export function connectionBadgesFromKind(kind: AppKind | null | undefined): ConnectionDisclosureBadge[] {
  if (kind === 'connected') {
    return [
      {
        label: 'Uses external services',
        title: 'This app connects to external services for live features.',
        tone: 'service',
      },
    ];
  }
  if (kind === 'cloud') {
    return [
      {
        label: 'Creator-hosted service',
        title: 'This app relies on a creator-hosted service.',
        tone: 'hosted',
      },
    ];
  }
  return [];
}

export function connectionBadgesFromConnections(
  connections: readonly ConnectionSummary[],
  fallbackKind?: AppKind | null,
): ConnectionDisclosureBadge[] {
  const badges: ConnectionDisclosureBadge[] = [];

  const add = (badge: ConnectionDisclosureBadge) => {
    if (!badges.some((item) => item.label === badge.label)) badges.push(badge);
  };

  for (const connection of connections) {
    const host = (connection.host ?? '').toLowerCase();
    const category = (connection.category ?? '').toLowerCase();
    const purpose = (connection.purpose ?? '').toLowerCase();
    const data = (connection.data ?? []).map((item) => item.toLowerCase());
    const haystack = `${host} ${category} ${purpose} ${data.join(' ')}`;

    if (category === 'external-ai' || AI_HOST_RE.test(host) || /\b(ai|llm|model|openai|anthropic|gemini|gemma)\b/.test(haystack)) {
      add({
        label: 'Uses AI service',
        title: 'This app can send context to an external AI service.',
        tone: 'ai',
      });
      continue;
    }

    if (PAYMENT_HOST_RE.test(host) || /\b(payment|checkout|billing|stripe|paypal|paddle)\b/.test(haystack)) {
      add({
        label: 'Uses payment provider',
        title: 'This app connects to a payment provider.',
        tone: 'payment',
      });
      continue;
    }

    if (WEATHER_HOST_RE.test(host) || /\b(weather|forecast|climate)\b/.test(haystack)) {
      add({
        label: 'Uses weather service',
        title: 'This app connects to a weather service.',
        tone: 'weather',
      });
      continue;
    }

    if (/\b(location|geolocation|gps|maps?)\b/.test(haystack)) {
      add({
        label: 'Uses location service',
        title: 'This app can use a location-related external service.',
        tone: 'location',
      });
      continue;
    }

    if (category === 'wrapped-url' || /\b(hosted app upstream|creator-hosted|maker server)\b/.test(haystack)) {
      add({
        label: 'Creator-hosted service',
        title: 'This app relies on a creator-hosted service.',
        tone: 'hosted',
      });
      continue;
    }

    add({
      label: 'Uses external services',
      title: 'This app connects to external services for live features.',
      tone: 'service',
    });
  }

  if (badges.length === 0) return connectionBadgesFromKind(fallbackKind);
  return badges.slice(0, 2);
}
