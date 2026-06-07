import type { PageServerLoad } from './$types';
import { requireAdmin } from '$server/admin/auth';
import { emptyPlatformPulse, loadPlatformAnalyticsPulse } from '$server/analytics/platform-summary';

type SummaryRow = {
  totalEvents: number;
  openEvents: number;
  installAccepts: number;
  activeTools: number;
  anonymousSessions: number;
  proofEvents: number;
  proofDevices: number;
  totalTools: number;
  builders: number;
};

type TopToolRow = {
  slug: string;
  name: string;
  category: string;
  eventCount: number;
  openEvents: number;
  installAccepts: number;
  proofEvents: number;
};

type EventRow = {
  eventName: string;
  count: number;
};

type DailyRow = {
  day: string;
  events: number;
  opens: number;
  installs: number;
};

type KindRow = {
  kind: string;
  count: number;
};

type RecentProofRow = {
  slug: string;
  name: string;
  eventType: string;
  count: number;
  distinctDevices: number;
};

type SpacesSummaryRow = {
  totalSpaces: number;
  activeSpaces: number;
  archivedSpaces: number;
  totalJoinLinks: number;
  activeJoinLinks: number;
  totalClaims: number;
  totalInviteUses: number;
};

const RANGE_MODIFIER = '-30 days';

export const load: PageServerLoad = async (event) => {
  requireAdmin(event);
  const db = event.platform?.env.DB;
  if (!db) {
    return {
      status: 'unavailable' as const,
      rangeDays: 30,
      summary: emptySummary(),
      daily: [] as DailyRow[],
      topTools: [] as TopToolRow[],
      topEvents: [] as EventRow[],
      kinds: [] as KindRow[],
      recentProof: [] as RecentProofRow[],
      spacesSummary: emptySpacesSummary(),
      platformPulse: emptyPlatformPulse(30),
    };
  }

  const [summary, topTools, topEvents, daily, kinds, recentProof, spacesSummary, platformPulse] = await Promise.all([
    db.prepare(
      `
      SELECT
        (SELECT COUNT(*) FROM analytics_events WHERE created_at >= datetime('now', ?)) AS totalEvents,
        (SELECT COUNT(*) FROM analytics_events WHERE created_at >= datetime('now', ?) AND ${openPredicate('event_name')}) AS openEvents,
        (SELECT COUNT(*) FROM analytics_events WHERE created_at >= datetime('now', ?) AND ${installPredicate('event_name')}) AS installAccepts,
        (SELECT COUNT(DISTINCT app_id) FROM analytics_events WHERE created_at >= datetime('now', ?)) AS activeTools,
        (SELECT COUNT(DISTINCT session_id) FROM analytics_events WHERE created_at >= datetime('now', ?) AND session_id IS NOT NULL AND session_id != '') AS anonymousSessions,
        (SELECT COUNT(*) FROM proof_events WHERE ts >= datetime('now', ?)) AS proofEvents,
        (SELECT COUNT(DISTINCT device_hash) FROM proof_events WHERE ts >= datetime('now', ?)) AS proofDevices,
        (SELECT COUNT(*) FROM apps) AS totalTools,
        (SELECT COUNT(*) FROM users WHERE verified_maker = 1 OR first_deploy_at IS NOT NULL) AS builders
      `,
    ).bind(
      RANGE_MODIFIER,
      RANGE_MODIFIER,
      RANGE_MODIFIER,
      RANGE_MODIFIER,
      RANGE_MODIFIER,
      RANGE_MODIFIER,
      RANGE_MODIFIER,
    ).first<SummaryRow>(),
    db.prepare(
      `
      SELECT
        a.slug,
        a.name,
        a.category,
        COUNT(e.id) AS eventCount,
        SUM(CASE WHEN ${openPredicate('e.event_name')} THEN 1 ELSE 0 END) AS openEvents,
        SUM(CASE WHEN ${installPredicate('e.event_name')} THEN 1 ELSE 0 END) AS installAccepts,
        COALESCE(p.proofEvents, 0) AS proofEvents
      FROM apps a
      LEFT JOIN analytics_events e
        ON e.app_id = a.id
       AND e.created_at >= datetime('now', ?)
      LEFT JOIN (
        SELECT app_id, COUNT(*) AS proofEvents
        FROM proof_events
        WHERE ts >= datetime('now', ?)
        GROUP BY app_id
      ) p ON p.app_id = a.id
      GROUP BY a.id, a.slug, a.name, a.category, p.proofEvents
      ORDER BY eventCount DESC, proofEvents DESC, a.created_at DESC
      LIMIT 12
      `,
    ).bind(RANGE_MODIFIER, RANGE_MODIFIER).all<TopToolRow>(),
    db.prepare(
      `
      SELECT event_name AS eventName, COUNT(*) AS count
      FROM analytics_events
      WHERE created_at >= datetime('now', ?)
      GROUP BY event_name
      ORDER BY count DESC, event_name ASC
      LIMIT 12
      `,
    ).bind(RANGE_MODIFIER).all<EventRow>(),
    db.prepare(
      `
      SELECT
        date(created_at) AS day,
        COUNT(*) AS events,
        SUM(CASE WHEN ${openPredicate('event_name')} THEN 1 ELSE 0 END) AS opens,
        SUM(CASE WHEN ${installPredicate('event_name')} THEN 1 ELSE 0 END) AS installs
      FROM analytics_events
      WHERE created_at >= datetime('now', ?)
      GROUP BY date(created_at)
      ORDER BY day ASC
      `,
    ).bind(RANGE_MODIFIER).all<DailyRow>(),
    db.prepare(
      `
      SELECT COALESCE(current_detected_kind, 'unknown') AS kind, COUNT(*) AS count
      FROM apps
      GROUP BY COALESCE(current_detected_kind, 'unknown')
      ORDER BY count DESC
      `,
    ).all<KindRow>(),
    db.prepare(
      `
      SELECT
        a.slug,
        a.name,
        p.event_type AS eventType,
        COUNT(*) AS count,
        COUNT(DISTINCT p.device_hash) AS distinctDevices
      FROM proof_events p
      JOIN apps a ON a.id = p.app_id
      WHERE p.ts >= datetime('now', ?)
      GROUP BY a.id, a.slug, a.name, p.event_type
      ORDER BY count DESC, distinctDevices DESC
      LIMIT 10
      `,
    ).bind(RANGE_MODIFIER).all<RecentProofRow>(),
    db.prepare(
      `
      SELECT
        (SELECT COUNT(*) FROM spaces) AS totalSpaces,
        (SELECT COUNT(*) FROM spaces WHERE status != 'archived') AS activeSpaces,
        (SELECT COUNT(*) FROM spaces WHERE status = 'archived') AS archivedSpaces,
        (SELECT COUNT(*) FROM space_join_tokens) AS totalJoinLinks,
        (SELECT COUNT(*) FROM space_join_tokens WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at > datetime('now'))) AS activeJoinLinks,
        (SELECT COALESCE(SUM(claim_count), 0) FROM space_join_tokens) AS totalClaims,
        (SELECT COALESCE(SUM(used_count), 0) FROM app_invites) AS totalInviteUses
      `,
    ).first<SpacesSummaryRow>(),
    loadPlatformAnalyticsPulse(db, 30),
  ]);

  return {
    status: 'ready' as const,
    rangeDays: 30,
    summary: normalizeSummary(summary),
    topTools: normalizeRows(topTools.results),
    topEvents: normalizeRows(topEvents.results),
    daily: normalizeRows(daily.results),
    kinds: normalizeRows(kinds.results),
    recentProof: normalizeRows(recentProof.results),
    spacesSummary: normalizeSpacesSummary(spacesSummary),
    platformPulse,
  };
};

function openPredicate(column: string): string {
  return `(lower(${column}) LIKE '%open%' OR lower(${column}) LIKE '%launch%')`;
}

function installPredicate(column: string): string {
  return `(lower(${column}) IN ('install_prompt_accepted', 'install_a2hs_accepted') OR lower(${column}) LIKE 'install_%accepted%')`;
}

function normalizeRows<T>(rows: T[] | undefined): T[] {
  return rows ?? [];
}

function normalizeSummary(row: SummaryRow | null): SummaryRow {
  if (!row) return emptySummary();
  return {
    totalEvents: Number(row.totalEvents ?? 0),
    openEvents: Number(row.openEvents ?? 0),
    installAccepts: Number(row.installAccepts ?? 0),
    activeTools: Number(row.activeTools ?? 0),
    anonymousSessions: Number(row.anonymousSessions ?? 0),
    proofEvents: Number(row.proofEvents ?? 0),
    proofDevices: Number(row.proofDevices ?? 0),
    totalTools: Number(row.totalTools ?? 0),
    builders: Number(row.builders ?? 0),
  };
}

function emptySummary(): SummaryRow {
  return {
    totalEvents: 0,
    openEvents: 0,
    installAccepts: 0,
    activeTools: 0,
    anonymousSessions: 0,
    proofEvents: 0,
    proofDevices: 0,
    totalTools: 0,
    builders: 0,
  };
}

function normalizeSpacesSummary(row: SpacesSummaryRow | null): SpacesSummaryRow {
  if (!row) return emptySpacesSummary();
  return {
    totalSpaces: Number(row.totalSpaces ?? 0),
    activeSpaces: Number(row.activeSpaces ?? 0),
    archivedSpaces: Number(row.archivedSpaces ?? 0),
    totalJoinLinks: Number(row.totalJoinLinks ?? 0),
    activeJoinLinks: Number(row.activeJoinLinks ?? 0),
    totalClaims: Number(row.totalClaims ?? 0),
    totalInviteUses: Number(row.totalInviteUses ?? 0),
  };
}

function emptySpacesSummary(): SpacesSummaryRow {
  return {
    totalSpaces: 0,
    activeSpaces: 0,
    archivedSpaces: 0,
    totalJoinLinks: 0,
    activeJoinLinks: 0,
    totalClaims: 0,
    totalInviteUses: 0,
  };
}
