/**
 * Rasterise the Shippie rocket into PNG app icons.
 *
 * Inputs (read from repo root):
 *   shippie_icon_dark_square.svg — for apple-touch + manifest icons
 *   shippie_icon_transparent.svg — for masking-friendly variants
 *
 * Outputs (written to apps/platform/static/):
 *   apple-touch-icon.png         180×180   — primary apple-touch
 *   apple-touch-icon-152.png     152×152   — legacy iPad
 *   apple-touch-icon-167.png     167×167   — iPad Pro
 *   icon-192.png                 192×192   — manifest
 *   icon-512.png                 512×512   — manifest
 *   icon-512-maskable.png        512×512   — manifest, transparent variant
 *
 * Run with: bun run generate-app-icons.ts (from tools/recording/)
 */
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const REPO = "/Users/devante/Documents/Shippie";
const OUT_DIR = `${REPO}/apps/platform/static`;
const DARK_SVG = readFileSync(`${REPO}/shippie_icon_dark_square.svg`, "utf8");
const TRANSPARENT_SVG = readFileSync(
  `${REPO}/shippie_icon_transparent.svg`,
  "utf8",
);

interface Target {
  out: string;
  size: number;
  svg: string;
}

const TARGETS: Target[] = [
  { out: "apple-touch-icon.png", size: 180, svg: DARK_SVG },
  { out: "apple-touch-icon-152.png", size: 152, svg: DARK_SVG },
  { out: "apple-touch-icon-167.png", size: 167, svg: DARK_SVG },
  { out: "icon-192.png", size: 192, svg: DARK_SVG },
  { out: "icon-512.png", size: 512, svg: DARK_SVG },
  { out: "icon-512-maskable.png", size: 512, svg: TRANSPARENT_SVG },
];

async function main() {
  console.log(`[icons] launching chromium`);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ deviceScaleFactor: 1 });
  const page = await ctx.newPage();

  for (const t of TARGETS) {
    const html = `<!doctype html><html><head><style>
      *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
      html,body{width:${t.size}px;height:${t.size}px;background:transparent;overflow:hidden}
      svg{width:${t.size}px;height:${t.size}px;display:block}
    </style></head><body>${t.svg}</body></html>`;

    await page.setViewportSize({ width: t.size, height: t.size });
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    const path = `${OUT_DIR}/${t.out}`;
    await page.screenshot({
      path,
      omitBackground: t.svg === TRANSPARENT_SVG,
      clip: { x: 0, y: 0, width: t.size, height: t.size },
    });
    console.log(`[icons] wrote ${t.out} (${t.size}×${t.size})`);
  }

  await browser.close();
  console.log(`[icons] done`);
}

main().catch((err) => {
  console.error("[icons] failed", err);
  process.exit(1);
});
