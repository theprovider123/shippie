type AnalyticsPrimitive = string | number | boolean | null;

type AnalyticsProps = Record<string, AnalyticsPrimitive>;

export type ParadeAnalyticsEvent =
  | 'parade_app_opened'
  | 'parade_gps_retry'
  | 'parade_tab_viewed'
  | 'parade_plan_saved'
  | 'parade_plan_share_opened'
  | 'parade_plan_import_saved'
  | 'parade_group_live_connected'
  | 'parade_group_live_member_seen'
  | 'parade_group_signal'
  | 'parade_presence_tapped'
  | 'parade_bus_seen_tapped'
  | 'parade_crowd_reported'
  | 'parade_road_reported'
  | 'parade_food_open_reported'
  | 'parade_toilet_here_reported'
  | 'parade_help_reported'
  | 'parade_sync_qr_opened'
  | 'parade_signal_imported'
  | 'parade_offline_status_checked'
  | 'parade_onboarding_completed'
  | 'parade_onboarding_skipped'
  | 'parade_display_name_saved'
  | 'parade_banter_chant_opened'
  | 'parade_banter_poll_voted'
  | 'parade_banter_trivia_answered'
  | 'parade_offline_auto_saved'
  | 'parade_side_ting_paste_opened'
  | 'parade_side_ting_paste_imported'
  | 'parade_poi_tapped'
  | 'parade_poi_walk_to'
  | 'parade_route_tapped'
  | 'parade_route_walk_to'
  | 'parade_quick_find_used'
  | 'parade_route_pack_updated'
  | 'parade_start_prompt_shown'
  | 'parade_manual_sync_tapped'
  | 'parade_crowd_sync_resume_scheduled'
  | 'parade_crowd_sync_completed'
  | 'parade_crowd_compass_targeted';

type QueuedAnalyticsEvent = {
  event: ParadeAnalyticsEvent;
  props?: AnalyticsProps;
  ts: number;
  session_id: string;
};

type BridgeResponse = {
  protocol?: string;
  id?: string;
  ok?: boolean;
  result?: {
    accepted?: boolean;
    persisted?: boolean;
    reason?: string;
  };
  error?: {
    code?: string;
    message?: string;
  };
};

type FlushResult = 'persisted' | 'retry' | 'drop';

const APP_ID = 'app_parade_companion';
const PROTOCOL = 'shippie.bridge.v1';
const QUEUE_KEY = 'parade-companion:analytics-queue:v1';
const SESSION_KEY = 'parade-companion:analytics-session:v1';
const MAX_QUEUE = 100;
const RETRY_MS = 30_000;

let flushing = false;
let retryTimer: number | null = null;

export function trackParadeAction(event: ParadeAnalyticsEvent, props?: AnalyticsProps): void {
  if (typeof window === 'undefined') return;
  enqueue({ event, props: sanitizeProps(props), ts: Date.now(), session_id: sessionId() });
  void flushParadeAnalytics();
}

export function installParadeAnalyticsFlush(): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const flush = () => void flushParadeAnalytics();
  window.addEventListener('online', flush);
  document.addEventListener('visibilitychange', flush);
  flush();
  return () => {
    window.removeEventListener('online', flush);
    document.removeEventListener('visibilitychange', flush);
    if (retryTimer !== null) window.clearTimeout(retryTimer);
    retryTimer = null;
  };
}

export async function flushParadeAnalytics(): Promise<void> {
  if (flushing || !inContainer()) return;
  flushing = true;
  try {
    const queue = readQueue();
    const remaining: QueuedAnalyticsEvent[] = [];
    for (const event of queue) {
      const result = await sendBridgeAnalytics(event);
      if (result === 'retry') {
        remaining.push(event, ...queue.slice(queue.indexOf(event) + 1));
        break;
      }
    }
    writeQueue(remaining);
    if (remaining.length > 0) scheduleRetry();
  } finally {
    flushing = false;
  }
}

function enqueue(event: QueuedAnalyticsEvent): void {
  writeQueue([...readQueue(), event].slice(-MAX_QUEUE));
}

function readQueue(): QueuedAnalyticsEvent[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isQueuedEvent).slice(-MAX_QUEUE);
  } catch {
    return [];
  }
}

function writeQueue(events: QueuedAnalyticsEvent[]): void {
  try {
    const next = events.filter(isQueuedEvent).slice(-MAX_QUEUE);
    if (next.length === 0) localStorage.removeItem(QUEUE_KEY);
    else localStorage.setItem(QUEUE_KEY, JSON.stringify(next));
  } catch {
    // Analytics must never make the parade tool less reliable.
  }
}

function scheduleRetry(): void {
  if (typeof window === 'undefined' || retryTimer !== null) return;
  retryTimer = window.setTimeout(() => {
    retryTimer = null;
    void flushParadeAnalytics();
  }, RETRY_MS);
}

function sendBridgeAnalytics(event: QueuedAnalyticsEvent): Promise<FlushResult> {
  if (!inContainer()) return Promise.resolve('retry');
  const id = `${APP_ID}_analytics_${event.ts}_${Math.random().toString(36).slice(2, 8)}`;
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener('message', onMessage);
      resolve('retry');
    }, 5_000);

    const finish = (result: FlushResult) => {
      window.clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      resolve(result);
    };

    const onMessage = (message: MessageEvent) => {
      const data = message.data as BridgeResponse | null;
      if (!data || data.protocol !== PROTOCOL || data.id !== id || typeof data.ok !== 'boolean') return;
      if (!data.ok) {
        finish(isPermanentFailure(data.error?.code) ? 'drop' : 'retry');
        return;
      }
      const result = data.result;
      if (result?.persisted === true || result?.accepted === true) {
        finish('persisted');
        return;
      }
      finish(isPermanentFailure(result?.reason) ? 'drop' : 'retry');
    };

    window.addEventListener('message', onMessage);
    window.parent.postMessage(
      {
        protocol: PROTOCOL,
        id,
        appId: APP_ID,
        capability: 'analytics.track',
        method: 'track',
        payload: event,
      },
      '*',
    );
  });
}

function inContainer(): boolean {
  return typeof window !== 'undefined' && window.parent !== window;
}

function sessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const id = `anon_${randomToken()}`;
    sessionStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    return `anon_${randomToken()}`;
  }
}

function randomToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

function sanitizeProps(props: AnalyticsProps | undefined): AnalyticsProps | undefined {
  if (!props) return undefined;
  const clean: AnalyticsProps = {};
  for (const [key, value] of Object.entries(props).slice(0, 12)) {
    if (!/^[a-z0-9_]{1,48}$/.test(key)) continue;
    if (value === null || typeof value === 'boolean' || typeof value === 'number') {
      clean[key] = value;
    } else if (typeof value === 'string') {
      clean[key] = value.slice(0, 80);
    }
  }
  return Object.keys(clean).length > 0 ? clean : undefined;
}

function isQueuedEvent(value: unknown): value is QueuedAnalyticsEvent {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<QueuedAnalyticsEvent>;
  return (
    typeof record.event === 'string' &&
    record.event.startsWith('parade_') &&
    typeof record.ts === 'number' &&
    Number.isFinite(record.ts) &&
    typeof record.session_id === 'string'
  );
}

function isPermanentFailure(reason: string | undefined): boolean {
  return reason === 'invalid_event' || reason === 'arcade_no_tracking' || reason === 'unknown_app';
}
