export interface FeedbackLogItem {
  id: string;
  appSlug: string;
  appName: string;
  type: string;
  status: string;
  rating: number | null;
  title: string | null;
  body: string | null;
  voteCount: number;
  createdAt: string;
}

export interface UsageLogItem {
  appSlug: string;
  appName: string;
  day: string;
  eventType: string;
  count: number;
}

export interface FunctionLogItem {
  id: string;
  appSlug: string;
  appName: string;
  functionName: string;
  method: string;
  status: number | null;
  durationMs: number | null;
  error: string | null;
  createdAt: string;
}

export interface LogsResult {
  feedback: FeedbackLogItem[];
  usage: UsageLogItem[];
  functions: FunctionLogItem[];
}

export interface LogsOptions {
  slug?: string;
  limit?: number;
}

interface InternalCtx {
  apiUrl: string;
  token: string | null;
  fetchImpl?: typeof fetch;
}

interface LogsResponse {
  feedback?: unknown[];
  usage?: unknown[];
  functions?: unknown[];
}

export async function fetchLogs(ctx: InternalCtx, opts: LogsOptions = {}): Promise<LogsResult> {
  if (!ctx.token) {
    throw new Error('no_auth_token');
  }

  const fetchImpl = ctx.fetchImpl ?? fetch;
  const url = new URL(`${ctx.apiUrl.replace(/\/$/, '')}/api/logs`);
  if (opts.slug) url.searchParams.set('slug', opts.slug);
  if (opts.limit != null) url.searchParams.set('limit', String(opts.limit));

  const res = await fetchImpl(url.href, {
    headers: { authorization: `Bearer ${ctx.token}` },
  });

  if (res.status === 401) throw new Error('unauthenticated');
  if (!res.ok) throw new Error(`logs_failed:${res.status}`);

  const body = (await res.json()) as LogsResponse;
  return {
    feedback: (body.feedback ?? []).map(normalizeFeedback).filter(isPresent),
    usage: (body.usage ?? []).map(normalizeUsage).filter(isPresent),
    functions: (body.functions ?? []).map(normalizeFunctionLog).filter(isPresent),
  };
}

function normalizeFeedback(value: unknown): FeedbackLogItem | null {
  if (!isRecord(value)) return null;
  const appSlug = stringProp(value, 'app_slug') ?? stringProp(value, 'appSlug');
  const appName = stringProp(value, 'app_name') ?? stringProp(value, 'appName');
  const createdAt = stringProp(value, 'created_at') ?? stringProp(value, 'createdAt');
  const voteCount = numberProp(value, 'vote_count') ?? numberProp(value, 'voteCount') ?? 0;
  if (!stringProp(value, 'id') || !appSlug || !appName || !stringProp(value, 'type') || !stringProp(value, 'status') || !createdAt) {
    return null;
  }
  return {
    id: stringProp(value, 'id')!,
    appSlug,
    appName,
    type: stringProp(value, 'type')!,
    status: stringProp(value, 'status')!,
    rating: nullableNumber(value.rating),
    title: nullableString(value.title),
    body: nullableString(value.body),
    voteCount,
    createdAt,
  };
}

function normalizeUsage(value: unknown): UsageLogItem | null {
  if (!isRecord(value)) return null;
  const appSlug = stringProp(value, 'app_slug') ?? stringProp(value, 'appSlug');
  const appName = stringProp(value, 'app_name') ?? stringProp(value, 'appName');
  const eventType = stringProp(value, 'event_type') ?? stringProp(value, 'eventType');
  const count = numberProp(value, 'count');
  if (!appSlug || !appName || !stringProp(value, 'day') || !eventType || count == null) return null;
  return {
    appSlug,
    appName,
    day: stringProp(value, 'day')!,
    eventType,
    count,
  };
}

function normalizeFunctionLog(value: unknown): FunctionLogItem | null {
  if (!isRecord(value)) return null;
  const appSlug = stringProp(value, 'app_slug') ?? stringProp(value, 'appSlug');
  const appName = stringProp(value, 'app_name') ?? stringProp(value, 'appName');
  const functionName = stringProp(value, 'function_name') ?? stringProp(value, 'functionName');
  const durationMs = numberProp(value, 'duration_ms') ?? numberProp(value, 'durationMs') ?? null;
  const createdAt = stringProp(value, 'created_at') ?? stringProp(value, 'createdAt');
  if (!stringProp(value, 'id') || !appSlug || !appName || !functionName || !stringProp(value, 'method') || !createdAt) {
    return null;
  }
  return {
    id: stringProp(value, 'id')!,
    appSlug,
    appName,
    functionName,
    method: stringProp(value, 'method')!,
    status: nullableNumber(value.status),
    durationMs,
    error: nullableString(value.error),
    createdAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringProp(value: Record<string, unknown>, key: string): string | undefined {
  return typeof value[key] === 'string' ? value[key] : undefined;
}

function numberProp(value: Record<string, unknown>, key: string): number | undefined {
  return typeof value[key] === 'number' && Number.isFinite(value[key]) ? value[key] : undefined;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}
