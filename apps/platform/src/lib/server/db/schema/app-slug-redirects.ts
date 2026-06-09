import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const appSlugRedirects = sqliteTable(
  'app_slug_redirects',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    oldSlug: text('old_slug').notNull(),
    newSlug: text('new_slug').notNull(),
    expiresAt: text('expires_at').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
  },
  (t) => [index('app_slug_redirects_old_slug_idx').on(t.oldSlug)],
);

export type AppSlugRedirect = typeof appSlugRedirects.$inferSelect;
export type NewAppSlugRedirect = typeof appSlugRedirects.$inferInsert;
