/**
 * `shippie graduate <slug>` — scaffold a Capacitor wrap for a deployed
 * Shippie PWA so the maker can ship native binaries (.apk / .ipa) to
 * the App Store / Play Store.
 *
 * Phase 6 — wrapped-binary build path.
 *
 * What this command produces (in `./<slug>-native/`):
 *   - capacitor.config.ts pointing webDir at a build of the PWA
 *   - package.json with @capacitor/{core,android,ios} deps + scripts
 *   - README explaining the next 4 manual steps (install deps, build,
 *     open native projects, code-sign)
 *
 * Why this isn't fully automated: Capacitor needs Android Studio /
 * Xcode + signing certs that can't ship through a CLI. The scaffold
 * gets the maker 90% of the way; the last 10% is OS toolchain.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface GraduateOptions {
  /** App slug to graduate (must exist on shippie.app or hub). */
  slug: string;
  /** Where to scaffold. Defaults to `./<slug>-native`. */
  outDir?: string;
  /** Override the default `https://<slug>.shippie.app` URL. */
  serverUrl?: string;
  /** Skip writing if the directory already exists. Default: false (errors). */
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
  const outDir = resolve(process.cwd(), options.outDir ?? `${slug}-native`);
  if (existsSync(outDir) && !options.force) {
    throw new Error(`Output directory already exists: ${outDir} (pass --force to overwrite)`);
  }
  mkdirSync(outDir, { recursive: true });

  const serverUrl = options.serverUrl ?? `https://${slug}.shippie.app`;
  const appId = `app.shippie.${slug.replace(/-/g, '')}`;
  const displayName = slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

  const files: Array<{ path: string; contents: string }> = [
    {
      path: 'package.json',
      contents: JSON.stringify(
        {
          name: `${slug}-native`,
          version: '0.1.0',
          private: true,
          scripts: {
            'cap:add:android': 'npx cap add android',
            'cap:add:ios': 'npx cap add ios',
            'cap:sync': 'npx cap sync',
            'cap:open:android': 'npx cap open android',
            'cap:open:ios': 'npx cap open ios',
          },
          dependencies: {
            '@capacitor/android': '^6.1.0',
            '@capacitor/core': '^6.1.0',
            '@capacitor/ios': '^6.1.0',
          },
          devDependencies: {
            '@capacitor/cli': '^6.1.0',
          },
        },
        null,
        2,
      ),
    },
    {
      path: 'capacitor.config.ts',
      contents: capacitorConfig({ appId, displayName, serverUrl }),
    },
    {
      path: 'www/index.html',
      contents: redirectShim(serverUrl),
    },
    {
      path: '.gitignore',
      contents: ['node_modules/', 'android/', 'ios/', 'dist/', '.DS_Store', ''].join('\n'),
    },
    {
      path: 'README.md',
      contents: readme({ slug, displayName, serverUrl, appId }),
    },
  ];

  for (const file of files) {
    const fullPath = resolve(outDir, file.path);
    mkdirSync(resolve(fullPath, '..'), { recursive: true });
    writeFileSync(fullPath, file.contents);
  }

  return {
    outDir,
    files: files.map((f) => f.path),
    nextSteps: [
      `cd ${outDir}`,
      'npm install',
      'npm run cap:add:android   # adds android/ project',
      'npm run cap:add:ios       # adds ios/ project (macOS + Xcode)',
      'npm run cap:open:android  # opens Android Studio for build + sign',
      'npm run cap:open:ios      # opens Xcode for build + sign',
    ],
  };
}

function capacitorConfig(input: { appId: string; displayName: string; serverUrl: string }): string {
  return `import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: '${input.appId}',
  appName: '${input.displayName}',
  webDir: 'www',
  server: {
    // Live-load the deployed PWA. Capacitor wraps it in a native shell
    // so the maker gets store distribution + push + native APIs while
    // the actual app code stays where Shippie deploys it.
    url: '${input.serverUrl}',
    cleartext: false,
  },
  ios: {
    contentInset: 'always',
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
`;
}

function redirectShim(serverUrl: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Loading…</title>
  <meta http-equiv="refresh" content="0; url=${serverUrl}" />
</head>
<body>
  <p>If this page doesn't redirect, <a href="${serverUrl}">tap here</a>.</p>
  <script>window.location.replace(${JSON.stringify(serverUrl)});</script>
</body>
</html>
`;
}

function readme(input: {
  slug: string;
  displayName: string;
  serverUrl: string;
  appId: string;
}): string {
  return `# ${input.displayName} — native shell

Capacitor wrap for [${input.serverUrl}](${input.serverUrl}). The deployed
Shippie PWA stays where it is; this project produces native binaries
that load it inside a system WebView.

## Identity

- **App ID**: \`${input.appId}\`
- **Display name**: ${input.displayName}
- **Slug**: \`${input.slug}\`

## Build

\`\`\`bash
npm install
npm run cap:add:android   # adds android/ project
npm run cap:add:ios       # adds ios/ project (needs macOS + Xcode)

# Whenever the PWA changes, sync brings the wrap up to date:
npm run cap:sync

# Open the native projects in their IDEs to build, sign, and ship.
npm run cap:open:android
npm run cap:open:ios
\`\`\`

## What's in the wrap

- The PWA at \`${input.serverUrl}\` runs in a system WebView with no chrome.
- Push, BLE, camera, file picker, share sheet — all native via Capacitor plugins.
- The wrap inherits the PWA's existing service worker, so offline behaviour
  on first launch matches the web experience exactly.

## Sign + ship

- **Android**: Android Studio → Build → Generate signed bundle → upload
  to Play Console.
- **iOS**: Xcode → Product → Archive → Distribute App → upload to
  App Store Connect.

## Sync after Shippie redeploys

Native binaries don't auto-update the WebView's frame, but the WebView
itself loads ${input.serverUrl} at every cold launch. New PWA deploys
arrive automatically. Code-push to the binary is only required for
native plugin changes.
`;
}
