/**
 * Render the Open Graph share image — 1200×630 PNG.
 *
 * Composition matches the approved brand-preview/brand-system.html OG cell:
 * dark background, sunset radial glow lower-right, 96px rocket, Fraunces
 * "Ship local." headline with italic sunset accent, sage tagline.
 *
 * Output: apps/platform/static/og-image.png (referenced from app.html via
 *         <meta property="og:image">).
 */
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const REPO = "/Users/devante/Documents/Shippie";
const OUT = `${REPO}/apps/platform/static/og-image.png`;
const SVG = readFileSync(`${REPO}/shippie_icon_transparent.svg`, "utf8");

const HTML = `<!doctype html>
<html>
<head>
<style>
@import url("https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=JetBrains+Mono:wght@500&display=swap");
*,*::before,*::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body {
  width: 1200px; height: 630px;
  background: linear-gradient(135deg, #14120F 0%, #1E1A15 100%);
  color: #EDE4D3;
  font-family: 'Fraunces', Georgia, serif;
  overflow: hidden;
  position: relative;
}
body::after {
  content: "";
  position: absolute;
  bottom: -180px; right: -180px;
  width: 600px; height: 600px;
  background: radial-gradient(circle, rgba(232, 96, 60, 0.22), transparent 65%);
  pointer-events: none;
}
.frame {
  position: absolute;
  inset: 80px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  z-index: 1;
}
.mark { width: 120px; height: 120px; margin-bottom: 32px; }
.mark svg { width: 120px; height: 120px; display: block; }
.headline {
  font-size: 124px;
  font-weight: 600;
  letter-spacing: -0.04em;
  line-height: 0.95;
  color: #EDE4D3;
}
.headline .accent { color: #E8603C; font-style: italic; }
.tag {
  margin-top: 28px;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 22px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #A8C491;
  font-weight: 500;
}
.foot {
  position: absolute;
  bottom: 56px;
  left: 80px;
  right: 80px;
  display: flex;
  justify-content: space-between;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 18px;
  letter-spacing: 0.06em;
  color: #B8A88F;
  z-index: 1;
}
.foot strong { color: #EDE4D3; font-weight: 500; }
</style>
</head>
<body>
  <div class="frame">
    <div class="mark">${SVG}</div>
    <div class="headline">Ship <span class="accent">local.</span></div>
    <div class="tag">YOUR APP. YOUR DEVICE. YOUR DATA.</div>
  </div>
  <div class="foot">
    <span><strong>shippie.app</strong></span>
    <span>Open source · Free forever</span>
  </div>
</body>
</html>`;

async function main() {
  console.log(`[og] launching chromium`);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  await page.setContent(HTML, { waitUntil: "networkidle" });
  // Give Fraunces extra time to settle.
  await page.waitForTimeout(1500);
  await page.screenshot({
    path: OUT,
    clip: { x: 0, y: 0, width: 1200, height: 630 },
  });
  await browser.close();
  console.log(`[og] wrote ${OUT}`);
}

main().catch((err) => {
  console.error("[og] failed", err);
  process.exit(1);
});
