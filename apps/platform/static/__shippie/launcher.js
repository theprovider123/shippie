(function () {
  const DB = 'shippie.offline-capsules.v1';
  const POINTER_STORE = 'pointers';
  const LOCAL_DB = 'shippie.launcher-local-db.v1';
  const LOCAL_ROWS = 'rows';
  const REPAIR_EVENT = 'OFFLINE_CAPSULE_INCOMPLETE';
  const app = document.getElementById('app');
  let activeSlug = null;
  let activeFrame = null;

  function appLabel(slug) {
    return String(slug || 'saved app')
      .split('-')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  function titleFromHtml(html, slug) {
    const fallback = appLabel(slug);
    const match = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = match
      ? match[1]
          .replace(/<[^>]+>/g, '')
          .replace(/\s+/g, ' ')
          .trim()
      : '';
    if (!title || /^(shippie|react app|vite \+ react)/i.test(title)) return fallback;
    return title.replace(/\s+[\u2013\u2014-]\s+Shippie$/i, '').trim() || fallback;
  }

  function slugFromLocation() {
    const url = new URL(window.location.href);
    const explicit = url.searchParams.get('slug');
    if (explicit) return explicit;
    const match = url.pathname.match(/^\/run\/([^/]+)\/?/);
    return match ? decodeURIComponent(match[1]) : '';
  }

  function capsuleManifestKey(slug, manifestHash) {
    return '/__shippie-capsules/' + encodeURIComponent(slug) + '/' + manifestHash + '.json';
  }

  function status(title, body, actions) {
    document.title = title;
    app.innerHTML =
      '<section class="status"><div class="status-card">' +
      '<svg class="mark" viewBox="0 0 64 64" aria-hidden="true"><path fill="currentColor" d="M32 8 20 20h24L32 8Zm-9 18h7v7h-7v-7Zm11 0h7v7h-7v-7ZM23 37h7v7h-7v-7Zm11 0h7v7h-7v-7ZM20 48h24v5H20v-5Z"/></svg>' +
      '<h1></h1><p></p><div class="actions"></div></div></section>';
    app.querySelector('h1').textContent = title;
    app.querySelector('p').textContent = body;
    const actionRoot = app.querySelector('.actions');
    for (const action of actions || []) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = action.label;
      if (action.secondary) button.className = 'secondary';
      button.addEventListener('click', action.onClick);
      actionRoot.append(button);
    }
  }

  function requestResult(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('indexeddb_request_failed'));
    });
  }

  function openDb(name, version, upgrade) {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(name, version);
      req.onupgradeneeded = () => upgrade(req.result);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('indexeddb_open_failed'));
    });
  }

  async function getPointer(slug) {
    const db = await openDb(DB, 1, (database) => {
      if (!database.objectStoreNames.contains(POINTER_STORE)) {
        database.createObjectStore(POINTER_STORE, { keyPath: 'slug' });
      }
    });
    try {
      const tx = db.transaction(POINTER_STORE, 'readonly');
      return await requestResult(tx.objectStore(POINTER_STORE).get(slug));
    } finally {
      db.close();
    }
  }

  function withBase(html, slug) {
    if (/<base\s/i.test(html)) return html;
    const base = '<base href="/__shippie-run/' + encodeURIComponent(slug) + '/">';
    return /<head[\s>]/i.test(html)
      ? html.replace(/<head([^>]*)>/i, '<head$1>' + base)
      : base + html;
  }

  async function mountCapsule(slug) {
    activeSlug = slug;
    if (!slug) {
      status('App not found', 'This offline launcher needs a saved app slug.', []);
      return;
    }
    if (!('caches' in window) || !('indexedDB' in window)) {
      status('Offline storage unavailable', 'This browser does not expose Cache Storage and IndexedDB to the launcher.', []);
      return;
    }
    const pointer = await getPointer(slug).catch(() => null);
    if (!pointer || pointer.state !== 'sealed') {
      if (navigator.onLine) {
        await repair(slug, 'This app is not sealed on this device yet.');
      } else {
        status('Saved copy missing', 'Reconnect once so Shippie can seal this app for offline launch.', []);
      }
      return;
    }
    const cache = await caches.open(pointer.cacheName).catch(() => null);
    const entry = cache ? await cache.match(pointer.entryUrl) : null;
    const manifest = cache ? await cache.match(capsuleManifestKey(slug, pointer.manifestHash)) : null;
    if (!entry || !manifest) {
      if (navigator.onLine) {
        await repair(slug, 'The saved capsule was evicted. Re-sealing it now.');
      } else {
        status('Saved copy was evicted', 'Reconnect once and Shippie will quietly re-save this app.', []);
      }
      return;
    }
    const originalHtml = await entry.text();
    const label = titleFromHtml(originalHtml, slug);
    document.title = label;
    const html = withBase(originalHtml, slug);
    const frame = document.createElement('iframe');
    frame.title = label + ' offline app';
    frame.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-forms allow-modals allow-popups allow-downloads');
    frame.setAttribute('allow', 'camera; microphone; geolocation; clipboard-read; clipboard-write; fullscreen; display-capture');
    frame.srcdoc = html;
    activeFrame = frame;
    app.replaceChildren(frame);
  }

  async function activeServiceWorker() {
    if (!navigator.serviceWorker) return null;
    const registration = await navigator.serviceWorker.ready.catch(() => null);
    return navigator.serviceWorker.controller || (registration && registration.active) || null;
  }

  async function repair(slug, message) {
    status('Re-saving app', message, []);
    const sw = await activeServiceWorker();
    if (!sw) {
      status('Service worker unavailable', 'Reload Shippie online once so the offline kernel can repair this app.', [
        { label: 'Retry', onClick: () => mountCapsule(slug) },
      ]);
      return;
    }
    let failed = null;
    let saved = false;
    await new Promise((resolve) => {
      const channel = new MessageChannel();
      const done = () => {
        channel.port1.close();
        resolve();
      };
      channel.port1.onmessage = (event) => {
        const msg = event.data || {};
        if (msg.type === 'progress') {
          const total = Number(msg.total || 0);
          const doneCount = Number(msg.done || 0);
          status(
            msg.phase === 'verifying' ? 'Verifying capsule' : 'Re-saving app',
            total > 0 ? doneCount + ' of ' + total + ' files ready.' : 'Preparing the offline capsule.',
            [],
          );
        }
        if (msg.type === 'done') {
          saved = msg.state === 'saved';
          if (!saved) failed = msg.error || msg.state || 'repair_failed';
          done();
        }
      };
      sw.postMessage({ type: 'DOWNLOAD_APP', slug }, [channel.port2]);
      setTimeout(() => {
        failed = failed || 'repair_timeout';
        done();
      }, 30000);
    });
    if (failed && !saved) {
      status('Saved copy missing', 'Reconnect once and Shippie will quietly re-save this app.', [
        { label: 'Retry', onClick: () => mountCapsule(slug) },
      ]);
      return;
    }
    await mountCapsule(slug);
  }

  function openLocalDb() {
    return openDb(LOCAL_DB, 1, (database) => {
      if (!database.objectStoreNames.contains(LOCAL_ROWS)) {
        const store = database.createObjectStore(LOCAL_ROWS, { keyPath: 'id' });
        store.createIndex('appTable', ['appId', 'table'], { unique: false });
      }
    });
  }

  async function withRows(mode, run) {
    const db = await openLocalDb();
    try {
      const tx = db.transaction(LOCAL_ROWS, mode);
      const store = tx.objectStore(LOCAL_ROWS);
      const value = await run(store);
      await new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('local_db_tx_failed'));
        tx.onabort = () => reject(tx.error || new Error('local_db_tx_aborted'));
      });
      return value;
    } finally {
      db.close();
    }
  }

  async function rowsFor(appId, table) {
    return withRows('readonly', async (store) => {
      const rows = await requestResult(store.getAll());
      return rows.filter((row) => row.appId === appId && row.table === table);
    });
  }

  function payloadRows(rows) {
    return rows.map((row) => ({ id: row.id, payload: row.payload, createdAt: row.createdAt, updatedAt: row.updatedAt }));
  }

  async function handleBridgeRequest(data) {
    const appId = data.appId || ('app_' + String(activeSlug || 'unknown').replace(/-/g, '_'));
    const payload = data.payload || {};
    const table = payload.table || 'default';
    const now = new Date().toISOString();
    if (data.capability === 'db.insert' && data.method === 'create') return {};
    if (data.capability === 'db.insert' && data.method === 'insert') {
      const value = payload.value && typeof payload.value === 'object' ? payload.value : {};
      const id = String(value.id || crypto.randomUUID());
      await withRows('readwrite', (store) =>
        requestResult(store.put({ id: appId + ':' + table + ':' + id, appId, table, payload: { ...value, id }, createdAt: now, updatedAt: now })),
      );
      return {};
    }
    if (data.capability === 'db.insert' && data.method === 'update') {
      const key = appId + ':' + table + ':' + payload.id;
      await withRows('readwrite', async (store) => {
        const existing = await requestResult(store.get(key));
        if (!existing) return;
        await requestResult(store.put({ ...existing, payload: { ...existing.payload, ...(payload.patch || {}) }, updatedAt: now }));
      });
      return {};
    }
    if (data.capability === 'db.insert' && data.method === 'delete') {
      await withRows('readwrite', (store) => requestResult(store.delete(appId + ':' + table + ':' + payload.id)));
      return {};
    }
    if (data.capability === 'db.query' && data.method === 'count') {
      return { count: (await rowsFor(appId, table)).length };
    }
    if (data.capability === 'db.query' && data.method === 'lastBackup') return null;
    if (data.capability === 'db.query' && data.method === 'export') {
      return { rows: payloadRows(await rowsFor(appId, table)) };
    }
    if (data.capability === 'db.query' && (data.method === 'query' || data.method === 'vectorSearch')) {
      return { rows: payloadRows(await rowsFor(appId, table)) };
    }
    if (data.capability === 'db.query' && data.method === 'search') {
      const query = String(payload.query || '').toLowerCase();
      const rows = (await rowsFor(appId, table)).filter((row) => JSON.stringify(row.payload).toLowerCase().includes(query));
      return { rows: payloadRows(rows) };
    }
    if (data.capability === 'storage.getUsage') {
      const rows = await withRows('readonly', (store) => requestResult(store.getAll()));
      const bytes = new TextEncoder().encode(JSON.stringify(rows.filter((row) => row.appId === appId))).byteLength;
      return { bytes };
    }
    throw new Error('Unsupported offline launcher bridge request: ' + data.capability + '/' + data.method);
  }

  window.addEventListener('message', async (event) => {
    if (!activeFrame || event.source !== activeFrame.contentWindow) return;
    const data = event.data || {};
    if (data.protocol !== 'shippie.bridge.v1' || !data.id) return;
    try {
      const result = await handleBridgeRequest(data);
      event.source.postMessage({ protocol: data.protocol, id: data.id, ok: true, result }, '*');
    } catch (error) {
      event.source.postMessage(
        { protocol: data.protocol, id: data.id, ok: false, error: { message: String(error && error.message ? error.message : error) } },
        '*',
      );
    }
  });

  if (navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      const data = event.data || {};
      if (data.type === REPAIR_EVENT && data.slug === activeSlug && navigator.onLine) {
        void repair(activeSlug, 'The saved capsule missed a file. Re-sealing it now.');
      }
    });
  }

  window.addEventListener('online', () => {
    if (activeSlug) void mountCapsule(activeSlug);
  });

  void mountCapsule(slugFromLocation()).catch((error) => {
    status('Could not open saved app', String(error && error.message ? error.message : error), [
      { label: 'Retry', onClick: () => mountCapsule(slugFromLocation()) },
    ]);
  });
})();
