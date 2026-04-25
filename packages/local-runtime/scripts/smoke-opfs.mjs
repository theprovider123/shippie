import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

const root = new URL('../', import.meta.url);
const dist = new URL('../dist/', import.meta.url);
const port = Number(process.env.PORT || 4179);

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);
    if (url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(smokeHtml());
      return;
    }
    if (url.pathname === '/__shippie/local.js') {
      await sendFile(res, new URL('local/v1.latest.js', dist), 'application/javascript; charset=utf-8');
      return;
    }
    if (url.pathname === '/__shippie/local/wa-sqlite-async.wasm') {
      await sendFile(res, new URL('local/wa-sqlite-async.wasm', dist), 'application/wasm');
      return;
    }
    if (url.pathname === '/__shippie/local/worker.latest.js') {
      await sendFile(res, new URL('local/worker.latest.js', dist), 'application/javascript; charset=utf-8');
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  } catch (error) {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(error.stack || error.message || String(error));
  }
});

await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));

let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('console', (msg) => console.log(`[browser:${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (error) => console.error(`[browser:error] ${error.stack || error.message}`));
  const url = `http://127.0.0.1:${port}/`;

  await page.goto(url);
  await page.waitForFunction(() => window.__shippieSmoke?.ready === true, null, { timeout: 15000 });
  const first = await page.evaluate(() => window.__shippieSmoke.result);

  await page.reload();
  await page.waitForFunction(() => window.__shippieSmoke?.ready === true, null, { timeout: 15000 });
  const second = await page.evaluate(() => window.__shippieSmoke.result);

  if (!first?.ok || !second?.ok || second.count < first.count || second.count < 1) {
    throw new Error(`OPFS smoke failed: ${JSON.stringify({ first, second })}`);
  }

  console.log(JSON.stringify({ ok: true, first, second }, null, 2));
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}

async function sendFile(res, fileUrl, contentType) {
  const bytes = await readFile(fileUrl);
  res.writeHead(200, {
    'content-type': contentType,
    'cache-control': 'no-store',
  });
  res.end(bytes);
}

function smokeHtml() {
  return `<!doctype html>
<html>
  <head><meta charset="utf-8"><title>Shippie OPFS Smoke</title></head>
  <body>
    <script src="/__shippie/local.js"></script>
    <script>
      window.__shippieSmoke = { ready: false, result: null };
      (async () => {
        try {
          const db = window.shippie.local.db;
          await db.create('recipes', {
            id: 'text primary key',
            title: 'text',
            rating: 'integer',
            ingredients: 'json',
            created: 'datetime'
          });
          const existing = await db.query('recipes', { where: { id: 'opfs-smoke' }, limit: 1 });
          if (existing.length === 0) {
            await db.insert('recipes', {
              id: 'opfs-smoke',
              title: 'OPFS smoke recipe',
              rating: 5,
              ingredients: ['sqlite', 'opfs'],
              created: new Date().toISOString()
            });
          }
          const rows = await db.query('recipes', { where: { id: 'opfs-smoke' }, limit: 1 });
          window.__shippieSmoke.result = {
            ok: rows.length === 1 && rows[0].ingredients[0] === 'sqlite',
            count: await db.count('recipes'),
            opfs: window.shippie.local.capabilities().opfs
          };
        } catch (error) {
          window.__shippieSmoke.result = { ok: false, error: error.message || String(error) };
        } finally {
          window.__shippieSmoke.ready = true;
        }
      })();
    </script>
  </body>
</html>`;
}
