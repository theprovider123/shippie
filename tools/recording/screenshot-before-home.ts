/**
 * One-off screenshot capture for the brand-preview "before" comparison.
 *
 * Captures localhost:4101/ at 1440x900 and writes the result to
 * apps/platform/static/brand-preview/before-home.png.
 *
 * Run with: bunx playwright test screenshot-before-home.ts
 *   — or —  bunx tsx tools/recording/screenshot-before-home.ts
 *
 * Assumes `bun run dev` is already running in apps/platform.
 */
import { chromium } from "@playwright/test";

const URL = "http://localhost:4101/";
const VIEWPORT = { width: 1440, height: 900 };
const OUT = "/Users/devante/Documents/Shippie/apps/platform/static/brand-preview/before-home.png";

async function main() {
  console.log(`[screenshot] launching chromium`);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();

  console.log(`[screenshot] navigating to ${URL}`);
  await page.goto(URL, { waitUntil: "networkidle", timeout: 30_000 });
  // Dismiss any vite-plugin-svelte error overlay (open shadow DOM, dismissed
  // with Escape) so the captured "before" reflects the actual page.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    document
      .querySelectorAll("vite-error-overlay, [class*='error-overlay']")
      .forEach((el) => el.remove());
  });
  await page.waitForTimeout(800);

  console.log(`[screenshot] writing ${OUT}`);
  await page.screenshot({ path: OUT, fullPage: false });

  await browser.close();
  console.log(`[screenshot] done`);
}

main().catch((err) => {
  console.error("[screenshot] failed", err);
  process.exit(1);
});
