/**
 * GET /api/golazo/og?type=mycall|receipts|outsidebet&...  -> 1200x630 SVG
 *
 * The chat-unfurl image for Golazo share links, referenced by <meta og:image>.
 * Rendered as a zero-dependency, on-brand SVG so it adds no build/runtime risk to
 * the platform Worker and works on SVG-capable unfurlers (Twitter, Slack, Telegram,
 * Discord, direct view). The in-app Canvas2D cards remain the offline share path.
 *
 * PRODUCTION UPGRADE: for universal raster unfurl (WhatsApp/iMessage want PNG),
 * swap the Response below for a satori+resvg render (e.g. `workers-og`). That was
 * trialled here but its wasm imports don't bundle cleanly under the SvelteKit
 * Cloudflare adapter's Vite SSR build, so we keep the safe SVG path. Rasterising
 * with a Worker-compatible build of resvg is the one-function change to make.
 *
 * Params (all optional — a bare URL renders a generic hero):
 *   type   mycall | receipts | outsidebet
 *   name   player / lot name
 *   champ  champion nation name (mycall)
 *   flag   a flag emoji to feature
 *   ob     outside-bet nation (mycall short / outsidebet name)
 *   boot   golden-boot nation short (mycall)
 *   line   the receipts dig (receipts)
 *   pct,bonus  outside-bet stats (outsidebet)
 */
import type { RequestHandler } from "./$types";

const W = 1200;
const H = 630;
const GREEN = "#16f08b";
const GOLD = "#ffd34d";
const BG = "#06090f";

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c] ?? c),
  );
}

const FONT = `font-family="Arial, Helvetica, sans-serif"`;

function frame(inner: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <radialGradient id="glow" cx="80%" cy="12%" r="80%">
        <stop offset="0%" stop-color="${GREEN}" stop-opacity="0.16"/>
        <stop offset="100%" stop-color="${GREEN}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="100%" height="100%" fill="${BG}"/>
    <rect width="100%" height="100%" fill="url(#glow)"/>
    <text x="64" y="96" ${FONT} font-size="44" font-weight="800" fill="#fff" letter-spacing="2">GOLAZO</text>
    <text x="300" y="96" ${FONT} font-size="24" font-weight="700" fill="${GREEN}" letter-spacing="3">· 2026 WORLD CUP</text>
    ${inner}
    <text x="64" y="${H - 48}" ${FONT} font-size="28" font-weight="800" fill="${GREEN}" letter-spacing="1">shippie.app/golazo</text>
  </svg>`;
}

function chip(x: number, label: string, value: string, hot: boolean): string {
  const stroke = hot ? "rgba(22,240,139,0.4)" : "rgba(255,255,255,0.12)";
  const fill = hot ? "rgba(22,240,139,0.08)" : "rgba(255,255,255,0.05)";
  return `<g>
    <rect x="${x}" y="430" width="300" height="120" rx="18" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
    <text x="${x + 24}" y="470" ${FONT} font-size="18" font-weight="700" letter-spacing="2" fill="${hot ? GREEN : "rgba(255,255,255,0.5)"}">${esc(label.toUpperCase())}</text>
    <text x="${x + 24}" y="516" ${FONT} font-size="36" font-weight="800" fill="#fff">${esc(value)}</text>
  </g>`;
}

function mycall(p: URLSearchParams): string {
  const champ = (p.get("champ") ?? "Your champion").toUpperCase();
  const flag = p.get("flag") ?? "🏆";
  const name = p.get("name") ?? "";
  const size = champ.length > 9 ? 80 : 104;
  const chips = [
    p.get("ob") ? chip(64, "Outside Bet", p.get("ob")!, true) : "",
    p.get("boot") ? chip(388, "Golden Boot", p.get("boot")!, false) : "",
  ].join("");
  return `
    <text x="64" y="190" ${FONT} font-size="26" letter-spacing="3" fill="rgba(255,255,255,0.55)">MY WINNER IS</text>
    <text x="64" y="320" font-size="110">${esc(flag)}</text>
    <text x="230" y="312" ${FONT} font-size="${size}" font-weight="800" fill="#fff">${esc(champ)}</text>
    ${chips}
    ${name ? `<text x="${W - 64}" y="${H - 48}" ${FONT} font-size="26" fill="rgba(255,255,255,0.6)" text-anchor="end">Locked by ${esc(name)}</text>` : ""}
  `;
}

function receipts(p: URLSearchParams): string {
  const name = p.get("name") ?? "The Lads";
  const line = p.get("line") ?? "The table doesn't lie.";
  const words = line.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).length > 42 && cur) { lines.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) lines.push(cur);
  const body = lines.slice(0, 4).map((l, i) => `<text x="64" y="${360 + i * 52}" ${FONT} font-size="38" fill="rgba(255,255,255,0.88)">${esc(l)}</text>`).join("");
  return `
    <text x="64" y="240" font-size="80">🧾</text>
    <text x="64" y="320" ${FONT} font-size="68" font-weight="800" letter-spacing="2" fill="#fff">THE RECEIPTS</text>
    ${body}
    <text x="${W - 64}" y="${H - 48}" ${FONT} font-size="26" fill="rgba(255,255,255,0.6)" text-anchor="end">${esc(name)}</text>
  `;
}

function outsidebet(p: URLSearchParams): string {
  const flag = p.get("flag") ?? "🐴";
  const team = (p.get("ob") ?? "Outside Bet").toUpperCase();
  const pct = p.get("pct") ?? "8";
  const bonus = p.get("bonus") ?? "40";
  const name = p.get("name") ?? "";
  return `
    <text x="${W / 2}" y="300" font-size="150" text-anchor="middle">${esc(flag)}</text>
    <text x="${W / 2}" y="420" ${FONT} font-size="92" font-weight="800" letter-spacing="2" fill="${GOLD}" text-anchor="middle">${esc(team)}</text>
    <text x="${W / 2}" y="478" ${FONT} font-size="30" fill="rgba(255,255,255,0.6)" text-anchor="middle">${esc(pct)}% called it · +${esc(bonus)} bonus pts</text>
    ${name ? `<text x="${W / 2}" y="534" ${FONT} font-size="34" font-weight="700" fill="#fff" text-anchor="middle">${esc(name)} saw it coming.</text>` : ""}
  `;
}

export const GET: RequestHandler = async ({ url }) => {
  const p = url.searchParams;
  const type = p.get("type") ?? "mycall";
  const inner =
    type === "receipts" ? receipts(p) : type === "outsidebet" ? outsidebet(p) : mycall(p);
  return new Response(frame(inner), {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=86400, s-maxage=604800",
    },
  });
};
