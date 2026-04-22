/**
 * POST /api/deploy/functions
 *
 * Upload a Shippie Function for an app. Accepts TypeScript or JS source,
 * bundles it with esbuild into a single CommonJS file, stores the bundle
 * in R2, and upserts a function_deployments row.
 *
 * Request (JSON):
 *   { slug, name, source, allowed_domains?, env_schema? }
 *
 * Spec v6 §1.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import * as esbuild from 'esbuild';
import { schema } from '@shippie/db';
import { DevR2, getDevR2AppsDir } from '@shippie/dev-storage';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { parseBody } from '@/lib/internal/validation';
import { checkRateLimit, rateLimited } from '@/lib/rate-limit';
import { withLogger } from '@/lib/observability/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DeployFunctionSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1).regex(/^[a-z0-9][a-z0-9-/]*$/, 'invalid_name'),
  source: z.string().min(1).max(500_000),
  allowed_domains: z.array(z.string()).optional(),
  env_schema: z
    .record(
      z.string(),
      z.object({ required: z.boolean().optional(), secret: z.boolean().optional() }),
    )
    .optional(),
});

export const POST = withLogger('deploy.functions', async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const rl = checkRateLimit({
    key: `deploy-functions:${session.user.id}`,
    limit: 10,
    windowMs: 60_000,
  });
  if (!rl.ok) return rateLimited(rl);

  const parsed = await parseBody(req, DeployFunctionSchema);
  if (!parsed.ok) return parsed.response;
  const { slug, name, source } = parsed.data;
  const allowedDomains = parsed.data.allowed_domains ?? [];
  const envSchema = parsed.data.env_schema ?? {};

  const db = await getDb();
  const app = await db.query.apps.findFirst({ where: eq(schema.apps.slug, slug) });
  if (!app) return NextResponse.json({ error: 'app_not_found' }, { status: 404 });
  if (app.makerId !== session.user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // Allowlisted npm packages the platform has pre-installed and lets
  // user functions import. Expand this list as demand warrants —
  // every package here gets bundled into the user's compiled output.
  const ALLOWED_PACKAGES = new Set([
    'zod',
    'nanoid',
    'date-fns',
  ]);

  // Bundle the user source with esbuild. Resolves from the web app's
  // own node_modules, but only for allowlisted packages. Any other
  // import is rejected at bundle time.
  let bundledCode: string;
  try {
    const result = await esbuild.build({
      stdin: {
        contents: source,
        resolveDir: process.cwd(),
        sourcefile: `${name}.ts`,
        loader: 'ts',
      },
      bundle: true,
      format: 'cjs',
      platform: 'neutral',
      target: 'es2022',
      write: false,
      minify: false,
      mainFields: ['module', 'main'],
      plugins: [
        {
          name: 'shippie-allowlist',
          setup(build) {
            // Only gate top-level bare specifiers from user code.
            // Relative imports inside node_modules (e.g. zod importing
            // its own internal files) must pass through.
            build.onResolve({ filter: /^[^./]/ }, (args) => {
              if (args.kind === 'entry-point') return null;
              // If the importer is already inside node_modules, this is
              // an internal package import — let esbuild resolve it.
              if (args.importer?.includes('node_modules')) return null;
              const topLevel = args.path.startsWith('@')
                ? args.path.split('/').slice(0, 2).join('/')
                : args.path.split('/')[0]!;
              if (!ALLOWED_PACKAGES.has(topLevel)) {
                return {
                  errors: [
                    {
                      text: `Package "${topLevel}" is not on the Shippie Functions allowlist. Allowed: ${[...ALLOWED_PACKAGES].join(', ')}`,
                    },
                  ],
                };
              }
              return null;
            });
          },
        },
      ],
      logLevel: 'silent',
    });
    bundledCode = result.outputFiles[0]!.text;
  } catch (err) {
    return NextResponse.json(
      { error: 'bundle_failed', message: (err as Error).message },
      { status: 400 },
    );
  }

  const bundleHash = createHash('sha256').update(bundledCode).digest('hex');
  const r2Key = `apps/${slug}/functions/${name}/${bundleHash}.cjs`;

  const r2 = new DevR2(getDevR2AppsDir());
  await r2.put(r2Key, new TextEncoder().encode(bundledCode));

  await db
    .insert(schema.functionDeployments)
    .values({
      appId: app.id,
      name,
      bundleHash,
      bundleR2Key: r2Key,
      allowedDomains,
      envSchema,
    })
    .onConflictDoUpdate({
      target: [schema.functionDeployments.appId, schema.functionDeployments.name],
      set: {
        bundleHash,
        bundleR2Key: r2Key,
        allowedDomains,
        envSchema,
        deployedAt: new Date(),
      },
    });

  return NextResponse.json({
    success: true,
    slug,
    name,
    bundle_hash: bundleHash,
    bundle_size: bundledCode.length,
  });
});
