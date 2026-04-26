/**
 * Remix spec extraction — Phase 3 (docs/app-kinds.md).
 *
 * For Cloud apps where Localize blockers preclude source migration,
 * Remix regenerates the app as a Shippie SDK app from intent. This
 * module produces the *intent capture* — the structured input an
 * LLM-driven regenerator (Phase 3b) consumes to rebuild the app.
 *
 * The contract is the load-bearing piece. Even before the LLM rebuild
 * exists, the spec is useful: makers see exactly what the platform
 * understood about their app, and can correct or extend it before
 * triggering a Remix.
 *
 * Pure function. No I/O.
 */

const decoder = new TextDecoder();

export interface RoutePoint {
  path: string;
  /** Source path that defined this route (best-effort). */
  source: string;
  /** Detected framework: 'next' | 'sveltekit' | 'react-router' | 'unknown'. */
  framework: string;
}

export interface SchemaTable {
  /** Detected provider: 'supabase' | 'firebase' | 'indexeddb' | 'unknown'. */
  provider: string;
  /** Best-guess table or store name. */
  name: string;
  /** Source files where this table is referenced. */
  references: string[];
}

export interface FormPoint {
  /** Form input names extracted from the source — the regenerator
   *  uses these as field hints. */
  inputs: string[];
  source: string;
}

export interface ExternalApi {
  host: string;
  /** Where the host literal appeared. */
  references: string[];
}

export interface RemixSpec {
  /** What kind of app the platform thinks this is, post-classification. */
  intentSummary: string;
  routes: RoutePoint[];
  schema: SchemaTable[];
  forms: FormPoint[];
  externalApis: ExternalApi[];
  /** Frameworks / libraries detected — informs the regenerator's stack
   *  choice (the answer is always "Shippie SDK + local SQLite", but
   *  knowing the source helps the regenerator carry over conventions). */
  detectedStack: string[];
  /** Open questions the maker should resolve before triggering Remix. */
  openQuestions: string[];
}

export interface RemixSpecRequest {
  files: ReadonlyMap<string, Uint8Array>;
  /** Optional intent string from the maker — overrides the auto-summary. */
  makerIntent?: string;
}

const NEXT_ROUTE_PATTERN = /^app\/(?:.*\/)?page\.(?:t|j)sx?$/;
const NEXT_API_PATTERN = /^app\/api\/(?:.*\/)?route\.(?:t|j)s$/;
const SVELTEKIT_ROUTE_PATTERN = /^src\/routes\/(?:.*\/)?\+page\.svelte$/;
const SVELTEKIT_SERVER_PATTERN = /^src\/routes\/(?:.*\/)?\+(?:page\.server|server)\.(?:t|j)s$/;
const PAGES_ROUTE_PATTERN = /^(?:src\/)?pages\/.*?\.(?:t|j)sx?$/;

export function extractRemixSpec(req: RemixSpecRequest): RemixSpec {
  const routes: RoutePoint[] = [];
  const schemaSet = new Map<string, SchemaTable>();
  const forms: FormPoint[] = [];
  const externalApis = new Map<string, ExternalApi>();
  const detectedStack = new Set<string>();
  const openQuestions: string[] = [];

  for (const [path, bytes] of req.files) {
    if (NEXT_ROUTE_PATTERN.test(path)) {
      routes.push({ path: routeFromNext(path), source: path, framework: 'next' });
      detectedStack.add('next');
    } else if (NEXT_API_PATTERN.test(path)) {
      routes.push({ path: '/api/' + apiSegment(path), source: path, framework: 'next-api' });
      detectedStack.add('next');
    } else if (SVELTEKIT_ROUTE_PATTERN.test(path)) {
      routes.push({
        path: routeFromSvelteKit(path),
        source: path,
        framework: 'sveltekit',
      });
      detectedStack.add('sveltekit');
    } else if (SVELTEKIT_SERVER_PATTERN.test(path)) {
      detectedStack.add('sveltekit-server-routes');
      openQuestions.push(
        `${path} is a server route; Remix targets a fully-local app — describe what server logic to keep, drop, or replace with Shippie SDK primitives.`,
      );
    } else if (PAGES_ROUTE_PATTERN.test(path)) {
      routes.push({ path: routeFromPages(path), source: path, framework: 'next-pages' });
      detectedStack.add('next-pages');
    }

    if (!isJsTs(path) && !path.endsWith('.svelte')) continue;
    const text = decoder.decode(bytes);

    // Schema — Supabase tables.
    for (const m of text.matchAll(/\.from\s*\(\s*['"]([a-zA-Z0-9_]+)['"]\s*\)/g)) {
      const key = `supabase:${m[1]}`;
      const existing = schemaSet.get(key);
      if (existing) existing.references.push(path);
      else schemaSet.set(key, { provider: 'supabase', name: m[1]!, references: [path] });
    }
    // Schema — Firebase collections.
    for (const m of text.matchAll(/collection\s*\([^,]+,\s*['"]([a-zA-Z0-9_]+)['"]/g)) {
      const key = `firebase:${m[1]}`;
      const existing = schemaSet.get(key);
      if (existing) existing.references.push(path);
      else schemaSet.set(key, { provider: 'firebase', name: m[1]!, references: [path] });
    }
    // Schema — IndexedDB stores.
    for (const m of text.matchAll(/createObjectStore\s*\(\s*['"]([a-zA-Z0-9_]+)['"]/g)) {
      const key = `indexeddb:${m[1]}`;
      const existing = schemaSet.get(key);
      if (existing) existing.references.push(path);
      else schemaSet.set(key, { provider: 'indexeddb', name: m[1]!, references: [path] });
    }

    // Forms — extract input name attributes.
    const formInputs = new Set<string>();
    for (const m of text.matchAll(/name\s*=\s*['"`]([a-zA-Z0-9_-]+)['"`]/g)) {
      formInputs.add(m[1]!);
    }
    if (formInputs.size > 0 && /<form\b/i.test(text)) {
      forms.push({ inputs: [...formInputs].sort(), source: path });
    }

    // External API hosts.
    for (const m of text.matchAll(
      /['"`](https?:\/\/[a-z0-9.-]+\.[a-z]{2,}(?:\/[^'"`\s]*)?)['"`]/gi,
    )) {
      try {
        const host = new URL(m[1]!).host;
        if (host.endsWith('shippie.app') || host.endsWith('shippie.dev')) continue;
        const existing = externalApis.get(host);
        if (existing) {
          if (!existing.references.includes(path)) existing.references.push(path);
        } else {
          externalApis.set(host, { host, references: [path] });
        }
      } catch {
        /* ignore */
      }
    }

    // Stack signals.
    if (text.includes('next-auth') || text.includes('@auth/')) detectedStack.add('authjs');
    if (text.includes('@supabase/supabase-js')) detectedStack.add('supabase');
    if (text.includes('firebase/firestore')) detectedStack.add('firebase');
    if (text.includes('@vercel/postgres')) detectedStack.add('vercel-postgres');
    if (text.includes('@shippie/sdk')) detectedStack.add('shippie-sdk');
    if (text.includes('drizzle-orm')) detectedStack.add('drizzle');
    if (text.includes('prisma')) detectedStack.add('prisma');
  }

  if (schemaSet.size === 0) {
    openQuestions.push('No schema tables detected — Remix needs at least one entity to model. Describe the data the app stores.');
  }
  if (routes.length === 0) {
    openQuestions.push('No routes detected — describe the screens the app should regenerate with.');
  }

  return {
    intentSummary: req.makerIntent?.trim() || 'Auto-generated from source. Edit before triggering Remix.',
    routes,
    schema: [...schemaSet.values()],
    forms,
    externalApis: [...externalApis.values()].sort((a, b) => a.host.localeCompare(b.host)),
    detectedStack: [...detectedStack].sort(),
    openQuestions,
  };
}

function isJsTs(path: string): boolean {
  return (
    path.endsWith('.js') ||
    path.endsWith('.mjs') ||
    path.endsWith('.cjs') ||
    path.endsWith('.ts') ||
    path.endsWith('.tsx') ||
    path.endsWith('.jsx')
  );
}

function routeFromNext(path: string): string {
  // app/page.tsx → /, app/foo/bar/page.tsx → /foo/bar
  const inner = path
    .replace(/^app\//, '')
    .replace(/(?:^|\/)page\.[tj]sx?$/, '');
  return inner === '' ? '/' : '/' + inner;
}

function apiSegment(path: string): string {
  // app/api/foo/route.ts → 'foo'
  return path.replace(/^app\/api\//, '').replace(/\/route\.[tj]s$/, '');
}

function routeFromSvelteKit(path: string): string {
  // src/routes/+page.svelte → /, src/routes/foo/+page.svelte → /foo
  const inner = path
    .replace(/^src\/routes\//, '')
    .replace(/(?:^|\/)\+page\.svelte$/, '');
  return inner === '' ? '/' : '/' + inner;
}

function routeFromPages(path: string): string {
  // src/pages/foo/index.tsx → /foo, src/pages/foo.tsx → /foo
  const inner = path
    .replace(/^(?:src\/)?pages\//, '')
    .replace(/\/index\.[tj]sx?$/, '')
    .replace(/\.[tj]sx?$/, '');
  return inner === '' ? '/' : '/' + inner;
}
