import type { PageServerLoad } from './$types';

type SummaryRow = {
  totalEvents: number;
  openEvents: number;
  installAccepts: number;
  anonymousSessions: number;
  activeDays: number;
  latestAt: string | null;
};

type DailyRow = {
  day: string;
  events: number;
  opens: number;
};

type EventMixRow = {
  eventName: string;
  count: number;
};

type DeviceSplitRow = {
  deviceClass: 'mobile' | 'tablet' | 'desktop' | 'unknown';
  count: number;
};

const RANGE_DAYS = 30;
const RANGE_MODIFIER = `-${RANGE_DAYS} days`;

const OPEN_PREDICATE = `(lower(event_name) LIKE '%open%' OR lower(event_name) LIKE '%launch%')`;
const INSTALL_PREDICATE = `(lower(event_name) IN ('install_prompt_accepted', 'install_a2hs_accepted') OR lower(event_name) LIKE 'install_%accepted%')`;
const DEVICE_CLASS_EXPR = `
  CASE
    WHEN properties IS NOT NULL AND json_valid(properties) THEN
      CASE
        WHEN lower(COALESCE(
          json_extract(properties, '$.device_class'),
          json_extract(properties, '$.deviceClass'),
          json_extract(properties, '$.mode'),
          'unknown'
        )) IN ('mobile', 'tablet', 'desktop')
        THEN lower(COALESCE(
          json_extract(properties, '$.device_class'),
          json_extract(properties, '$.deviceClass'),
          json_extract(properties, '$.mode'),
          'unknown'
        ))
        ELSE 'unknown'
      END
    ELSE 'unknown'
  END
`;

export const load: PageServerLoad = async ({ parent, platform }) => {
  const { app } = await parent();

  if (!platform?.env.DB) {
    return {
      analytics: {
        rangeDays: RANGE_DAYS,
        summary: emptySummary(),
        daily: [] as DailyRow[],
        eventMix: [] as EventMixRow[],
        deviceSplit: [] as DeviceSplitRow[],
        health: 'unavailable' as const,
      },
    };
  }

  const db = platform.env.DB;
  const [summary, daily, eventMix, deviceSplit] = await Promise.all([
    db.prepare(
      `
      SELECT
        COUNT(*) AS totalEvents,
        SUM(CASE WHEN ${OPEN_PREDICATE} THEN 1 ELSE 0 END) AS openEvents,
        SUM(CASE WHEN ${INSTALL_PREDICATE} THEN 1 ELSE 0 END) AS installAccepts,
        COUNT(DISTINCT CASE WHEN session_id IS NOT NULL AND session_id != '' THEN session_id END) AS anonymousSessions,
        COUNT(DISTINCT date(created_at)) AS activeDays,
        MAX(created_at) AS latestAt
      FROM analytics_events
      WHERE app_id = ? AND created_at >= datetime('now', ?)
      `,
    ).bind(app.id, RANGE_MODIFIER).first<SummaryRow>(),
    db.prepare(
      `
      SELECT
        date(created_at) AS day,
        COUNT(*) AS events,
        SUM(CASE WHEN ${OPEN_PREDICATE} THEN 1 ELSE 0 END) AS opens
      FROM analytics_events
      WHERE app_id = ? AND created_at >= datetime('now', ?)
      GROUP BY date(created_at)
      ORDER BY day ASC
      `,
    ).bind(app.id, RANGE_MODIFIER).all<DailyRow>(),
    db.prepare(
      `
      SELECT event_name AS eventName, COUNT(*) AS count
      FROM analytics_events
      WHERE app_id = ? AND created_at >= datetime('now', ?)
      GROUP BY event_name
      ORDER BY count DESC, event_name ASC
      LIMIT 8
      `,
    ).bind(app.id, RANGE_MODIFIER).all<EventMixRow>(),
    db.prepare(
      `
      SELECT deviceClass, COUNT(*) AS count
      FROM (
        SELECT ${DEVICE_CLASS_EXPR} AS deviceClass
        FROM analytics_events
        WHERE app_id = ?
          AND created_at >= datetime('now', ?)
          AND ${OPEN_PREDICATE}
      )
      GROUP BY deviceClass
      ORDER BY count DESC, deviceClass ASC
      `,
    ).bind(app.id, RANGE_MODIFIER).all<DeviceSplitRow>(),
  ]);

  const normalizedSummary = normalizeSummary(summary);

  return {
    analytics: {
      rangeDays: RANGE_DAYS,
      summary: normalizedSummary,
      daily: normalizeDailyRows(daily.results),
      eventMix: normalizeEventRows(eventMix.results),
      deviceSplit: normalizeDeviceRows(deviceSplit.results),
      health: normalizedSummary.totalEvents > 0 ? ('receiving' as const) : ('waiting' as const),
    },
  };
};

function normalizeSummary(row: SummaryRow | null): SummaryRow {
  if (!row) return emptySummary();
  return {
    totalEvents: Number(row.totalEvents ?? 0),
    openEvents: Number(row.openEvents ?? 0),
    installAccepts: Number(row.installAccepts ?? 0),
    anonymousSessions: Number(row.anonymousSessions ?? 0),
    activeDays: Number(row.activeDays ?? 0),
    latestAt: row.latestAt ?? null,
  };
}

function emptySummary(): SummaryRow {
  return {
    totalEvents: 0,
    openEvents: 0,
    installAccepts: 0,
    anonymousSessions: 0,
    activeDays: 0,
    latestAt: null,
  };
}

function normalizeDailyRows(rows: DailyRow[] | undefined): DailyRow[] {
  return (rows ?? []).map((row) => ({
    day: row.day,
    events: Number(row.events ?? 0),
    opens: Number(row.opens ?? 0),
  }));
}

function normalizeEventRows(rows: EventMixRow[] | undefined): EventMixRow[] {
  return (rows ?? []).map((row) => ({
    eventName: row.eventName,
    count: Number(row.count ?? 0),
  }));
}

function normalizeDeviceRows(rows: DeviceSplitRow[] | undefined): DeviceSplitRow[] {
  return (rows ?? []).map((row) => ({
    deviceClass: normalizeDeviceClass(row.deviceClass),
    count: Number(row.count ?? 0),
  }));
}

function normalizeDeviceClass(value: string): DeviceSplitRow['deviceClass'] {
  if (value === 'mobile' || value === 'tablet' || value === 'desktop') return value;
  return 'unknown';
}
