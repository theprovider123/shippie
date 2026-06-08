export type PlatformDeviceClass = 'mobile' | 'tablet' | 'desktop' | 'unknown';

export type PlatformAnalyticsPulse = {
  rangeDays: number;
  summary: {
    totalApps: number;
    publicApps: number;
    privateApps: number;
    liveApps: number;
    activeApps: number;
    totalEvents: number;
    openEvents: number;
    installAccepts: number;
    anonymousSessions: number;
  };
  deviceSplit: { deviceClass: PlatformDeviceClass; count: number }[];
};

type SummaryRow = PlatformAnalyticsPulse['summary'];
type DeviceSplitRow = { deviceClass: PlatformDeviceClass; count: number };

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

export async function loadPlatformAnalyticsPulse(
  db: D1Database | null | undefined,
  rangeDays = 30,
): Promise<PlatformAnalyticsPulse> {
  if (!db) return emptyPlatformPulse(rangeDays);
  const rangeModifier = `-${rangeDays} days`;

  const [summary, deviceSplit] = await Promise.all([
    db.prepare(
      `
      SELECT
        (SELECT COUNT(*) FROM apps WHERE is_archived = 0) AS totalApps,
        (SELECT COUNT(*) FROM apps WHERE is_archived = 0 AND visibility_scope = 'public') AS publicApps,
        (SELECT COUNT(*) FROM apps WHERE is_archived = 0 AND visibility_scope = 'private') AS privateApps,
        (SELECT COUNT(*) FROM apps WHERE is_archived = 0 AND latest_deploy_status = 'success') AS liveApps,
        (SELECT COUNT(DISTINCT app_id) FROM analytics_events WHERE created_at >= datetime('now', ?)) AS activeApps,
        (SELECT COUNT(*) FROM analytics_events WHERE created_at >= datetime('now', ?)) AS totalEvents,
        (SELECT COUNT(*) FROM analytics_events WHERE created_at >= datetime('now', ?) AND ${OPEN_PREDICATE}) AS openEvents,
        (SELECT COUNT(*) FROM analytics_events WHERE created_at >= datetime('now', ?) AND ${INSTALL_PREDICATE}) AS installAccepts,
        (SELECT COUNT(DISTINCT session_id) FROM analytics_events WHERE created_at >= datetime('now', ?) AND session_id IS NOT NULL AND session_id != '') AS anonymousSessions
      `,
    ).bind(rangeModifier, rangeModifier, rangeModifier, rangeModifier, rangeModifier).first<SummaryRow>(),
    db.prepare(
      `
      SELECT deviceClass, COUNT(*) AS count
      FROM (
        SELECT ${DEVICE_CLASS_EXPR} AS deviceClass
        FROM analytics_events
        WHERE created_at >= datetime('now', ?)
          AND (event_name = 'viewport_mode' OR ${OPEN_PREDICATE})
      )
      GROUP BY deviceClass
      ORDER BY count DESC, deviceClass ASC
      `,
    ).bind(rangeModifier).all<DeviceSplitRow>(),
  ]);

  return {
    rangeDays,
    summary: normalizeSummary(summary),
    deviceSplit: normalizeDeviceRows(deviceSplit.results),
  };
}

export function emptyPlatformPulse(rangeDays = 30): PlatformAnalyticsPulse {
  return {
    rangeDays,
    summary: {
      totalApps: 0,
      publicApps: 0,
      privateApps: 0,
      liveApps: 0,
      activeApps: 0,
      totalEvents: 0,
      openEvents: 0,
      installAccepts: 0,
      anonymousSessions: 0,
    },
    deviceSplit: [],
  };
}

function normalizeSummary(row: SummaryRow | null): SummaryRow {
  const empty = emptyPlatformPulse().summary;
  if (!row) return empty;
  return {
    totalApps: Number(row.totalApps ?? 0),
    publicApps: Number(row.publicApps ?? 0),
    privateApps: Number(row.privateApps ?? 0),
    liveApps: Number(row.liveApps ?? 0),
    activeApps: Number(row.activeApps ?? 0),
    totalEvents: Number(row.totalEvents ?? 0),
    openEvents: Number(row.openEvents ?? 0),
    installAccepts: Number(row.installAccepts ?? 0),
    anonymousSessions: Number(row.anonymousSessions ?? 0),
  };
}

function normalizeDeviceRows(rows: DeviceSplitRow[] | undefined): DeviceSplitRow[] {
  return (rows ?? []).map((row) => ({
    deviceClass: normalizeDeviceClass(row.deviceClass),
    count: Number(row.count ?? 0),
  }));
}

function normalizeDeviceClass(value: string): PlatformDeviceClass {
  if (value === 'mobile' || value === 'tablet' || value === 'desktop') return value;
  return 'unknown';
}
