/**
 * Auth.js v5 configuration for Shippie's control plane.
 *
 * Highlights:
 *   - Database sessions via Drizzle adapter pointing at Shippie's own
 *     users/accounts/sessions/verification_tokens tables
 *   - PGlite backend in dev, Hetzner Postgres in production
 *   - Dev email provider that console-logs magic links (zero SMTP)
 *   - GitHub/Google/Apple providers wired but no-op when env vars absent
 *   - `auth()` helper exported for Server Components and Route Handlers
 *
 * Spec v6 §6 (auth architecture), §18.4 (auth tables).
 *
 * ## On top-level await + HMR
 *
 * This file uses `await resolveAdapter()` at module top-level so that
 * Auth.js receives a fully-constructed Adapter object at config time
 * (the adapter must be introspectable — a lazy Proxy breaks the
 * `assertConfig` check inside @auth/core).
 *
 * The `globalThis.__shippieDbHandle` cache in ../db.ts ensures HMR
 * reloads reuse the same PGlite WASM instance instead of spawning a
 * fresh one on every change, which previously caused WASM runtime
 * aborts from accumulated instances.
 */
import NextAuth from 'next-auth';
import type { NextAuthConfig } from 'next-auth';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { schema } from '@shippie/db';
import { emailProvider } from './dev-email-provider.ts';
import { getDb } from '../db.ts';

declare global {
  // eslint-disable-next-line no-var
  var __shippieAuthAdapter: Promise<ReturnType<typeof DrizzleAdapter>> | undefined;
}

function resolveAdapter() {
  if (!globalThis.__shippieAuthAdapter) {
    globalThis.__shippieAuthAdapter = (async () => {
      const db = await getDb();
      return DrizzleAdapter(db, {
        usersTable: schema.users,
        accountsTable: schema.accounts,
        sessionsTable: schema.sessions,
        verificationTokensTable: schema.verificationTokens,
      });
    })();
  }
  return globalThis.__shippieAuthAdapter;
}

const adapter = await resolveAdapter();

export const authConfig = {
  adapter,
  session: {
    strategy: 'database',
    maxAge: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60, // refresh cookie once per day
  },
  pages: {
    signIn: '/auth/signin',
    verifyRequest: '/auth/verify-request',
    error: '/auth/error',
  },
  providers: [
    emailProvider(),
    // Week 6+: add GitHub/Google/Apple providers here, gated by env.
  ],
  callbacks: {
    async session({ session, user }) {
      // Expose user id on the session for server components
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;

const nextAuthResult = NextAuth(authConfig);

export const { auth, signIn, signOut } = nextAuthResult;
export const GET = nextAuthResult.handlers.GET;
export const POST = nextAuthResult.handlers.POST;
