/**
 * server-code
 *
 * Shippie hosts static bundles only — the runtime Worker serves files
 * and has no compute. If a maker uploads a zip that contains server-side
 * code (an SSR Next.js build, a `.vercel/output/` bundle, Firebase
 * Functions, a Nitro server output, etc.), the deploy would succeed but
 * the app would be broken at runtime.
 *
 * This rule catches that at preflight time and points the maker at wrap
 * mode (`/new` → "Wrap a hosted URL") where they can front a URL that
 * is already hosted with compute somewhere else.
 *
 * Detection cues:
 *   1. Directory patterns in sourceFiles/outputFiles (path-only check,
 *      always runs).
 *   2. package.json scripts (start / build) that imply a server runtime
 *      — requires fileContents to be populated.
 *   3. next.config.* with `output: 'server'` or no explicit `output`
 *      field (Next defaults to server-rendered) — requires fileContents.
 *
 * Severity: blocker on any positive signal.
 */
import type { PreflightFinding, PreflightRule } from '../types.ts';

/** Path prefixes (case-sensitive) that indicate server-side code. */
const SERVER_DIR_PATTERNS: ReadonlyArray<{ pattern: RegExp; label: string }> = [
  { pattern: /(^|\/)\.vercel\/output\//, label: '.vercel/output/ (Vercel build output)' },
  { pattern: /(^|\/)pages\/api\//, label: 'pages/api/ (Next.js Pages Router API routes)' },
  { pattern: /(^|\/)app\/api\//, label: 'app/api/ (Next.js App Router route handlers)' },
  { pattern: /(^|\/)server\//, label: 'server/ (server code directory)' },
  { pattern: /(^|\/)netlify\/functions\//, label: 'netlify/functions/ (Netlify Functions)' },
  { pattern: /(^|\/)functions\//, label: 'functions/ (Firebase/Cloud Functions)' },
  { pattern: /(^|\/)\.output\/server\//, label: '.output/server/ (Nuxt/Nitro server bundle)' },
];

const SERVER_START_PATTERNS: ReadonlyArray<RegExp> = [
  /\bnext\s+start\b/,
  /\bnode\s+server\b/,
  /\bnest\s+start\b/,
  /\bremix-serve\b/,
];

/**
 * Anything that looks like `next.config.js`, `next.config.mjs`,
 * `next.config.ts`, `next.config.cjs`, at the zip root or one level deep.
 */
const NEXT_CONFIG_RE = /(^|\/)next\.config\.(js|mjs|cjs|ts)$/;

function decode(buf: Buffer | undefined): string | null {
  if (!buf) return null;
  try {
    return buf.toString('utf8');
  } catch {
    return null;
  }
}

interface Hit {
  /** Short label that goes into the finding title. */
  label: string;
  /** Example file path (or script command) that triggered the hit. */
  example: string;
}

export const serverCodeRule: PreflightRule = {
  id: 'server-code',
  title: 'No server-side code in static upload',
  run(ctx) {
    const { sourceFiles, outputFiles, fileContents } = ctx.input;
    const hits: Hit[] = [];

    // ------------------------------------------------------------------
    // 1. Directory pattern scan
    // ------------------------------------------------------------------
    const allPaths = new Set<string>([...sourceFiles, ...outputFiles]);
    for (const path of allPaths) {
      for (const { pattern, label } of SERVER_DIR_PATTERNS) {
        if (pattern.test(path)) {
          hits.push({ label, example: path });
          break; // one hit per file is enough
        }
      }
    }

    // ------------------------------------------------------------------
    // 2. package.json heuristics (if contents available)
    // ------------------------------------------------------------------
    if (fileContents) {
      for (const [path, buf] of fileContents) {
        if (!/(^|\/)package\.json$/.test(path)) continue;
        const text = decode(buf);
        if (!text) continue;
        let pkg: unknown;
        try {
          pkg = JSON.parse(text);
        } catch {
          continue;
        }
        if (!pkg || typeof pkg !== 'object') continue;
        const scripts = (pkg as { scripts?: unknown }).scripts;
        if (scripts && typeof scripts === 'object') {
          const start = (scripts as Record<string, unknown>).start;
          const build = (scripts as Record<string, unknown>).build;
          if (typeof start === 'string') {
            for (const re of SERVER_START_PATTERNS) {
              if (re.test(start)) {
                hits.push({
                  label: `package.json scripts.start (${start.trim()})`,
                  example: path,
                });
                break;
              }
            }
          }
          if (typeof build === 'string' && /\bserver\b/.test(build)) {
            // e.g. "build": "tsc && node build-server.js" — soft signal.
            // Only flag if the word "server" appears as its own token AND
            // start didn't already flag (avoid double-reporting).
            hits.push({
              label: `package.json scripts.build mentions server output (${build.trim()})`,
              example: path,
            });
          }
        }
      }

      // ----------------------------------------------------------------
      // 3. next.config.* inspection
      // ----------------------------------------------------------------
      for (const [path, buf] of fileContents) {
        if (!NEXT_CONFIG_RE.test(path)) continue;
        const text = decode(buf);
        if (!text) continue;

        // `output: 'server'` is explicit SSR.
        if (/output\s*:\s*['"`]server['"`]/.test(text)) {
          hits.push({ label: `${path} sets output: 'server'`, example: path });
          continue;
        }

        // If `output: 'export'` or 'standalone' is set, the maker has
        // opted into a non-SSR mode — don't flag.
        if (/output\s*:\s*['"`](export|standalone)['"`]/.test(text)) {
          continue;
        }

        // Otherwise, next.config.* with no `output` field implies
        // Next's default (server-rendered) build.
        if (!/\boutput\s*:/.test(text)) {
          hits.push({
            label: `${path} has no \`output\` field (Next defaults to server-rendered)`,
            example: path,
          });
        }
      }
    }

    if (hits.length === 0) {
      return [{ rule: this.id, severity: 'pass', title: 'No server-side code detected' }];
    }

    // Deduplicate by label so repeated hits from the same pattern collapse.
    const seen = new Map<string, Hit>();
    for (const h of hits) if (!seen.has(h.label)) seen.set(h.label, h);
    const unique = Array.from(seen.values());

    const detected = unique.map((h) => h.label).join('; ');
    const detail =
      `This zip contains server-side code (detected: ${detected}). ` +
      `Shippie hosts static bundles only — it can't run server code at runtime. ` +
      `Use Wrap mode instead: paste your hosted URL at /new ("Wrap a hosted URL") ` +
      `and Shippie will front your existing app as a PWA.`;

    const finding: PreflightFinding = {
      rule: this.id,
      severity: 'block',
      title: `Server-side code detected (${unique.length} signal${unique.length === 1 ? '' : 's'})`,
      detail,
      metadata: {
        signals: unique.map((h) => ({ label: h.label, example: h.example })),
      },
      remediation: {
        kind: 'use-wrap-mode',
        summary:
          'Open /new and choose "Wrap a hosted URL" to front an app that already has compute hosted elsewhere.',
      },
    };

    return [finding];
  },
};
