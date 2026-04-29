/**
 * Captures the post-Phase-2 homepage so we can verify the rocket logo is
 * actually rendering in the nav and footer. Saved next to before-home.png
 * so the brand-preview/home.html "Before / After" pane can swap to it.
 */
import { chromium } from "@playwright/test";

const URL = "http://localhost:4101/";
const VIEWPORT = { width: 1440, height: 900 };
const OUT = "/Users/devante/Documents/Shippie/apps/platform/static/brand-preview/after-home.png";

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: "networkidle", timeout: 30_000 });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    document
      .querySelectorAll("vite-error-overlay, [class*='error-overlay']")
      .forEach((el) => el.remove());
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: OUT, fullPage: false });
  await browser.close();
  console.log(`[after] ${OUT}`);
}

main().catch((err) => {
  console.error("[after]", err);
  process.exit(1);
});
