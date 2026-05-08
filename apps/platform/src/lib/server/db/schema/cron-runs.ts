import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const cronRuns = sqliteTable(
  'cron_runs',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    cronString: text('cron_string').notNull(),
    handler: text('handler').notNull(),
    startedAt: text('started_at').default(sql`(datetime('now'))`).notNull(),
    finishedAt: text('finished_at'),
    status: text('status').default('running').notNull(),
    errorMessage: text('error_message'),
    itemsProcessed: integer('items_processed'),
  },
  (t) => [index('cron_runs_handler_started_idx').on(t.handler, t.startedAt)],
);

export type CronRun = typeof cronRuns.$inferSelect;
export type NewCronRun = typeof cronRuns.$inferInsert;
