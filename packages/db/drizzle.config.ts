import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Kit configuration for the Shippie Postgres database.
 *
 * Migrations live in ./migrations/ as raw SQL files (numbered 0001+).
 * Schema TypeScript files live in ./src/schema/.
 *
 * In production the database lives on Hetzner behind a Cloudflare Tunnel.
 * For local development point DATABASE_URL at a local Postgres or a Neon
 * dev branch.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://localhost:5432/shippie_dev',
  },
  verbose: true,
  strict: true,
  migrations: {
    table: '__shippie_migrations',
    schema: 'public',
  },
});
