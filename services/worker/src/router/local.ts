/**
 * __shippie/local.js
 *
 * Lazy boundary for Layer 3. The base SDK stays small; apps that opt into
 * local runtime features load this file on demand. Production can serve a
 * bundled implementation from R2. Dev returns a contract-compatible stub
 * that exposes capability detection and clear unsupported errors.
 */
import { Hono } from 'hono';
import type { AppBindings } from '../app.ts';
import { toResponseBody } from '../bytes.ts';

const DEV_STUB = `// __shippie/local.js — dev local-runtime boundary
(function () {
  if (typeof globalThis === 'undefined') return;
  const root = globalThis;
  const shippie = root.shippie || {};
  const unsupported = function (feature) {
    return function () {
      const err = new Error('[shippie.local] ' + feature + ' is not implemented in this build');
      err.code = 'unsupported';
      return Promise.reject(err);
    };
  };
  const capabilities = function () {
    var nav = typeof navigator !== 'undefined' ? navigator : {};
    return {
      wasm: typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function',
      opfs: !!(nav.storage && typeof nav.storage.getDirectory === 'function'),
      indexedDb: typeof indexedDB !== 'undefined',
      storageEstimate: !!(nav.storage && typeof nav.storage.estimate === 'function'),
      storagePersist: !!(nav.storage && typeof nav.storage.persist === 'function'),
      webGpu: !!(nav && 'gpu' in nav),
      webWorker: typeof Worker !== 'undefined',
      crypto: typeof crypto !== 'undefined' && !!crypto.subtle
    };
  };
  shippie.local = shippie.local || {
    version: 'dev-stub',
    capabilities,
    db: {
      create: unsupported('db.create'),
      insert: unsupported('db.insert'),
      query: unsupported('db.query'),
      search: unsupported('db.search'),
      vectorSearch: unsupported('db.vectorSearch'),
      update: unsupported('db.update'),
      delete: unsupported('db.delete'),
      count: unsupported('db.count'),
      export: unsupported('db.export'),
      restore: unsupported('db.restore'),
      lastBackup: unsupported('db.lastBackup'),
      usage: unsupported('db.usage'),
      requestPersistence: unsupported('db.requestPersistence')
    },
    files: {
      write: unsupported('files.write'),
      read: unsupported('files.read'),
      list: unsupported('files.list'),
      delete: unsupported('files.delete'),
      usage: unsupported('files.usage'),
      thumbnail: unsupported('files.thumbnail')
    },
    ai: {
      available: function () { return Promise.resolve({ embeddings: false, classification: false, sentiment: false, vision: false, gpu: capabilities().webGpu, wasm: capabilities().wasm }); },
      classify: unsupported('ai.classify'),
      sentiment: unsupported('ai.sentiment'),
      embed: unsupported('ai.embed'),
      labelImage: unsupported('ai.labelImage')
    }
  };
  root.shippie = shippie;
  if (typeof window !== 'undefined') window.shippie = shippie;
})();
`;

export const localRouter = new Hono<AppBindings>();
export const localAssetsRouter = new Hono<AppBindings>();

localRouter.get('/', async (c) => {
  const obj = await c.env.SHIPPIE_PUBLIC.get('local/v1.latest.js');
  if (obj) {
    return new Response(toResponseBody(await obj.body()), {
      status: 200,
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      },
    });
  }

  return new Response(DEV_STUB, {
    status: 200,
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
});

localAssetsRouter.get('/:asset', async (c) => {
  const asset = c.req.param('asset');
  if (!['wa-sqlite.wasm', 'wa-sqlite-async.wasm', 'worker.latest.js'].includes(asset)) {
    return c.json({ error: 'not_found' }, 404);
  }
  const obj = await c.env.SHIPPIE_PUBLIC.get(`local/${asset}`);
  if (!obj) return c.json({ error: 'not_found' }, 404);
  const contentType = asset.endsWith('.wasm') ? 'application/wasm' : 'application/javascript; charset=utf-8';
  return new Response(toResponseBody(await obj.body()), {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
});
