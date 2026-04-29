import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { users } from './users';

/**
 * Phase 6 — venue infrastructure.
 *
 * A venue is a physical place running one or more Shippie Hubs (e.g.
 * stage, food court, info booth). Sessions are time-bounded events —
 * a quiz night, a festival day, a school assembly. The Hub federation
 * primitive (services/hub/src/federation.ts) syncs the catalogue
 * across every Hub belonging to the venue; this table is the source
 * of truth for the venue's identity, organiser, and active session.
 */
export const venues = sqliteTable(
  'venues',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    organiserUserId: text('organiser_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Hub id elected as primary by the venue's federation mesh. */
    primaryHubId: text('primary_hub_id'),
    status: text('status').default('draft').notNull(),
    createdAt: text('created_at').default(sql`(datetime('now'))`).notNull(),
    updatedAt: text('updated_at').default(sql`(datetime('now'))`).notNull(),
  },
  (t) => [
    uniqueIndex('venues_slug_unique').on(t.slug),
    index('venues_status_idx').on(t.status),
  ],
);

export type Venue = typeof venues.$inferSelect;
export type NewVenue = typeof venues.$inferInsert;

export type VenueStatus = 'draft' | 'live' | 'paused' | 'archived';

/**
 * Hubs belonging to a venue. priority_rank drives the venue-mesh
 * arbitration (lower = preferred primary). Hubs heartbeat to the
 * platform; if a Hub goes silent for 60s the platform considers it
 * failed and clients route to the next-ranked Hub.
 */
export const venueHubs = sqliteTable(
  'venue_hubs',
  {
    venueId: text('venue_id')
      .notNull()
      .references(() => venues.id, { onDelete: 'cascade' }),
    hubId: text('hub_id').notNull(),
    url: text('url').notNull(),
    priorityRank: integer('priority_rank').default(100).notNull(),
    lastHeartbeatAt: text('last_heartbeat_at'),
    registeredAt: text('registered_at').default(sql`(datetime('now'))`).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.venueId, t.hubId] }),
    index('venue_hubs_venue_idx').on(t.venueId),
    index('venue_hubs_heartbeat_idx').on(t.lastHeartbeatAt),
  ],
);

export type VenueHub = typeof venueHubs.$inferSelect;
export type NewVenueHub = typeof venueHubs.$inferInsert;

/**
 * Time-bounded events at a venue. Sessions can pre-register an
 * estimated attendee count so the federation primitive can pre-warm
 * Hub caches.
 */
export const venueSessions = sqliteTable(
  'venue_sessions',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    venueId: text('venue_id')
      .notNull()
      .references(() => venues.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    startsAt: text('starts_at').notNull(),
    endsAt: text('ends_at'),
    attendeeCountEstimate: integer('attendee_count_estimate'),
    status: text('status').default('scheduled').notNull(),
    createdAt: text('created_at').default(sql`(datetime('now'))`).notNull(),
  },
  (t) => [
    index('venue_sessions_venue_idx').on(t.venueId),
    index('venue_sessions_starts_idx').on(t.startsAt),
  ],
);

export type VenueSession = typeof venueSessions.$inferSelect;
export type NewVenueSession = typeof venueSessions.$inferInsert;
export type VenueSessionStatus = 'scheduled' | 'live' | 'ended' | 'cancelled';
