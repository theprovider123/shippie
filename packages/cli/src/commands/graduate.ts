/**
 * `shippie graduate <slug>` used to scaffold a Capacitor/native wrapper.
 * Native distribution is no longer part of the launch maker path: Shippie is
 * PWA-first, and the CLI keeps this command only as a clear migration error.
 */

export interface GraduateOptions {
  /** App slug that a maker tried to graduate. */
  slug: string;
  /** Retained for CLI compatibility; ignored. */
  outDir?: string;
  /** Retained for CLI compatibility; ignored. */
  serverUrl?: string;
  /** Retained for CLI compatibility; ignored. */
  force?: boolean;
}

export interface GraduateResult {
  outDir: string;
  files: readonly string[];
  nextSteps: readonly string[];
}

export function graduateScaffold(options: GraduateOptions): GraduateResult {
  const slug = options.slug.trim();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    throw new Error(`Invalid slug: ${slug}`);
  }
  throw new Error(
    `graduate retired for ${slug}. Shippie is PWA-first for launch: deploy the local tool with \`shippie deploy ./dist\`, then install it from the browser.`,
  );
}
