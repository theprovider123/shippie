/**
 * Framework + package-manager detection.
 *
 * Given a set of source file paths and (optionally) a parsed
 * package.json, return a best-guess framework + default build config.
 * This runs before preflight so the preview card in /new can show
 * "We think this is a Vite SPA" to the maker.
 *
 * Spec v6 §10.5.
 */

export interface DetectedFramework {
  framework: string;
  packageManager?: 'npm' | 'pnpm' | 'yarn' | 'bun';
  buildCommand?: string;
  installCommand?: string;
  outputDir?: string;
  /** "app" | "web_app" | "website" inferred from the framework. */
  suggestedType: 'app' | 'web_app' | 'website';
  /** Confidence 0-1; the UI can show lower-confidence matches as "we think...". */
  confidence: number;
  notes?: string[];
  /** Monorepo tool detected at the repo root, if any. */
  monorepo?: 'pnpm-workspace' | 'turbo' | 'nx' | 'lerna' | 'npm-workspaces';
  /** AI-tool templates that shipped this project. */
  aiTool?: 'bolt' | 'lovable' | 'v0' | 'cursor' | 'shadcn';
}

export interface DetectInput {
  files: readonly string[];
  packageJson?: {
    name?: string;
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
}

const FILE_SETS = {
  vite: ['vite.config.ts', 'vite.config.js', 'vite.config.mjs', 'vite.config.cjs'],
  next: ['next.config.ts', 'next.config.js', 'next.config.mjs'],
  astro: ['astro.config.ts', 'astro.config.js', 'astro.config.mjs'],
  nuxt: ['nuxt.config.ts', 'nuxt.config.js'],
  sveltekit: ['svelte.config.js', 'svelte.config.ts'],
  solidstart: ['solid.config.ts', 'solid.config.js'],
  remix: ['remix.config.js', 'remix.config.mjs'],
  jekyll: ['_config.yml', '_config.yaml'],
  hugo: ['config.toml', 'hugo.toml'],
};

export function detectFramework(input: DetectInput): DetectedFramework {
  const { files, packageJson } = input;
  const fileSet = new Set(files);
  const deps = { ...packageJson?.dependencies, ...packageJson?.devDependencies };

  const packageManager = detectPackageManager(fileSet);
  const monorepo = detectMonorepo(fileSet, packageJson);
  const aiTool = detectAiTool(fileSet);

  const result = detectFrameworkInner(input, packageManager);
  if (monorepo) result.monorepo = monorepo;
  if (aiTool) result.aiTool = aiTool;
  if (monorepo || aiTool) {
    const notes = result.notes ?? [];
    if (monorepo) notes.push(`Monorepo detected: ${monorepo}. Set shippie.json.build.root_directory if the app lives in a subdir.`);
    if (aiTool) notes.push(`AI-tool template detected: ${aiTool}.`);
    result.notes = notes;
  }
  return result;
}

function detectFrameworkInner(input: DetectInput, packageManager: ReturnType<typeof detectPackageManager>): DetectedFramework {
  const { files, packageJson } = input;
  const fileSet = new Set(files);
  const deps = { ...packageJson?.dependencies, ...packageJson?.devDependencies };

  // Pure HTML at root — no build step
  if (fileSet.has('index.html') && !packageJson) {
    return {
      framework: 'static-html',
      packageManager,
      outputDir: '.',
      suggestedType: 'website',
      confidence: 0.9,
    };
  }

  // Vite
  if (FILE_SETS.vite.some((f) => fileSet.has(f)) || deps?.vite) {
    return {
      framework: 'vite',
      packageManager,
      buildCommand: buildScript(packageJson, 'build'),
      installCommand: defaultInstall(packageManager),
      outputDir: 'dist',
      suggestedType: inferTypeFromDeps(deps, 'app'),
      confidence: 0.95,
    };
  }

  // Next.js (static export)
  if (FILE_SETS.next.some((f) => fileSet.has(f)) || deps?.next) {
    return {
      framework: 'next',
      packageManager,
      buildCommand: buildScript(packageJson, 'build'),
      installCommand: defaultInstall(packageManager),
      outputDir: 'out',
      suggestedType: 'app',
      confidence: 0.85,
      notes: ['Ensure next.config.js has `output: "export"` for static sites.'],
    };
  }

  // Astro
  if (FILE_SETS.astro.some((f) => fileSet.has(f)) || deps?.astro) {
    return {
      framework: 'astro',
      packageManager,
      buildCommand: buildScript(packageJson, 'build'),
      installCommand: defaultInstall(packageManager),
      outputDir: 'dist',
      suggestedType: 'website',
      confidence: 0.95,
    };
  }

  // Nuxt (generate)
  if (FILE_SETS.nuxt.some((f) => fileSet.has(f)) || deps?.nuxt) {
    return {
      framework: 'nuxt',
      packageManager,
      buildCommand: buildScript(packageJson, 'generate') ?? 'nuxt generate',
      installCommand: defaultInstall(packageManager),
      outputDir: '.output/public',
      suggestedType: 'app',
      confidence: 0.9,
    };
  }

  // SvelteKit static
  if (FILE_SETS.sveltekit.some((f) => fileSet.has(f)) || deps?.['@sveltejs/kit']) {
    return {
      framework: 'sveltekit',
      packageManager,
      buildCommand: buildScript(packageJson, 'build'),
      installCommand: defaultInstall(packageManager),
      outputDir: 'build',
      suggestedType: 'app',
      confidence: 0.9,
    };
  }

  // SolidStart
  if (FILE_SETS.solidstart.some((f) => fileSet.has(f)) || deps?.['@solidjs/start']) {
    return {
      framework: 'solidstart',
      packageManager,
      buildCommand: buildScript(packageJson, 'build'),
      installCommand: defaultInstall(packageManager),
      outputDir: '.output/public',
      suggestedType: 'app',
      confidence: 0.85,
    };
  }

  // Jekyll
  if (FILE_SETS.jekyll.some((f) => fileSet.has(f))) {
    return {
      framework: 'jekyll',
      outputDir: '_site',
      suggestedType: 'website',
      confidence: 0.9,
    };
  }

  // Hugo
  if (FILE_SETS.hugo.some((f) => fileSet.has(f))) {
    return {
      framework: 'hugo',
      outputDir: 'public',
      suggestedType: 'website',
      confidence: 0.85,
    };
  }

  // Generic package.json with a build script → SPA
  if (packageJson?.scripts?.build) {
    return {
      framework: 'unknown-node',
      packageManager,
      buildCommand: buildScript(packageJson, 'build'),
      installCommand: defaultInstall(packageManager),
      outputDir: 'dist',
      suggestedType: 'web_app',
      confidence: 0.4,
      notes: [
        'Framework not detected. Defaulting to "dist" output.',
        'Override `build.output` in shippie.json if your build writes elsewhere.',
      ],
    };
  }

  // Last resort: static
  return {
    framework: 'static',
    outputDir: '.',
    suggestedType: 'website',
    confidence: 0.3,
    notes: ['No framework detected. Serving files as-is.'],
  };
}

function detectMonorepo(
  files: Set<string>,
  pkg?: DetectInput['packageJson'],
): DetectedFramework['monorepo'] | undefined {
  if (files.has('pnpm-workspace.yaml')) return 'pnpm-workspace';
  if (files.has('turbo.json')) return 'turbo';
  if (files.has('nx.json')) return 'nx';
  if (files.has('lerna.json')) return 'lerna';
  // `workspaces` field in root package.json — npm/yarn/bun workspaces
  const wsField = (pkg as { workspaces?: unknown } | undefined)?.workspaces;
  if (wsField && (Array.isArray(wsField) || typeof wsField === 'object')) {
    return 'npm-workspaces';
  }
  return undefined;
}

function detectAiTool(files: Set<string>): DetectedFramework['aiTool'] | undefined {
  // Directory markers appear as their index files in the walked root
  if (files.has('.bolt') || [...files].some((f) => f.startsWith('.bolt/'))) return 'bolt';
  if (files.has('.lovable') || [...files].some((f) => f.startsWith('.lovable/'))) return 'lovable';
  if (files.has('v0') || [...files].some((f) => f.startsWith('v0/') || f.startsWith('.v0/'))) return 'v0';
  if (files.has('components.json')) return 'shadcn';
  if (files.has('.cursorrules') || files.has('.cursor')) return 'cursor';
  return undefined;
}

function detectPackageManager(files: Set<string>): 'npm' | 'pnpm' | 'yarn' | 'bun' | undefined {
  if (files.has('bun.lockb') || files.has('bun.lock')) return 'bun';
  if (files.has('pnpm-lock.yaml')) return 'pnpm';
  if (files.has('yarn.lock')) return 'yarn';
  if (files.has('package-lock.json')) return 'npm';
  return undefined;
}

function buildScript(pkg: DetectInput['packageJson'], name: string): string | undefined {
  const script = pkg?.scripts?.[name];
  if (!script) return undefined;
  const manager = pkg ? 'npm' : 'npm';
  return `${manager} run ${name}`;
}

function defaultInstall(mgr: 'npm' | 'pnpm' | 'yarn' | 'bun' | undefined): string {
  switch (mgr) {
    case 'pnpm':
      return 'pnpm install --frozen-lockfile --ignore-scripts';
    case 'yarn':
      return 'yarn install --immutable --mode skip-build';
    case 'bun':
      return 'bun install --frozen-lockfile --ignore-scripts';
    case 'npm':
    default:
      return 'npm ci --ignore-scripts';
  }
}

function inferTypeFromDeps(
  deps: Record<string, string> | undefined,
  fallback: 'app' | 'web_app' | 'website',
): 'app' | 'web_app' | 'website' {
  // Mobile-first libraries → type=app
  if (deps?.['@capacitor/core'] || deps?.['framer-motion']) return 'app';
  // Docs-ish deps → type=website
  if (deps?.['@docusaurus/core'] || deps?.typedoc) return 'website';
  return fallback;
}
