/**
 * Screenshot capture for deployed apps via Playwright.
 *
 * Captures 3 viewports (mobile portrait, mobile landscape, desktop)
 * of a live deployed app and stores the PNGs in R2. Feature-flagged
 * via ENABLE_SCREENSHOTS env var — off by default.
 *
 * Spec v5 §8 (auto-packaging — screenshots).
 */
import type { R2Store } from '@shippie/dev-storage';

export interface CaptureScreenshotsInput {
  slug: string;
  version: number;
  appId: string;
  baseUrl: string;
  r2: R2Store;
}

export interface CaptureScreenshotsResult {
  success: boolean;
  r2Keys: string[];
  errors: string[];
}

export const VIEWPORTS = [
  { name: 'mobile-portrait', width: 390, height: 844 },
  { name: 'mobile-landscape', width: 844, height: 390 },
  { name: 'desktop', width: 1280, height: 800 },
] as const;

export async function captureScreenshots(
  input: CaptureScreenshotsInput,
): Promise<CaptureScreenshotsResult> {
  if (process.env.ENABLE_SCREENSHOTS !== 'true') {
    return { success: true, r2Keys: [], errors: [] };
  }

  const r2Keys: string[] = [];
  const errors: string[] = [];

  let chromium: typeof import('playwright').chromium;
  try {
    const pw = await import('playwright');
    chromium = pw.chromium;
  } catch {
    return { success: false, r2Keys: [], errors: ['playwright not installed — run: npx playwright install chromium'] };
  }

  let browser;
  try {
    browser = await chromium.launch({ headless: true });

    for (const vp of VIEWPORTS) {
      try {
        const context = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
        });
        const page = await context.newPage();
        await page.goto(input.baseUrl, { waitUntil: 'networkidle', timeout: 30_000 });
        const screenshot = await page.screenshot({ type: 'png', fullPage: false });

        const r2Key = `public-assets/${input.appId}/screenshots/v${input.version}/${vp.name}.png`;
        await input.r2.put(r2Key, new Uint8Array(screenshot));
        r2Keys.push(r2Key);

        await context.close();
      } catch (err) {
        errors.push(`${vp.name}: ${(err as Error).message}`);
      }
    }
  } catch (err) {
    errors.push(`browser launch: ${(err as Error).message}`);
  } finally {
    await browser?.close();
  }

  return {
    success: errors.length === 0,
    r2Keys,
    errors,
  };
}
