import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { Branding } from '@shippie/cloudlet-contract';
import { apps } from './apps';
import { spaces } from './spaces';

/**
 * private_app_instances — Cloudlet control plane (Uniti Phase 1A).
 *
 * Metadata ONLY. No pupil/school data ever lands here; that lives in each
 * school's isolated SchoolWorkspace Durable Object. This row maps an
 * immutable instance id → the Shippie private app (`app_ref` → apps.id) +
 * the space install record (`space_id` → spaces.id) + the DO that holds
 * the school's data (`workspace_do_id`).
 *
 * `id` is the IMMUTABLE data-boundary identity. The DO is derived from
 * `uniti:${id}` — NEVER from `slug` (slugs are mutable friendly aliases).
 */
export const privateAppInstances = sqliteTable(
  'private_app_instances',
  {
    id: text('id').primaryKey(), // immutable UUID — data-boundary identity
    appId: text('app_id').notNull(),
    appRef: text('app_ref') // → apps.id (private Uniti app)
      .notNull()
      .references(() => apps.id),
    spaceId: text('space_id') // → spaces.id (Shippie install record)
      .notNull()
      .references(() => spaces.id),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    region: text('region').notNull().default('uk'),
    branding: text('branding', { mode: 'json' })
      .notNull()
      .$type<Branding>()
      .default({ displayName: '' }),
    ownerEmail: text('owner_email').notNull(),
    modules: text('modules', { mode: 'json' }).notNull().$type<string[]>().default([]),
    workspaceDoId: text('workspace_do_id').notNull(),
    createdBy: text('created_by'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    index('idx_private_app_instances_app').on(t.appId),
    index('idx_private_app_instances_space').on(t.spaceId),
  ],
);

export type PrivateAppInstanceRow = typeof privateAppInstances.$inferSelect;
export type NewPrivateAppInstanceRow = typeof privateAppInstances.$inferInsert;
