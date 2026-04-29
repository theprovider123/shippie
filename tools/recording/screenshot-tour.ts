/**
 * Capture screenshots of every brand-touched route so the user can review
 * Phase 2 in one go. Saves to apps/platform/static/brand-preview/tour-*.png.
 */
import { chromium } from "@playwright/test";

const ROUTES = [
  { path: "/", out: "tour-home.png" },
  { path: "/apps", out: "tour-marketplace.png" },
  { path: "/why", out: "tour-why.png" },
  { path: "/docs", out: "tour-docs.png" },
  { path: "/new", out: "tour-new.png" },
  { path: "/auth/login", out: "tour-login.png" },
];

const VIEWPORT = { width: 1440, height: 900 };
const OUT_DIR = "/Users/devante/Documents/Shippie/apps/platform/static/brand-preview";

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  for (const r of ROUTES) {
    try {
      await page.goto(`http://localhost:4101${r.path}`, { waitUntil: "networkidle", timeout: 30_000 });
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
      await page.evaluate(() => {
        document
          .querySelectorAll("vite-error-overlay, [class*='error-overlay']")
          .forEach((el) => el.remove());
      });
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${OUT_DIR}/${r.out}`, fullPage: false });
      console.log(`[tour] ${r.path} → ${r.out}`);
    } catch (err) {
      console.error(`[tour] ${r.path} failed`, err);
    }
  }

  await browser.close();
}

main().catch((err) => {
  console.error("[tour]", err);
  process.exit(1);
});
