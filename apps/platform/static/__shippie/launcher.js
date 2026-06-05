(function () {
  const DB = 'shippie.offline-capsules.v1';
  const POINTER_STORE = 'pointers';
  const LOCAL_DB = 'shippie.launcher-local-db.v1';
  const LOCAL_ROWS = 'rows';
  const CONTAINER_STATE_KEY = 'shippie.container.v1';
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

  function storedUrl(value) {
    const url = new URL(String(value || ''), window.location.origin);
    return url.origin === window.location.origin ? url.pathname + url.search : url.href;
  }

  function responseFromAssetCopy(pointer, value) {
    const key = storedUrl(value);
    const copies = Array.isArray(pointer && pointer.assetCopies) ? pointer.assetCopies : [];
    const copy = copies.find((item) => item && item.url === key);
    if (!copy || !copy.body) return null;
    const body = copy.body instanceof ArrayBuffer
      ? copy.body.slice(0)
      : ArrayBuffer.isView(copy.body)
        ? copy.body.buffer.slice(copy.body.byteOffset, copy.body.byteOffset + copy.body.byteLength)
        : null;
    if (!body) return null;
    return new Response(body, {
      status: copy.status || 200,
      statusText: copy.statusText || 'OK',
      headers: new Headers(Array.isArray(copy.headers) ? copy.headers : []),
    });
  }

  function manifestResponseFromPointer(pointer, slug) {
    const fromShadow = responseFromAssetCopy(pointer, capsuleManifestKey(slug, pointer.manifestHash));
    if (fromShadow) return fromShadow;
    return pointer && pointer.manifest
      ? new Response(JSON.stringify(pointer.manifest), { headers: { 'content-type': 'application/json' } })
      : null;
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
    const entry = (cache ? await cache.match(pointer.entryUrl) : null) || responseFromAssetCopy(pointer, pointer.entryUrl);
    const manifest =
      (cache ? await cache.match(capsuleManifestKey(slug, pointer.manifestHash)) : null) ||
      manifestResponseFromPointer(pointer, slug);
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

  function objectOrEmpty(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function blankContainerState() {
    return {
      openAppIds: [],
      importedApps: [],
      packageFilesByApp: {},
      receiptsByApp: {},
      rowsByApp: {},
      intentGrants: {},
      transferGrants: {},
      dismissedInsightIds: {},
    };
  }

  function normalizeLocalRows(rows) {
    if (!Array.isArray(rows)) return [];
    return rows
      .filter((row) => row && typeof row === 'object')
      .map((row) => ({
        id: typeof row.id === 'string' || typeof row.id === 'number' ? String(row.id) : '',
        table: typeof row.table === 'string' && row.table.length > 0 ? row.table : 'items',
        payload: row.payload,
        createdAt: typeof row.createdAt === 'string' ? row.createdAt : new Date().toISOString(),
      }))
      .filter((row) => row.id.length > 0);
  }

  function normalizeRowsByApp(rowsByApp) {
    const out = {};
    if (!rowsByApp || typeof rowsByApp !== 'object') return out;
    for (const appId of Object.keys(rowsByApp)) {
      out[appId] = normalizeLocalRows(rowsByApp[appId]);
    }
    return out;
  }

  function readContainerState() {
    try {
      const raw = window.localStorage.getItem(CONTAINER_STATE_KEY);
      if (!raw) return blankContainerState();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.openAppIds) || !parsed.receiptsByApp || !parsed.rowsByApp) {
        return null;
      }
      return {
        ...blankContainerState(),
        ...parsed,
        openAppIds: parsed.openAppIds.filter((appId) => typeof appId === 'string'),
        importedApps: Array.isArray(parsed.importedApps) ? parsed.importedApps : [],
        packageFilesByApp: objectOrEmpty(parsed.packageFilesByApp),
        receiptsByApp: objectOrEmpty(parsed.receiptsByApp),
        rowsByApp: normalizeRowsByApp(parsed.rowsByApp),
        intentGrants: objectOrEmpty(parsed.intentGrants),
        transferGrants: objectOrEmpty(parsed.transferGrants),
        dismissedInsightIds: objectOrEmpty(parsed.dismissedInsightIds),
      };
    } catch {
      return null;
    }
  }

  function writeContainerState(state) {
    try {
      window.localStorage.setItem(CONTAINER_STATE_KEY, JSON.stringify(state));
      return true;
    } catch {
      return false;
    }
  }

  function readContainerRows(appId) {
    const state = readContainerState();
    if (!state) return null;
    return normalizeLocalRows(state.rowsByApp[appId]);
  }

  function writeContainerRows(appId, rows) {
    const state = readContainerState();
    if (!state) return false;
    state.rowsByApp = {
      ...state.rowsByApp,
      [appId]: normalizeLocalRows(rows),
    };
    return writeContainerState(state);
  }

  async function legacyRowsForApp(appId) {
    return withRows('readonly', async (store) => {
      const rows = await requestResult(store.getAll());
      return rows.filter((row) => row.appId === appId).map(legacyRowToLocalRow);
    });
  }

  function legacyRowToLocalRow(row) {
    const payload = row && typeof row.payload === 'object' && row.payload !== null ? row.payload : {};
    const fallbackId = typeof row.id === 'string' ? row.id.split(':').pop() : '';
    const id = readRecordId(payload) || fallbackId || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
    return {
      id,
      table: typeof row.table === 'string' && row.table.length > 0 ? row.table : 'items',
      payload,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : new Date().toISOString(),
    };
  }

  function localRowToLegacyRow(appId, row) {
    return {
      id: appId + ':' + row.table + ':' + row.id,
      appId,
      table: row.table,
      payload: row.payload,
      createdAt: row.createdAt,
      updatedAt: new Date().toISOString(),
    };
  }

  async function writeLegacyRows(appId, rows) {
    await withRows('readwrite', async (store) => {
      const existing = await requestResult(store.getAll());
      for (const row of existing) {
        if (row.appId === appId) await requestResult(store.delete(row.id));
      }
      for (const row of rows) {
        await requestResult(store.put(localRowToLegacyRow(appId, row)));
      }
    });
  }

  function rowKey(row) {
    return row.table + ':' + row.id;
  }

  function rowTime(row) {
    const parsed = Date.parse(row.createdAt);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function mergeRows(primary, secondary) {
    const seen = new Set(primary.map(rowKey));
    const missing = secondary.filter((row) => {
      const key = rowKey(row);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return [...missing, ...primary].sort((a, b) => rowTime(b) - rowTime(a));
  }

  async function rowsForApp(appId) {
    const containerRows = readContainerRows(appId);
    if (containerRows) {
      const legacyRows = await legacyRowsForApp(appId).catch(() => []);
      const merged = mergeRows(containerRows, legacyRows);
      if (merged.length !== containerRows.length) writeContainerRows(appId, merged);
      return merged;
    }
    return legacyRowsForApp(appId);
  }

  async function persistRowsForApp(appId, rows) {
    if (writeContainerRows(appId, rows)) return;
    await writeLegacyRows(appId, rows);
  }

  function readPayloadTable(payload) {
    if (!payload || typeof payload !== 'object') return 'items';
    const table = payload.table;
    return typeof table === 'string' && table.length > 0 ? table : 'items';
  }

  function readPayloadValue(payload) {
    if (!payload || typeof payload !== 'object') return payload;
    const value = payload.value;
    return value && typeof value === 'object' ? value : payload;
  }

  function readPayloadId(payload) {
    if (!payload || typeof payload !== 'object') return null;
    return typeof payload.id === 'string' || typeof payload.id === 'number' ? String(payload.id) : null;
  }

  function readPayloadPatch(payload) {
    if (!payload || typeof payload !== 'object' || !payload.patch || typeof payload.patch !== 'object' || Array.isArray(payload.patch)) {
      return null;
    }
    return payload.patch;
  }

  function readRecordId(record) {
    if (!record || typeof record !== 'object') return null;
    return typeof record.id === 'string' || typeof record.id === 'number' ? String(record.id) : null;
  }

  function readRowRecord(row) {
    return row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload) ? row.payload : {};
  }

  function readQueryOptions(payload) {
    if (!payload || typeof payload !== 'object') return {};
    const opts = payload.opts && typeof payload.opts === 'object' ? payload.opts : payload;
    return {
      where: opts.where && typeof opts.where === 'object' && !Array.isArray(opts.where) ? opts.where : undefined,
      orderBy: opts.orderBy && typeof opts.orderBy === 'object' && !Array.isArray(opts.orderBy) ? opts.orderBy : undefined,
      limit: typeof opts.limit === 'number' ? opts.limit : undefined,
      offset: typeof opts.offset === 'number' ? opts.offset : undefined,
    };
  }

  function matchesWhere(row, where) {
    return Object.entries(where || {}).every(([key, expected]) => {
      if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
        const value = row[key];
        if (value === undefined) return false;
        if ('gte' in expected && Number(value) < Number(expected.gte)) return false;
        if ('lte' in expected && Number(value) > Number(expected.lte)) return false;
        if ('gt' in expected && Number(value) <= Number(expected.gt)) return false;
        if ('lt' in expected && Number(value) >= Number(expected.lt)) return false;
        return true;
      }
      return row[key] === expected;
    });
  }

  function compareValues(a, b) {
    if (a == null && b == null) return 0;
    if (a == null) return -1;
    if (b == null) return 1;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b));
  }

  function sortRows(rows, orderBy) {
    const entry = Object.entries(orderBy || {})[0];
    if (!entry) return rows;
    const [key, dir] = entry;
    return [...rows].sort((a, b) => compareValues(readRowRecord(a)[key], readRowRecord(b)[key]) * (dir === 'desc' ? -1 : 1));
  }

  function queryRows(rows, payload) {
    const table = readPayloadTable(payload);
    const opts = readQueryOptions(payload);
    let matches = rows.filter((row) => row.table === table && matchesWhere(readRowRecord(row), opts.where));
    if (opts.orderBy) matches = sortRows(matches, opts.orderBy);
    const offset = opts.offset || 0;
    const limit = typeof opts.limit === 'number' ? opts.limit : matches.length;
    return matches.slice(offset, offset + limit);
  }

  function searchRows(rows, payload) {
    const query = payload && typeof payload === 'object' ? payload.query : '';
    const needle = typeof query === 'string' ? query.toLowerCase() : '';
    if (!needle) return rows;
    return rows.filter((row) =>
      Object.values(readRowRecord(row)).some((value) => value != null && String(value).toLowerCase().includes(needle)),
    );
  }

  function buildLocalRow(payload, existingRowCount) {
    const record = readPayloadValue(payload);
    const id = readRecordId(record) || String(activeSlug || 'app').replace(/-/g, '_') + '_' + (existingRowCount + 1);
    return {
      id,
      table: readPayloadTable(payload),
      payload: record,
      createdAt: new Date().toISOString(),
    };
  }

  async function handleBridgeRequest(data) {
    const appId = data.appId || ('app_' + String(activeSlug || 'unknown').replace(/-/g, '_'));
    const payload = data.payload || {};
    if (data.capability === 'db.insert' && data.method === 'create') return { created: true, table: readPayloadTable(payload) };
    if (data.capability === 'db.insert' && data.method === 'insert') {
      const rows = await rowsForApp(appId);
      const row = buildLocalRow(payload, rows.length);
      await persistRowsForApp(appId, [row, ...rows]);
      return row;
    }
    if (data.capability === 'db.insert' && data.method === 'update') {
      const table = readPayloadTable(payload);
      const id = readPayloadId(payload);
      const patch = readPayloadPatch(payload);
      if (!id || !patch) return { updated: false };
      let updated = false;
      const rows = (await rowsForApp(appId)).map((row) => {
        if (row.table !== table || row.id !== id) return row;
        updated = true;
        return { ...row, payload: { ...readRowRecord(row), ...patch, id } };
      });
      await persistRowsForApp(appId, rows);
      return { updated };
    }
    if (data.capability === 'db.insert' && data.method === 'delete') {
      const table = readPayloadTable(payload);
      const id = readPayloadId(payload);
      if (!id) return { deleted: false };
      const rows = await rowsForApp(appId);
      const nextRows = rows.filter((row) => row.table !== table || row.id !== id);
      await persistRowsForApp(appId, nextRows);
      return { deleted: nextRows.length !== rows.length };
    }
    if (data.capability === 'db.query' && data.method === 'count') {
      return { count: queryRows(await rowsForApp(appId), payload).length };
    }
    if (data.capability === 'db.query' && data.method === 'lastBackup') return null;
    if (data.capability === 'db.query' && data.method === 'export') {
      return { table: readPayloadTable(payload), rows: queryRows(await rowsForApp(appId), payload) };
    }
    if (data.capability === 'db.query' && (data.method === 'query' || data.method === 'vectorSearch')) {
      return { rows: queryRows(await rowsForApp(appId), payload) };
    }
    if (data.capability === 'db.query' && data.method === 'search') {
      return { rows: searchRows(queryRows(await rowsForApp(appId), payload), payload) };
    }
    if (data.capability === 'storage.getUsage') {
      const rows = await rowsForApp(appId);
      return { rows: rows.length, bytes: JSON.stringify(rows).length };
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

  if (window.__SHIPPIE_TEST_OFFLINE_LAUNCHER__) {
    window.__shippieOfflineLauncherTest = {
      handleBridgeRequest,
      readContainerRows,
      rowsForApp,
    };
    return;
  }

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
