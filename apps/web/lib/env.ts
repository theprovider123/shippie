/**
 * Typed env gate for apps/web.
 *
 * Parses `process.env` once at module load and throws if required
 * values are missing or malformed. Importing files get a validated,
 * narrowly-typed `env` object — no more `process.env.X ?? ''` guesswork
 * scattered across route handlers.
 *
 * The Worker has its own contract at services/worker/src/env.ts; this
 * mirrors that discipline for the platform side.
 *
 * Migration: new code should import from here. Existing routes continue
 * to read `process.env.*` directly until they're touched — no big-bang
 * rewrite needed for the guarantee to be useful. The guarantee is
 * "missing env crashes at boot, not at first request."
 */
import { z } from 'zod';

const BooleanFlag = z
  .union([z.literal('true'), z.literal('false'), z.literal('1'), z.literal('0'), z.undefined()])
  .transform((v) => v === 'true' || v === '1');

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Platform
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  SHIPPIE_BASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  NEXTAUTH_URL: z.string().url().optional(),

  // Auth
  AUTH_EMAIL_FROM: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  ADMIN_EMAILS: z.string().optional(),

  // Worker <-> platform signed requests (shared secret)
  WORKER_PLATFORM_SECRET: z
    .string()
    .min(16, 'WORKER_PLATFORM_SECRET must be at least 16 chars'),

  // GitHub App (optional — only required if the GitHub path is enabled)
  GITHUB_APP_ID: z.string().optional(),
  GITHUB_APP_PRIVATE_KEY: z.string().optional(),
  GITHUB_APP_WEBHOOK_SECRET: z.string().optional(),
  GITHUB_APP_SLUG: z.string().optional(),

  // Internal cron auth
  SHIPPIE_INTERNAL_CRON_TOKEN: z.string().optional(),

  // Functions
  FUNCTIONS_MASTER_KEY: z.string().optional(),

  // Trial deploy hashing
  TRIAL_IP_SALT: z.string().optional(),

  // Dev + self-host toggles
  SHIPPIE_WORKER_PORT: z.string().optional(),
  SHIPPIE_PUBLIC_URL_TEMPLATE: z.string().optional(),
  SHIPPIE_ALLOW_UNSANDBOXED_BUILDS: BooleanFlag,
  SHIPPIE_STRIP_DEV_ROUTES: BooleanFlag,
  ENABLE_SCREENSHOTS: BooleanFlag,

  // Vercel build-time
  VERCEL: z.string().optional(),
  VERCEL_GIT_COMMIT_SHA: z.string().optional(),
  VERCEL_REGION: z.string().optional(),
});

function parseEnv(): z.infer<typeof EnvSchema> {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(
      `Environment validation failed. Check apps/web/.env.local:\n${issues}`,
    );
  }
  return result.data;
}

export const env = parseEnv();

export function assertGithubAppConfigured(): void {
  if (!env.GITHUB_APP_ID || !env.GITHUB_APP_PRIVATE_KEY) {
    throw new Error(
      'GitHub App path requires GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY',
    );
  }
}
