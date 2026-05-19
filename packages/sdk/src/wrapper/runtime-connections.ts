/**
 * Runtime Connection Monitor.
 *
 * Static Connection Guard catches literal outbound URLs at deploy time.
 * This monitor catches runtime-created URLs on the user's device and stores
 * only host-level facts locally, never request payloads.
 */

export interface RuntimeConnectionRecord {
  host: string;
  href: string;
  method: string;
  surface: 'fetch' | 'xhr' | 'websocket' | 'eventsource' | 'beacon';
  category: 'external-ai' | 'tracker' | 'payment' | 'weather' | 'external';
  risk: 'low' | 'medium' | 'high';
  purpose: string;
  data: string[];
  blocked: boolean;
  firstSeenAt: number;
  lastSeenAt: number;
  count: number;
}

export interface RuntimeConnectionMonitorOptions {
  slug: string;
  version?: number | null;
  global?: RuntimeConnectionGlobal;
}

export interface RuntimeConnectionGlobal {
  fetch?: typeof fetch;
  XMLHttpRequest?: {
    prototype: {
      open: (...args: unknown[]) => unknown;
    };
  };
  WebSocket?: new (...args: unknown[]) => unknown;
  EventSource?: new (...args: unknown[]) => unknown;
  navigator?: {
    sendBeacon?: (url: string | URL, data?: BodyInit | null) => boolean;
  };
  location?: {
    href?: string;
    origin?: string;
    host?: string;
  };
  localStorage?: Pick<Storage, 'getItem' | 'setItem'>;
  dispatchEvent?: (event: Event) => boolean;
  CustomEvent?: typeof CustomEvent;
  __shippie_runtime_connections?: RuntimeConnectionRecord[];
}

const PATCHED = Symbol.for('shippie.runtimeConnectionMonitor.patched');
const STATE = Symbol.for('shippie.runtimeConnectionMonitor.state');
const STORAGE_PREFIX = 'shippie.runtime-connections.v1';
const SHIPPIE_HOST_RE = /(^|\.)shippie\.(?:app|dev)$/i;
const EXTERNAL_AI_HOST_RE =
  /(^|\.)((api\.openai\.com)|(api\.anthropic\.com)|(generativelanguage\.googleapis\.com)|(api\.mistral\.ai)|(api\.groq\.com))$/i;
const TRACKER_HOST_RE =
  /(^|\.)((google-analytics\.com)|(googletagmanager\.com)|(doubleclick\.net)|(googlesyndication\.com)|(adservice\.google\.com)|(facebook\.net)|(facebook\.com)|(hotjar\.com)|(fullstory\.com)|(mixpanel\.com)|(amplitude\.com)|(segment\.io))$/i;
const PAYMENT_HOST_RE = /(^|\.)((stripe\.com)|(paypal\.com)|(paddle\.com)|(checkout\.com))$/i;
const WEATHER_HOST_RE = /(^|\.)((api\.openweathermap\.org)|(weatherapi\.com)|(api\.weather\.gov)|(metoffice\.gov\.uk))$/i;

interface MonitorState {
  slug: string;
  version?: number | null;
}

export function runtimeConnectionStorageKey(slug: string): string {
  return `${STORAGE_PREFIX}:${slug}`;
}

export function installRuntimeConnectionMonitor(options: RuntimeConnectionMonitorOptions): void {
  const host = options.global ?? (typeof globalThis !== 'undefined' ? (globalThis as RuntimeConnectionGlobal) : null);
  if (!host || !options.slug) return;

  (host as unknown as Record<symbol, MonitorState>)[STATE] = {
    slug: options.slug,
    version: options.version ?? null,
  };

  if ((host as unknown as Record<symbol, boolean>)[PATCHED]) return;
  (host as unknown as Record<symbol, boolean>)[PATCHED] = true;

  patchFetch(host);
  patchXhr(host);
  patchWebSocket(host);
  patchEventSource(host);
  patchBeacon(host);
}

export function readRuntimeConnections(
  slug: string,
  storage: Pick<Storage, 'getItem'> | null | undefined = typeof localStorage !== 'undefined' ? localStorage : null,
): RuntimeConnectionRecord[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(runtimeConnectionStorageKey(slug));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRuntimeConnectionRecord);
  } catch {
    return [];
  }
}

function patchFetch(host: RuntimeConnectionGlobal): void {
  if (typeof host.fetch !== 'function') return;
  const original = host.fetch.bind(host);
  host.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = requestMethod(input, init);
    const blocked = observeConnection(host, inputToUrl(input), method, 'fetch');
    if (blocked) return Promise.reject(new TypeError('Blocked by Shippie Connection Guard'));
    return original(input, init);
  }) as typeof fetch;
}

function patchXhr(host: RuntimeConnectionGlobal): void {
  const proto = host.XMLHttpRequest?.prototype;
  if (!proto || typeof proto.open !== 'function') return;
  const original = proto.open;
  proto.open = function open(method: unknown, url: unknown, ...rest: unknown[]) {
    const blocked = observeConnection(host, typeof url === 'string' || url instanceof URL ? url : null, String(method || 'GET'), 'xhr');
    if (blocked) throw new TypeError('Blocked by Shippie Connection Guard');
    return original.call(this, method, url, ...rest);
  };
}

function patchWebSocket(host: RuntimeConnectionGlobal): void {
  if (typeof host.WebSocket !== 'function') return;
  const Original = host.WebSocket;
  const Wrapped = function WebSocketWrapper(this: unknown, url: string | URL, protocols?: string | string[]) {
    const blocked = observeConnection(host, url, 'GET', 'websocket');
    if (blocked) throw new TypeError('Blocked by Shippie Connection Guard');
    return new Original(url, protocols);
  };
  Object.assign(Wrapped, Original);
  host.WebSocket = Wrapped as unknown as RuntimeConnectionGlobal['WebSocket'];
}

function patchEventSource(host: RuntimeConnectionGlobal): void {
  if (typeof host.EventSource !== 'function') return;
  const Original = host.EventSource;
  const Wrapped = function EventSourceWrapper(this: unknown, url: string | URL, config?: EventSourceInit) {
    const blocked = observeConnection(host, url, 'GET', 'eventsource');
    if (blocked) throw new TypeError('Blocked by Shippie Connection Guard');
    return new Original(url, config);
  };
  Object.assign(Wrapped, Original);
  host.EventSource = Wrapped as unknown as RuntimeConnectionGlobal['EventSource'];
}

function patchBeacon(host: RuntimeConnectionGlobal): void {
  if (!host.navigator || typeof host.navigator.sendBeacon !== 'function') return;
  const original = host.navigator.sendBeacon.bind(host.navigator);
  host.navigator.sendBeacon = (url: string | URL, data?: BodyInit | null) => {
    const blocked = observeConnection(host, url, 'POST', 'beacon');
    if (blocked) return false;
    return original(url, data);
  };
}

function observeConnection(
  host: RuntimeConnectionGlobal,
  rawUrl: string | URL | null,
  method: string,
  surface: RuntimeConnectionRecord['surface'],
): boolean {
  const state = (host as unknown as Record<symbol, MonitorState>)[STATE];
  if (!state?.slug || !rawUrl) return false;
  const url = parseRuntimeUrl(host, rawUrl);
  if (!url || isIgnoredUrl(host, url)) return false;

  const record = classifyConnection(url, method.toUpperCase(), surface);
  persistRecord(host, state, record);
  return record.blocked;
}

function classifyConnection(
  url: URL,
  method: string,
  surface: RuntimeConnectionRecord['surface'],
): RuntimeConnectionRecord {
  const host = url.hostname.toLowerCase();
  const writes = !['GET', 'HEAD'].includes(method);
  const insecure = url.protocol === 'http:' || url.protocol === 'ws:';
  const category = categoryForHost(host);
  const blocked = insecure || category === 'tracker';
  const risk: RuntimeConnectionRecord['risk'] =
    blocked || category === 'external-ai' || writes || surface === 'websocket' ? 'high' : 'medium';

  return {
    host,
    href: `${url.protocol}//${host}`,
    method,
    surface,
    category,
    risk,
    purpose: purposeFor(category, surface),
    data: dataFor(category, writes),
    blocked,
    firstSeenAt: Date.now(),
    lastSeenAt: Date.now(),
    count: 1,
  };
}

function categoryForHost(host: string): RuntimeConnectionRecord['category'] {
  if (EXTERNAL_AI_HOST_RE.test(host)) return 'external-ai';
  if (TRACKER_HOST_RE.test(host)) return 'tracker';
  if (PAYMENT_HOST_RE.test(host)) return 'payment';
  if (WEATHER_HOST_RE.test(host)) return 'weather';
  return 'external';
}

function purposeFor(
  category: RuntimeConnectionRecord['category'],
  surface: RuntimeConnectionRecord['surface'],
): string {
  if (category === 'external-ai') return 'External AI processing';
  if (category === 'tracker') return 'Tracking or advertising';
  if (category === 'payment') return 'Payment provider';
  if (category === 'weather') return 'Weather data';
  if (surface === 'websocket') return 'Live external connection';
  if (surface === 'beacon') return 'External write';
  return 'External service';
}

function dataFor(category: RuntimeConnectionRecord['category'], writes: boolean): string[] {
  if (category === 'external-ai') return ['text', 'images', 'files', 'personal_context'];
  if (category === 'tracker') return ['usage', 'device', 'page_view'];
  if (category === 'payment') return ['payment_context'];
  if (writes) return ['user_data'];
  return ['reference_query'];
}

function persistRecord(
  host: RuntimeConnectionGlobal,
  state: MonitorState,
  record: RuntimeConnectionRecord,
): void {
  const current = readRuntimeConnections(state.slug, host.localStorage);
  const existing = current.find((item) => item.host === record.host && item.surface === record.surface);
  const next = existing
    ? current.map((item) =>
        item === existing
          ? {
              ...item,
              method: record.method,
              risk: strongestRisk(item.risk, record.risk),
              blocked: item.blocked || record.blocked,
              lastSeenAt: record.lastSeenAt,
              count: item.count + 1,
            }
          : item,
      )
    : [record, ...current].slice(0, 40);

  host.__shippie_runtime_connections = next;
  try {
    host.localStorage?.setItem(runtimeConnectionStorageKey(state.slug), JSON.stringify(next));
  } catch {
    /* localStorage can be unavailable; the in-memory copy still helps */
  }

  try {
    const EventCtor = host.CustomEvent;
    if (EventCtor && typeof host.dispatchEvent === 'function') {
      host.dispatchEvent(new EventCtor('shippie:connection-observed', { detail: { ...record, version: state.version ?? null } }));
    }
  } catch {
    /* event dispatch is best-effort */
  }
}

function strongestRisk(a: RuntimeConnectionRecord['risk'], b: RuntimeConnectionRecord['risk']): RuntimeConnectionRecord['risk'] {
  const order = { low: 0, medium: 1, high: 2 };
  return order[b] > order[a] ? b : a;
}

function parseRuntimeUrl(host: RuntimeConnectionGlobal, raw: string | URL): URL | null {
  try {
    return new URL(raw.toString(), host.location?.href ?? 'https://app.local/');
  } catch {
    return null;
  }
}

function isIgnoredUrl(host: RuntimeConnectionGlobal, url: URL): boolean {
  if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) return true;
  if (url.origin === host.location?.origin) return true;
  if (SHIPPIE_HOST_RE.test(url.hostname)) return true;
  return false;
}

function inputToUrl(input: RequestInfo | URL): string | URL | null {
  if (typeof input === 'string' || input instanceof URL) return input;
  if (typeof Request !== 'undefined' && input instanceof Request) return input.url;
  if (typeof input === 'object' && input && 'url' in input) return (input as Request).url;
  return null;
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method;
  if (typeof Request !== 'undefined' && input instanceof Request) return input.method || 'GET';
  if (typeof input === 'object' && input && 'method' in input) return String((input as Request).method || 'GET');
  return 'GET';
}

function isRuntimeConnectionRecord(value: unknown): value is RuntimeConnectionRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as RuntimeConnectionRecord;
  return (
    typeof record.host === 'string' &&
    typeof record.href === 'string' &&
    typeof record.method === 'string' &&
    typeof record.surface === 'string' &&
    typeof record.category === 'string' &&
    typeof record.risk === 'string' &&
    typeof record.purpose === 'string' &&
    Array.isArray(record.data) &&
    typeof record.blocked === 'boolean' &&
    typeof record.firstSeenAt === 'number' &&
    typeof record.lastSeenAt === 'number' &&
    typeof record.count === 'number'
  );
}
