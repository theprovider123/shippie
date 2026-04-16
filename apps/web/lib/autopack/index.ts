/**
 * Auto-packaging orchestrator — runs after a successful deploy.
 *
 * Everything here is async-and-non-blocking from the publish path's
 * perspective: the app goes live immediately, and auto-pack products
 * (compat report, OG card, install QR, changelog) land within a few
 * seconds on the listing page.
 *
 * Products in this MVP:
 *   - Compat report  (static analysis of permissions vs SDK usage)
 *   - Changelog      (CHANGELOG.md or default)
 *   - Install QR     (PNG to R2)
 *   - OG social card (PNG to R2 via satori + resvg)
 *
 * Deferred (feature-flagged):
 *   - Screenshots    (needs headless Chrome)
 *   - AI icon        (needs OpenAI / image-model API key)
 *   - AI copy        (needs LLM call)
 *
 * Spec v6 §8.
 */
import { eq } from 'drizzle-orm';
import { schema, type ShippieDb } from '@shippie/db';
import type { ShippieJson } from '@shippie/shared';
import type { R2Store } from '@shippie/dev-storage';
import { runCompatReport, type CompatReport } from './compat-report';
import { extractChangelog, type ChangelogResult } from './changelog';
import { buildInstallQr } from './qr';
import { buildOgCard } from './og-card';
import { loadDefaultFonts } from './fonts';

export interface AutoPackInput {
  db: ShippieDb;
  r2: R2Store;
  appId: string;
  deployId: string;
  slug: string;
  version: number;
  files: Map<string, Buffer>;
  manifest: ShippieJson;
}

export interface AutoPackResult {
  success: boolean;
  compat: CompatReport;
  changelog: ChangelogResult;
  qrR2Key?: string;
  ogR2Key?: string;
  durationMs: number;
  errors: string[];
}

const ASSETS_PREFIX = 'public-assets';

export async function runAutoPack(input: AutoPackInput): Promise<AutoPackResult> {
  const started = Date.now();
  const errors: string[] = [];

  // 1. Compat report — pure function, no I/O
  const compat = runCompatReport({ files: input.files, manifest: input.manifest });

  // 2. Changelog
  const changelog = extractChangelog({ files: input.files, version: input.version });

  // 3. Install QR → R2
  let qrR2Key: string | undefined;
  try {
    const qrPng = await buildInstallQr({
      slug: input.slug,
      baseUrl: process.env.SHIPPIE_PUBLIC_URL_TEMPLATE
        ? process.env.SHIPPIE_PUBLIC_URL_TEMPLATE.replace('{slug}', input.slug)
        : `http://${input.slug}.localhost:4200/`,
    });
    qrR2Key = `${ASSETS_PREFIX}/${input.appId}/qr.png`;
    await input.r2.put(qrR2Key, new Uint8Array(qrPng));
  } catch (err) {
    errors.push(`qr: ${(err as Error).message}`);
  }

  // 4. OG card → R2
  let ogR2Key: string | undefined;
  try {
    const fonts = await loadDefaultFonts();
    const og = await buildOgCard({
      name: input.manifest.name ?? input.slug,
      tagline: input.manifest.tagline,
      slug: input.slug,
      themeColor: input.manifest.theme_color,
      fonts,
    });
    ogR2Key = `${ASSETS_PREFIX}/${input.appId}/og.png`;
    await input.r2.put(ogR2Key, new Uint8Array(og));
  } catch (err) {
    errors.push(`og: ${(err as Error).message}`);
  }

  // 5. Screenshots (feature-flagged via ENABLE_SCREENSHOTS)
  let screenshotR2Keys: string[] = [];
  try {
    const { captureScreenshots } = await import('./screenshots');
    const shots = await captureScreenshots({
      slug: input.slug,
      version: input.version,
      appId: input.appId,
      baseUrl: process.env.SHIPPIE_PUBLIC_URL_TEMPLATE
        ? process.env.SHIPPIE_PUBLIC_URL_TEMPLATE.replace('{slug}', input.slug)
        : `http://${input.slug}.localhost:4200/`,
      r2: input.r2,
    });
    screenshotR2Keys = shots.r2Keys;
    for (const e of shots.errors) errors.push(`screenshots: ${e}`);
  } catch (err) {
    errors.push(`screenshots: ${(err as Error).message}`);
  }

  // 6. Persist report + asset pointers on apps + deploys
  const report = {
    compat,
    changelog,
    qr_r2_key: qrR2Key,
    og_r2_key: ogR2Key,
    screenshot_r2_keys: screenshotR2Keys,
    errors,
  };

  try {
    await input.db
      .update(schema.apps)
      .set({
        compatibilityScore: compat.score,
        screenshotUrls: screenshotR2Keys.length > 0 ? screenshotR2Keys : undefined,
        updatedAt: new Date(),
      })
      .where(eq(schema.apps.id, input.appId));

    await input.db
      .update(schema.deploys)
      .set({
        autopackagingStatus: errors.length === 0 ? 'complete' : 'partial',
        autopackagingReport: report as unknown as Record<string, unknown>,
      })
      .where(eq(schema.deploys.id, input.deployId));
  } catch (err) {
    errors.push(`db: ${(err as Error).message}`);
  }

  return {
    success: errors.length === 0,
    compat,
    changelog,
    qrR2Key,
    ogR2Key,
    durationMs: Date.now() - started,
    errors,
  };
}
