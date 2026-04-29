<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { readShippiePackageArchive } from '@shippie/app-package-builder';
  import { ContainerBridgeHost, createWindowBridgeTransport } from '@shippie/container-bridge';
  import {
    SHIPPIE_BACKUP_SCHEMA,
    assertValidPackageManifest,
    assertValidCollectionManifest,
    type AppCollectionEntry,
    type AppCollectionManifest,
    type AppPackageManifest,
    type AppReceipt,
  } from '@shippie/app-package-contract';
  import type { PageData } from './$types';
  import {
    type BridgeLog,
    type ContainerApp,
    type ContainerSection,
    type ContainerState,
    type LocalRow,
    type PackageFileCache,
    type UpdateCard,
    buildUpdateCard,
    createReceiptFor,
    decryptBackup,
    encryptBackup,
    isBackupEnvelope,
    isPackageArchiveShape,
    loadContainerState,
    sectionTitle,
    STORAGE_KEY,
  } from '$lib/container/state';
  import {
    findRequestedApp,
    manifestToContainerApp,
    mergeApps,
    pickBaseApps,
  } from '$lib/container/app-registry';
  import {
    buildLocalRow,
    computeStorageUsage,
    createAppHandlers,
    filterRowsByTable,
    type IntentRequestResult,
  } from '$lib/container/bridge-handlers';
  import {
    createIntentRegistry,
    grantIntent,
    isIntentGranted,
    revokeIntent,
    type IntentGrants,
  } from '$lib/container/intent-registry';
  import { createYourDataHost } from '$lib/container/your-data-host';
  import { createTextureRouter, type TextureName } from '$lib/container/texture-router';
  import {
    createMeshStatusStore,
    meshBadgeLabel,
    type MeshStatus,
  } from '$lib/container/mesh-status';
  import {
    createAiWorkerClient,
    createMemoryAiTransport,
    type AiRunRequest,
    type AiRunResult,
  } from '$lib/container/ai-worker-client';
  import {
    builtinStrategies,
    runAgent,
    type AgentRow,
    type Insight,
  } from '@shippie/agent';
  import InsightStrip from '$lib/container/InsightStrip.svelte';
  import { appPackageSrcdoc } from '$lib/container/app-srcdoc';
  import {
    createOrReusePackageFrameSource,
    markFrameBootingState,
    markFrameErrorState,
    markFrameReadyState,
    nextFrameReloadNonces,
    revokeAllPackageFrameSources,
    revokePackageFrameSource,
    type FrameReloadNonces,
    type FrameStates,
    type PackageFrameSourceCache,
  } from '$lib/container/frame-runtime';
  import {
    installBuiltPackage,
    recoveredReceiptsFor,
    uninstallContainerAppState,
  } from '$lib/container/package-runtime';

  let { data }: { data: PageData } = $props();

  const baseApps = $derived(pickBaseApps(data.packages));

  let importedApps = $state<ContainerApp[]>([]);
  const merged = $derived(mergeApps(baseApps, importedApps));
  const apps = $derived(merged.apps);
  const appById = $derived(merged.appById);
  const defaultAppId = $derived(merged.defaultAppId);
  const hosts = new Map<string, ContainerBridgeHost>();
  const frames = new Map<string, HTMLIFrameElement>();
  const packageObjectUrls: PackageFrameSourceCache = new Map();

  let section = $state<ContainerSection>('home');
  let activeAppId = $state<string | null>(null);
  let openAppIds = $state<string[]>([]);
  let receiptsByApp = $state<Record<string, AppReceipt>>({});
  let receiptExport = $state('');
  let backupPassphrase = $state('');
  let backupExport = $state('');
  let backupError = $state('');
  let restorePassphrase = $state('');
  let restorePayload = $state('');
  let restoreStatus = $state('');
  let packageImportPayload = $state('');
  let packageImportStatus = $state('');
  let packageFilesByApp = $state<Record<string, Record<string, PackageFileCache>>>({});
  let frameStates = $state<FrameStates>({});
  let frameReloadNonce = $state<FrameReloadNonces>({});
  let collectionUrl = $state('/api/collections/official');
  let collectionStatus = $state('');
  let activeCollection = $state<AppCollectionManifest | null>(null);
  let installingPackageHash = $state<string | null>(null);
  let rowsByApp = $state<Record<string, LocalRow[]>>({});
  let logs = $state<BridgeLog[]>([]);
  let bridgeStatus = $state<'waiting' | 'ready'>('waiting');
  let storageReady = $state(false);
  let intentGrants = $state<IntentGrants>({});
  type PendingPrompt = {
    consumerId: string;
    consumerName: string;
    intent: string;
    resolve: (result: IntentRequestResult) => void;
  };
  let pendingIntentQueue = $state<PendingPrompt[]>([]);
  const pendingIntentPrompt = $derived<PendingPrompt | null>(
    pendingIntentQueue.length > 0 ? pendingIntentQueue[0]! : null,
  );
  const intentRegistry = createIntentRegistry();
  let yourDataOpenForApp = $state<string | null>(null);
  const yourDataHost = createYourDataHost({
    onChange: (next) => {
      yourDataOpenForApp = next.appId;
      if (next.open) {
        section = 'data';
        activeAppId = null;
      }
    },
  });
  // Phase B4 — texture router. The actual fireTexture function is
  // dynamic-imported on first call so apps that never trigger a texture
  // don't pay the wrapper's bundle cost. The router validates the name
  // before we touch the engine; missing/garbage names short-circuit.
  let textureFire: (name: TextureName) => void = () => {};
  let texturesReady = false;
  async function ensureTextures() {
    if (texturesReady) return;
    texturesReady = true;
    try {
      const mod = await import('@shippie/sdk/wrapper');
      mod.registerBuiltinTextures();
      textureFire = mod.fireTexture as (name: TextureName) => void;
    } catch (err) {
      console.warn('[container] texture engine unavailable', err);
    }
  }
  const textureRouter = createTextureRouter({
    fire: (name) => {
      void ensureTextures().then(() => textureFire(name));
    },
  });
  // Phase B2 — mesh status. The store drives the topbar badge; the
  // Group object lives at the page level so leave/teardown is local.
  // Proximity is dynamic-imported so apps that never join a room don't
  // pay for the WebRTC + signal-client bundle.
  const meshStore = createMeshStatusStore();
  let meshStatus = $state<MeshStatus>(meshStore.current());
  meshStore.subscribe((next) => {
    meshStatus = next;
  });
  let meshGroup: { joinCode: string; roomId: string; members: () => string[]; leave: () => void } | null = null;
  let meshJoinCodeInput = $state('');
  let meshError = $state('');
  async function createMeshRoom() {
    meshError = '';
    if (meshGroup) return;
    meshStore.set({ state: 'connecting', roomId: 'pending' });
    try {
      const proximity = await import('@shippie/proximity');
      const group = await proximity.createGroup({ appSlug: 'shippie-container' });
      meshGroup = {
        joinCode: group.joinCode,
        roomId: group.roomId,
        members: () => group.members(),
        leave: () => group.leave(),
      };
      meshStore.set({
        state: 'connected',
        roomId: group.roomId,
        peerCount: group.members().length,
        joinCode: group.joinCode,
      });
    } catch (err) {
      meshError = err instanceof Error ? err.message : 'Could not start a room.';
      meshStore.set({ state: 'error', message: meshError });
    }
  }
  async function joinMeshRoom() {
    meshError = '';
    if (meshGroup) return;
    const code = meshJoinCodeInput.trim().toUpperCase();
    if (!code) {
      meshError = 'Enter a join code from the other device.';
      return;
    }
    meshStore.set({ state: 'connecting', roomId: 'pending' });
    try {
      const proximity = await import('@shippie/proximity');
      const group = await proximity.joinGroup({
        appSlug: 'shippie-container',
        joinCode: code,
      });
      meshGroup = {
        joinCode: group.joinCode,
        roomId: group.roomId,
        members: () => group.members(),
        leave: () => group.leave(),
      };
      meshStore.set({
        state: 'connected',
        roomId: group.roomId,
        peerCount: group.members().length,
        joinCode: group.joinCode,
      });
    } catch (err) {
      meshError = err instanceof Error ? err.message : 'Could not join that room.';
      meshStore.set({ state: 'error', message: meshError });
    }
  }
  function leaveMeshRoom() {
    if (!meshGroup) return;
    try {
      meshGroup.leave();
    } catch {
      /* noop — leaving is best-effort */
    }
    meshGroup = null;
    meshJoinCodeInput = '';
    meshStore.set({ state: 'idle' });
  }
  // Phase B1 — AI worker. The actual Web Worker is spawned lazily on
  // first ai.run; until then the container holds a placeholder client
  // backed by a memory transport that reports "unavailable" → the edge
  // fallback handles the request. When the Worker spawns successfully,
  // the placeholder is replaced and subsequent calls go local.
  function buildPlaceholderAiClient() {
    return createAiWorkerClient({
      transport: createMemoryAiTransport((req) => ({
        kind: 'shippie.ai.response',
        id: req.id,
        ok: true,
        result: { task: req.request.task, output: null, source: 'unavailable' },
      })),
      // No edge fallback wired yet — the Worker will report unavailable
      // until B1 ships its actual model loader. Iframe apps see a
      // controlled "unavailable" surface rather than a crash.
    });
  }
  let aiClient = buildPlaceholderAiClient();
  async function runAi(req: AiRunRequest): Promise<AiRunResult> {
    return aiClient.run(req);
  }
  // Phase C1 — local agent insights. Computed from the same rowsByApp
  // + appById state the bridge handlers see, so the agent's view of the
  // user matches what's actually installed and active. Dismissed ids
  // persist across reloads (intentGrants pattern); re-detection at
  // higher urgency overrides the dismissal.
  let dismissedInsightIds = $state<Record<string, number>>({});
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
  const agentInsights = $derived.by((): readonly Insight[] => {
    const now = Date.now();
    const validDismissals = new Set(
      Object.entries(dismissedInsightIds)
        .filter(([, ts]) => now - ts < SEVEN_DAYS)
        .map(([id]) => id),
    );
    const rows: AgentRow[] = [];
    for (const [appId, appRows] of Object.entries(rowsByApp)) {
      const app = appById.get(appId);
      if (!app) continue;
      for (const row of appRows) {
        rows.push({
          appSlug: app.slug,
          table: row.table,
          payload: row.payload,
          createdAt: new Date(row.createdAt).getTime(),
        });
      }
    }
    const result = runAgent(
      {
        now,
        apps: installedApps.map((app) => ({
          slug: app.slug,
          name: app.name,
          category: app.category,
          provides: app.permissions.capabilities.crossAppIntents?.provides,
          consumes: app.permissions.capabilities.crossAppIntents?.consumes,
        })),
        rows,
        recentInsightIds: validDismissals,
      },
      builtinStrategies,
    );
    return result.insights;
  });
  function openInsight(insight: Insight) {
    const target = apps.find((a) => a.slug === insight.target.app);
    if (target) openApp(target.id);
  }
  function dismissInsight(insight: Insight) {
    dismissedInsightIds = { ...dismissedInsightIds, [insight.id]: Date.now() };
  }

  const activeApp = $derived(activeAppId ? appById.get(activeAppId) : null);
  const installedApps = $derived(apps.filter((app) => openAppIds.includes(app.id)));
  const recoveredReceipts = $derived(recoveredReceiptsFor(receiptsByApp, appById));
  const totalRows = $derived(Object.values(rowsByApp).reduce((sum, rows) => sum + rows.length, 0));
  const updateCards = $derived(
    installedApps
      .map((app) => buildUpdateCard(app, receiptsByApp[app.id]))
      .filter((card): card is UpdateCard => Boolean(card)),
  );

  function openApp(appId: string) {
    if (!openAppIds.includes(appId)) {
      openAppIds = [...openAppIds, appId];
    }
    const app = appById.get(appId);
    if (app && !receiptsByApp[appId]) {
      receiptsByApp = {
        ...receiptsByApp,
        [appId]: createReceiptFor(app),
      };
    }
    activeAppId = appId;
    section = 'home';
  }

  function goHome() {
    activeAppId = null;
    section = 'home';
  }

  function showSection(next: ContainerSection) {
    activeAppId = null;
    section = next;
  }

  function registerFrame(node: HTMLIFrameElement, appId: string) {
    frames.set(appId, node);
    markFrameBooting(appId);
    void bootHost(appId, node);
    const timeout = window.setTimeout(() => {
      if (frameStates[appId]?.status === 'booting') {
        markFrameError(appId, 'This app took too long to start.');
      }
    }, 15_000);

    return {
      destroy() {
        window.clearTimeout(timeout);
        frames.delete(appId);
        hosts.get(appId)?.dispose();
        hosts.delete(appId);
      },
    };
  }

  function markFrameBooting(appId: string) {
    frameStates = markFrameBootingState(frameStates, appId);
  }

  function markFrameReady(appId: string) {
    frameStates = markFrameReadyState(frameStates, appId);
  }

  function markFrameError(appId: string, message = 'This app could not open in the container.') {
    frameStates = markFrameErrorState(frameStates, appId, message);
  }

  function reloadFrame(appId: string) {
    markFrameBooting(appId);
    revokePackageFrameSource(appId, packageObjectUrls);
    frameReloadNonce = nextFrameReloadNonces(frameReloadNonce, appId);
  }

  async function bootHost(appId: string, frame: HTMLIFrameElement) {
    const app = appById.get(appId);
    if (!app || hosts.has(appId)) return;

    await new Promise((resolve) => requestAnimationFrame(resolve));
    if (!frame.contentWindow) return;

    hosts.set(
      appId,
      new ContainerBridgeHost({
        appId,
        permissions: app.permissions,
        transport: createWindowBridgeTransport({
          currentWindow: window,
          targetWindow: frame.contentWindow,
          targetOrigin: '*',
        }),
        maxPayloadBytes: 32 * 1024,
        rateLimit: { maxRequests: 80, windowMs: 10_000 },
        handlers: createAppHandlers({
          appId,
          app,
          insertRow,
          queryRows,
          storageUsage,
          consumeIntent,
          consumersFor: (intent) => intentRegistry.consumersFor(intent),
          dataOpenPanel: (id) => {
            yourDataHost.openFor(id);
            return { opened: true };
          },
          fireTexture: (name) => textureRouter.fire(name),
          runAi,
          broadcastIntent: (providerAppId, intent, rows) =>
            broadcastIntentToConsumers(providerAppId, intent, rows),
        }),
      }),
    );

    bridgeStatus = 'ready';
  }

  async function consumeIntent(
    consumerAppId: string,
    intent: string,
  ): Promise<IntentRequestResult> {
    const consumerApp = appById.get(consumerAppId);
    if (!consumerApp) {
      return { provider: null, rows: [], reason: 'no_provider' };
    }
    // Trigger the prompt the first time this consumer asks for the
    // intent. Grants are keyed by (consumer, intent) — once approved,
    // any provider firing this intent reaches the consumer with no
    // further prompts.
    if (!isIntentGranted(intentGrants, consumerAppId, intent)) {
      // De-dupe: if the same (consumer, intent) is already queued,
      // resolve the new request when the existing one resolves.
      const existing = pendingIntentQueue.find(
        (p) => p.consumerId === consumerAppId && p.intent === intent,
      );
      if (existing) {
        return new Promise<IntentRequestResult>((resolve) => {
          const prevResolve = existing.resolve;
          existing.resolve = (result) => {
            prevResolve(result);
            resolve(result);
          };
        });
      }
      return new Promise<IntentRequestResult>((resolve) => {
        pendingIntentQueue = [
          ...pendingIntentQueue,
          { consumerId: consumerAppId, consumerName: consumerApp.name, intent, resolve },
        ];
      });
    }
    return collectRowsForIntent(intent);
  }

  function collectRowsForIntent(intent: string): IntentRequestResult {
    const providers = intentRegistry.providersFor(intent);
    const rows: LocalRow[] = [];
    let firstProvider: { appId: string; appSlug: string; appName: string } | null = null;
    for (const p of providers) {
      const slice = filterRowsByTable(rowsByApp[p.appId] ?? [], { table: intent });
      if (slice.length > 0 && !firstProvider) {
        firstProvider = { appId: p.appId, appSlug: p.appSlug, appName: p.appName };
      }
      rows.push(...slice);
    }
    return { provider: firstProvider, rows };
  }

  function approveIntentPrompt() {
    if (!pendingIntentPrompt) return;
    const { consumerId, intent, resolve } = pendingIntentPrompt;
    intentGrants = grantIntent(intentGrants, consumerId, intent);
    resolve(collectRowsForIntent(intent));
    pendingIntentQueue = pendingIntentQueue.slice(1);
  }

  function denyIntentPrompt() {
    if (!pendingIntentPrompt) return;
    pendingIntentPrompt.resolve({
      provider: null,
      rows: [],
      reason: 'permission_denied',
    });
    pendingIntentQueue = pendingIntentQueue.slice(1);
  }

  function revokeIntentGrant(consumerId: string, intent: string) {
    intentGrants = revokeIntent(intentGrants, consumerId, intent);
  }

  /**
   * Phase C2 — fan an `intent.provide` broadcast out to every consumer
   * iframe that has been granted access to this intent. Pre-grant
   * consumers are simply skipped; the real intent-consume permission
   * prompt path still gates first-time access.
   */
  function broadcastIntentToConsumers(
    providerAppId: string,
    intent: string,
    rows: readonly unknown[],
  ): { delivered: number } {
    const consumers = intentRegistry.consumersFor(intent);
    let delivered = 0;
    for (const consumer of consumers) {
      if (consumer.appId === providerAppId) continue;
      if (!isIntentGranted(intentGrants, consumer.appId, intent)) continue;
      const frame = frames.get(consumer.appId);
      const target = frame?.contentWindow;
      if (!target) continue;
      target.postMessage(
        { kind: 'shippie.intent.broadcast', intent, rows, providerAppId },
        '*',
      );
      delivered += 1;
    }
    return { delivered };
  }

  function insertRow(appId: string, payload: unknown): LocalRow {
    const slug = appById.get(appId)?.slug ?? 'app';
    const existing = rowsByApp[appId] ?? [];
    const row = buildLocalRow(appId, slug, payload, existing.length);
    rowsByApp = {
      ...rowsByApp,
      [appId]: [row, ...existing],
    };
    return row;
  }

  function queryRows(appId: string, payload: unknown) {
    return { rows: filterRowsByTable(rowsByApp[appId] ?? [], payload) };
  }

  function storageUsage(appId: string) {
    return computeStorageUsage(rowsByApp[appId] ?? []);
  }

  function clearAppData(appId: string) {
    rowsByApp = {
      ...rowsByApp,
      [appId]: [],
    };
  }

  function uninstallApp(appId: string) {
    hosts.get(appId)?.dispose();
    hosts.delete(appId);
    frames.delete(appId);
    revokePackageFrameSource(appId, packageObjectUrls);

    const next = uninstallContainerAppState(
      {
        importedApps,
        openAppIds,
        receiptsByApp,
        rowsByApp,
        packageFilesByApp,
        intentGrants,
        activeAppId,
      },
      appId,
    );
    importedApps = next.importedApps;
    openAppIds = next.openAppIds;
    receiptsByApp = next.receiptsByApp;
    rowsByApp = next.rowsByApp;
    packageFilesByApp = next.packageFilesByApp;
    intentGrants = next.intentGrants;
    activeAppId = next.activeAppId;
    if (!activeAppId) section = 'home';
  }

  function forgetRecoveredReceipt(appId: string) {
    const { [appId]: _receipt, ...nextReceipts } = receiptsByApp;
    const { [appId]: _rows, ...nextRows } = rowsByApp;
    receiptsByApp = nextReceipts;
    rowsByApp = nextRows;
  }

  function importPackageForReceipt(appId: string) {
    section = 'create';
    activeAppId = null;
    packageImportStatus = `Paste the .shippie archive for ${appId} to reconnect this receipt.`;
  }

  function acceptUpdate(appId: string) {
    const app = appById.get(appId);
    if (!app) return;
    receiptsByApp = {
      ...receiptsByApp,
      [appId]: createReceiptFor(app),
    };
  }

  function stayOnCurrent(appId: string) {
    const app = appById.get(appId);
    if (!app) return;
    logs = [
      {
        id: `${Date.now()}_stay`,
        appId,
        at: new Date().toLocaleTimeString(),
        capability: 'package.update',
        method: 'stay-current',
        summary: `Staying on installed ${receiptsByApp[appId]?.version ?? 'version'}`,
      },
      ...logs.slice(0, 11),
    ];
  }

  function exportReceipts() {
    receiptExport = JSON.stringify(Object.values(receiptsByApp), null, 2);
  }

  async function createEncryptedBackup() {
    backupError = '';
    backupExport = '';
    if (backupPassphrase.length < 8) {
      backupError = 'Use at least 8 characters for the backup key.';
      return;
    }

    try {
      const archive = {
        manifest: {
          schema: SHIPPIE_BACKUP_SCHEMA,
          createdAt: new Date().toISOString(),
          encrypted: true as const,
          receipts: Object.values(receiptsByApp),
          apps: Object.entries(receiptsByApp).map(([appId, receipt]) => ({
            appId,
            packageHash: receipt.packageHash,
            dataPath: `apps/${appId}/rows.json`,
            settingsPath: `apps/${appId}/settings.json`,
          })),
        },
        rowsByApp,
      };
      const envelope = await encryptBackup(backupPassphrase, archive);
      backupExport = JSON.stringify(envelope, null, 2);
    } catch (err) {
      backupError = err instanceof Error ? err.message : 'Backup encryption failed.';
    }
  }

  async function restoreEncryptedBackup() {
    restoreStatus = '';
    if (!restorePayload.trim() || restorePassphrase.length < 8) {
      restoreStatus = 'Paste an encrypted backup and enter its backup key.';
      return;
    }

    try {
      const parsed = JSON.parse(restorePayload) as unknown;
      if (!isBackupEnvelope(parsed)) {
        restoreStatus = 'This does not look like a Shippie encrypted backup.';
        return;
      }
      const archive = await decryptBackup(restorePassphrase, parsed);
      if (
        archive.manifest?.schema !== SHIPPIE_BACKUP_SCHEMA ||
        !Array.isArray(archive.manifest.receipts)
      ) {
        restoreStatus = 'Backup decrypted, but the archive manifest is invalid.';
        return;
      }

      const restoredReceipts = Object.fromEntries(
        archive.manifest.receipts.map((receipt) => [receipt.appId, receipt]),
      );
      receiptsByApp = { ...receiptsByApp, ...restoredReceipts };
      if (archive.rowsByApp && typeof archive.rowsByApp === 'object') {
        rowsByApp = { ...rowsByApp, ...archive.rowsByApp };
      }
      const knownRestoredApps = archive.manifest.receipts
        .map((receipt) => receipt.appId)
        .filter((appId) => appById.has(appId));
      openAppIds = [...new Set([...openAppIds, ...knownRestoredApps])];
      restoreStatus = `Restored ${archive.manifest.receipts.length} receipts and ${knownRestoredApps.length} known apps.`;
    } catch {
      restoreStatus = 'Could not decrypt this backup with that key.';
    }
  }

  async function importPackage() {
    try {
      const parsed = JSON.parse(packageImportPayload) as unknown;
      if (isPackageArchiveShape(parsed)) {
        await importPackageArchive();
      } else {
        importPackageManifest(parsed);
      }
    } catch (err) {
      packageImportStatus = err instanceof Error ? err.message : 'Could not read package JSON.';
    }
  }

  function importPackageManifest(parsed: unknown) {
    packageImportStatus = '';
    try {
      const manifest = parsed as AppPackageManifest;
      assertValidPackageManifest(manifest);
      if (!manifest.runtime.container) {
        packageImportStatus = 'This package is standalone-only and cannot run in the container yet.';
        return;
      }
      const app = manifestToContainerApp(manifest);
      importedApps = [...importedApps.filter((existing) => existing.id !== app.id), app];
      packageImportStatus = `Imported ${app.name} from a package manifest. Paste a full archive to cache app files.`;
      openApp(app.id);
    } catch (err) {
      packageImportStatus = err instanceof Error ? err.message : 'Could not import package manifest.';
    }
  }

  async function importPackageArchive() {
    packageImportStatus = '';
    try {
      const built = await readShippiePackageArchive(packageImportPayload);
      const app = cacheBuiltPackage(built);
      packageImportStatus = `Imported and cached ${app.name} from a verified .shippie archive.`;
    } catch (err) {
      packageImportStatus = err instanceof Error ? err.message : 'Could not import package archive.';
    }
  }

  function cacheBuiltPackage(built: Awaited<ReturnType<typeof readShippiePackageArchive>>): ContainerApp {
    const { app, packageFiles } = installBuiltPackage(built);
    importedApps = [...importedApps.filter((existing) => existing.id !== app.id), app];
    packageFilesByApp = {
      ...packageFilesByApp,
      [app.id]: packageFiles,
    };
    openApp(app.id);
    return app;
  }

  async function loadCollection() {
    collectionStatus = '';
    const url = collectionUrl.trim() || '/api/collections/official';
    try {
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!response.ok) {
        throw new Error(`Collection returned ${response.status}.`);
      }
      const collection = (await response.json()) as AppCollectionManifest;
      assertValidCollectionManifest(collection);
      activeCollection = collection;
      collectionUrl = url;
      collectionStatus = `Loaded ${collection.packages.length} app${collection.packages.length === 1 ? '' : 's'} from ${collection.name}.`;
    } catch (err) {
      collectionStatus = err instanceof Error ? err.message : 'Could not load collection.';
    }
  }

  async function installCollectionEntry(entry: AppCollectionEntry) {
    if (appById.has(entry.appId)) {
      openApp(entry.appId);
      return;
    }

    installingPackageHash = entry.packageHash;
    collectionStatus = `Downloading ${entry.name}...`;
    try {
      const response = await fetch(entry.packageUrl, { headers: { Accept: 'application/vnd.shippie.package+json' } });
      if (!response.ok) {
        throw new Error(`Package returned ${response.status}.`);
      }
      const built = await readShippiePackageArchive(new Uint8Array(await response.arrayBuffer()));
      if (built.packageHash !== entry.packageHash) {
        throw new Error('Downloaded package hash does not match the collection entry.');
      }
      const app = cacheBuiltPackage(built);
      collectionStatus = `Installed ${app.name} from ${activeCollection?.name ?? 'collection'}.`;
    } catch (err) {
      collectionStatus = err instanceof Error ? err.message : `Could not install ${entry.name}.`;
    } finally {
      installingPackageHash = null;
    }
  }

  function recordFromEvent(event: MessageEvent) {
    const data = event.data as {
      appId?: string;
      capability?: string;
      method?: string;
      payload?: unknown;
    } | null;
    if (!data?.appId || !data.capability || !data.method) return;
    logs = [
      {
        id: `${Date.now()}_${logs.length}`,
        appId: data.appId,
        at: new Date().toLocaleTimeString(),
        capability: data.capability,
        method: data.method,
        summary: JSON.stringify(data.payload ?? {}),
      },
      ...logs.slice(0, 11),
    ];
  }

  $effect(() => {
    window.addEventListener('message', recordFromEvent);
    return () => window.removeEventListener('message', recordFromEvent);
  });

  // Refresh the cross-app intent registry whenever the installed-apps
  // list changes. The registry owns provider/consumer indexing; the
  // bridge handlers consult it on every intent.consume call.
  $effect(() => {
    intentRegistry.refresh(apps);
  });

  $effect(() => {
    if (!storageReady) return;
    const state: ContainerState = {
      openAppIds,
      importedApps,
      packageFilesByApp,
      receiptsByApp,
      rowsByApp,
      intentGrants,
      dismissedInsightIds,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  });

  onMount(() => {
    const saved = loadContainerState(localStorage);
    if (saved) {
      importedApps = saved.importedApps ?? [];
      packageFilesByApp = saved.packageFilesByApp ?? {};
      const knownAppIds = new Set(apps.map((app) => app.id));
      const savedOpenApps = saved.openAppIds.filter((appId) => knownAppIds.has(appId));
      openAppIds = savedOpenApps.length > 0 ? savedOpenApps : defaultAppId ? [defaultAppId] : [];
      receiptsByApp = {
        ...Object.fromEntries(openAppIds.map((appId) => [appId, createReceiptFor(appById.get(appId)!)])),
        ...saved.receiptsByApp,
      };
      rowsByApp = saved.rowsByApp;
      intentGrants = saved.intentGrants ?? {};
      dismissedInsightIds = saved.dismissedInsightIds ?? {};
    } else if (defaultAppId) {
      const defaultApp = appById.get(defaultAppId);
      openAppIds = [defaultAppId];
      receiptsByApp = defaultApp ? { [defaultAppId]: createReceiptFor(defaultApp) } : {};
      activeAppId = defaultAppId;
    }
    const requestedApp = data.requestedAppSlug
      ? apps.find((app) => app.slug === data.requestedAppSlug)
      : null;
    if (requestedApp) {
      openApp(requestedApp.id);
    } else if (!activeAppId || !appById.has(activeAppId)) {
      activeAppId = openAppIds[0] ?? null;
    }
    storageReady = true;
    void loadCollection();
  });

  onDestroy(() => {
    for (const host of hosts.values()) host.dispose();
    hosts.clear();
    revokeAllPackageFrameSources(packageObjectUrls);
    aiClient.dispose();
  });

  function srcdocFor(app: ContainerApp): string {
    return appPackageSrcdoc(app, packageFilesByApp[app.id]);
  }

  function frameSrcFor(app: ContainerApp): string | null {
    return createOrReusePackageFrameSource(app, packageFilesByApp[app.id], packageObjectUrls);
  }

  /**
   * Pick the iframe URL for an app based on environment:
   *   - Localhost dev: prefer devUrl (Vite dev server with HMR)
   *   - On *.shippie.app: prefer the showcase's clean subdomain URL
   *     (e.g. https://recipe.shippie.app/), which the platform Worker
   *     rewrites to /run/<slug>/ in apps/platform/src/hooks.server.ts
   *   - Otherwise: standaloneUrl (e.g. /run/<slug>/) on the same origin
   */
  function runtimeSrcFor(app: ContainerApp): string | null {
    if (typeof window === 'undefined') return null;
    const host = window.location.hostname;
    const onLocalhost = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
    if (onLocalhost && app.devUrl) return app.devUrl;
    // In prod, prefer the subdomain URL extracted from /run/<slug>/.
    if (!onLocalhost && app.standaloneUrl?.startsWith('/run/')) {
      const slug = app.standaloneUrl.slice('/run/'.length).replace(/\/+$/, '');
      if (host.endsWith('.shippie.app') || host === 'shippie.app') {
        return `https://${slug}.shippie.app/`;
      }
      return app.standaloneUrl; // fallback for hub.local etc
    }
    return null;
  }

</script>

<svelte:head>
  <title>Shippie Container</title>
  <meta
    name="description"
    content="The Shippie container runtime: one installed app for local-first apps, receipts, and portable packages."
  />
</svelte:head>

{#if pendingIntentPrompt}
  <div class="intent-prompt-backdrop" role="presentation">
    <div class="intent-prompt" role="dialog" aria-labelledby="intent-prompt-title">
      <h3 id="intent-prompt-title">Cross-app permission</h3>
      <p>
        <strong>{pendingIntentPrompt.consumerName}</strong> wants to receive
        <code>{pendingIntentPrompt.intent}</code> events from any installed app.
      </p>
      <p class="hint">
        Both apps stay sandboxed. Only the matching event rows are shared — never any other data.
        New apps that fire this event later won't ask again. You can revoke later in Your Data.
      </p>
      <div class="intent-prompt-actions">
        <button class="intent-deny" onclick={denyIntentPrompt}>Deny</button>
        <button class="intent-allow" onclick={approveIntentPrompt}>Allow</button>
      </div>
    </div>
  </div>
{/if}

<section class="shell">
  <aside class="sidebar">
    <div>
      <p class="eyebrow">Shippie Container</p>
      <h1>One Shippie. Every app. Your data stays here.</h1>
      <p class="lede">
        A package-aware shell for local-first apps. URLs still exist, but the
        installed Shippie app becomes the user's quiet home.
      </p>
    </div>

    <div class="status-panel">
      <span class="status" class:ready={bridgeStatus === 'ready'}>{bridgeStatus}</span>
      <p>{installedApps.length} installed apps · {totalRows} local rows</p>
      <p>{Object.keys(receiptsByApp).length} local receipts · sandboxed capability bridge.</p>
    </div>

    <nav class="tabs" aria-label="Container sections">
      <button class:active={section === 'home'} onclick={() => showSection('home')}>Home</button>
      <button class:active={section === 'create'} onclick={() => showSection('create')}>Create</button>
      <button class:active={section === 'data'} onclick={() => showSection('data')}>Your Data</button>
    </nav>
  </aside>

  <main class="workspace">
    <div class="topbar">
      <button class="home-button" onclick={goHome}>Home</button>
      <div>
        <p class="mini-label">Running in Shippie</p>
        <h2>{activeApp?.name ?? sectionTitle(section)}</h2>
      </div>
      {#if meshBadgeLabel(meshStatus)}
        <button
          class="mesh-badge"
          class:active={meshStatus.state === 'connected'}
          onclick={() => showSection('home')}
          title="Nearby devices"
        >
          {meshBadgeLabel(meshStatus)}
        </button>
      {/if}
      {#if activeApp}
        <a href={activeApp.devUrl ?? activeApp.standaloneUrl} target={activeApp.devUrl ? '_blank' : undefined} rel={activeApp.devUrl ? 'noopener' : undefined} class="open-link" data-sveltekit-preload-data="off">{activeApp.devUrl ? 'Open standalone' : 'Standalone URL'}</a>
      {/if}
    </div>

    {#if !activeApp}
      <section class="panel">
        {#if section === 'home'}
          <InsightStrip
            insights={agentInsights}
            onOpen={openInsight}
            onDismiss={dismissInsight}
          />
          <div class="section-head">
            <h2>Your Apps</h2>
            <p>Open apps stay warm in their sandbox. Switch away and return without a reload.</p>
          </div>
          <div class="updates">
            <h3>Updates</h3>
            {#if updateCards.length > 0}
              {#each updateCards as card (card.app.id)}
                <article>
                  <div>
                    <strong>{card.app.name} v{card.app.version}</strong>
                    <p>
                      Installed v{card.receipt.version}.
                      {card.packageHashChanged ? ' Package changed.' : ' Package hash unchanged.'}
                      {card.kindChanged ? ' App kind changed.' : ' Data posture unchanged.'}
                      {#if card.addedNetworkDomains.length > 0}
                        New domains: {card.addedNetworkDomains.join(', ')}.
                      {/if}
                      {#if card.addedPermissions.length > 0}
                        New capabilities: {card.addedPermissions.join(', ')}.
                      {/if}
                      {#if card.latestSecurityScore !== null || card.latestPrivacyGrade}
                        Trust now: {card.latestSecurityScore ?? 'unscored'} security · {card.latestPrivacyGrade ?? 'ungraded'} privacy.
                      {/if}
                    </p>
                  </div>
                  <div class="row-actions">
                    <button onclick={() => stayOnCurrent(card.app.id)}>Stay</button>
                    <button onclick={() => acceptUpdate(card.app.id)}>Update</button>
                  </div>
                </article>
              {/each}
            {:else}
              <p>All installed apps match their latest package receipt.</p>
            {/if}
          </div>
          <div class="app-grid">
            {#each apps as app (app.id)}
              {@const installed = openAppIds.includes(app.id)}
              <button class="app-tile" class:installable={!installed} onclick={() => openApp(app.id)}>
                <span class="app-icon" style={`--accent:${app.accent}`}>{app.icon}</span>
                <strong>{app.name}</strong>
                <small>{installed ? app.labelKind : 'Install'}</small>
              </button>
            {/each}
          </div>
          <div class="nearby-panel">
            <h3>Nearby</h3>
            {#if meshStatus.state === 'connected'}
              <p>
                In a local room. Join code <code>{meshStatus.joinCode}</code> · {meshStatus.peerCount} other device{meshStatus.peerCount === 1 ? '' : 's'} connected.
              </p>
              <button class="mesh-leave" onclick={leaveMeshRoom}>Leave room</button>
            {:else if meshStatus.state === 'connecting'}
              <p>Connecting locally…</p>
            {:else}
              <p>Connect locally with people in the same room — no servers, no accounts.</p>
              <div class="mesh-actions">
                <button class="mesh-create" onclick={createMeshRoom}>Start a room</button>
                <span>or</span>
                <input
                  class="mesh-code-input"
                  id="mesh-join-code"
                  name="mesh-join-code"
                  placeholder="Paste join code"
                  bind:value={meshJoinCodeInput}
                  spellcheck="false"
                  autocapitalize="characters"
                  maxlength="32"
                />
                <button class="mesh-join" onclick={joinMeshRoom}>Join</button>
              </div>
              {#if meshError}
                <p class="error-text">{meshError}</p>
              {/if}
            {/if}
          </div>
        {:else if section === 'create'}
          <div class="collection-panel">
            <div>
              <h3>Collections</h3>
              <p>Collections are portable app indexes. Official Shippie, Hub, school, venue, and community nodes all speak the same manifest.</p>
            </div>
            <div class="collection-actions">
              <input
                id="collection-url"
                name="collection-url"
                bind:value={collectionUrl}
                placeholder="/api/collections/official or http://hub.local/collections/local-mirror.json"
                spellcheck="false"
                autocapitalize="off"
              />
              <button onclick={loadCollection}>Load</button>
            </div>
            {#if collectionStatus}
              <p class="collection-status">{collectionStatus}</p>
            {/if}
            {#if activeCollection}
              <div class="collection-meta">
                <strong>{activeCollection.name}</strong>
                <span>{activeCollection.kind} · updated {new Date(activeCollection.updatedAt).toLocaleString()}</span>
              </div>
              {#if activeCollection.packages.length === 0}
                <p>This collection is valid, but it does not list any apps yet.</p>
              {:else}
                <div class="collection-list">
                  {#each activeCollection.packages as entry (entry.packageHash)}
                    <article>
                      <span class="app-icon" style={`--accent:${entry.kind === 'local' ? '#74A57F' : entry.kind === 'connected' ? '#4E7C9A' : '#B6472D'}`}>
                        {entry.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}
                      </span>
                      <div>
                        <h3>{entry.name}</h3>
                        <p>{entry.summary ?? `${entry.kind} app · ${entry.packageHash.slice(0, 18)}...`}</p>
                      </div>
                      <button
                        disabled={installingPackageHash === entry.packageHash}
                        onclick={() => installCollectionEntry(entry)}
                      >
                        {appById.has(entry.appId) ? 'Open' : installingPackageHash === entry.packageHash ? 'Installing' : 'Install'}
                      </button>
                    </article>
                  {/each}
                </div>
              {/if}
            {/if}
          </div>
          <hr />
          <div class="section-head">
            <h2>Build your own</h2>
            <p>Entry points for MCP deploys, Remix, Fork, and package import.</p>
          </div>
          <div class="action-grid">
            <a href="/new">Deploy app</a>
            <button>Remix template</button>
            <button>Connect Claude Code</button>
          </div>
          <div class="backup-box">
            <div>
              <h3>Import Package</h3>
              <p>Paste a portable .shippie archive to cache an app locally, or a manifest to add its receipt.</p>
            </div>
            <textarea
              bind:value={packageImportPayload}
              placeholder="Paste a .shippie archive JSON or manifest.json"
              spellcheck="false"
            ></textarea>
            <button class="export-button" onclick={importPackage}>Import package</button>
            {#if packageImportStatus}
              <p>{packageImportStatus}</p>
            {/if}
          </div>
        {:else}
          <div class="section-head">
            <h2>Your Data</h2>
            <p>Receipts and local storage are user-owned. Export proves what is installed without needing an account.</p>
          </div>
          {#if yourDataOpenForApp && appById.get(yourDataOpenForApp)}
            <div class="data-trigger" role="status">
              <span><strong>{appById.get(yourDataOpenForApp)?.name}</strong> opened this panel.</span>
              <button onclick={() => yourDataHost.close()}>Dismiss</button>
            </div>
          {/if}
          <div class="data-list">
            {#each installedApps as app (app.id)}
              <article>
                <div>
                  <h3>{app.name}</h3>
                  <p>
                    v{receiptsByApp[app.id]?.version}
                    · {(rowsByApp[app.id]?.length ?? 0)} local rows
                    · {app.packageHash.slice(0, 18)}...
                  </p>
                </div>
                <div class="row-actions">
                  <button onclick={() => openApp(app.id)}>Open</button>
                  <button onclick={() => clearAppData(app.id)}>Clear data</button>
                  <button onclick={() => uninstallApp(app.id)}>Uninstall</button>
                </div>
              </article>
            {/each}
          </div>
          {#if recoveredReceipts.length > 0}
            <div class="recovered-receipts">
              <h3>Receipts Waiting For Packages</h3>
              <p>
                These came back from a backup, but their app package is not installed here yet.
                Your receipt stays local until you import the matching .shippie archive.
              </p>
              <div class="data-list">
                {#each recoveredReceipts as item (item.appId)}
                  <article>
                    <div>
                      <h3>{item.receipt.name ?? item.appId}</h3>
                      <p>
                        v{item.receipt.version}
                        · {item.receipt.packageHash.slice(0, 18)}...
                        · {(rowsByApp[item.appId]?.length ?? 0)} restored rows
                      </p>
                    </div>
                    <div class="row-actions">
                      <button onclick={() => importPackageForReceipt(item.appId)}>Import package</button>
                      <button onclick={() => forgetRecoveredReceipt(item.appId)}>Forget receipt</button>
                    </div>
                  </article>
                {/each}
              </div>
            </div>
          {/if}
          <button class="export-button" onclick={exportReceipts}>Export receipts</button>
          {#if receiptExport}
            <pre class="receipt-export">{receiptExport}</pre>
          {/if}
          <div class="backup-box">
            <div>
              <h3>Encrypted Backup</h3>
              <p>Bundles receipts and local namespace rows into one passphrase-encrypted export.</p>
            </div>
            <input
              type="password"
              bind:value={backupPassphrase}
              placeholder="Backup key"
              autocomplete="new-password"
            />
            <button class="export-button" onclick={createEncryptedBackup}>Create encrypted backup</button>
            {#if backupError}
              <p class="error-text">{backupError}</p>
            {/if}
            {#if backupExport}
              <pre class="receipt-export">{backupExport}</pre>
            {/if}
          </div>
          <div class="backup-box">
            <div>
              <h3>Restore Backup</h3>
              <p>Rehydrates receipts and rows locally. Unknown apps stay as receipts until package import exists.</p>
            </div>
            <textarea
              bind:value={restorePayload}
              placeholder="Paste encrypted backup JSON"
              spellcheck="false"
            ></textarea>
            <input
              type="password"
              bind:value={restorePassphrase}
              placeholder="Backup key"
              autocomplete="current-password"
            />
            <button class="export-button" onclick={restoreEncryptedBackup}>Restore locally</button>
            {#if restoreStatus}
              <p>{restoreStatus}</p>
            {/if}
          </div>
        {/if}
      </section>
    {/if}

    <section class="viewport-area" class:hidden={!activeApp}>
      {#each openAppIds as appId (appId)}
        {@const app = appById.get(appId)}
        {#if app}
          {@const packageFrameSrc = frameSrcFor(app)}
          {@const runtimeSrc = runtimeSrcFor(app)}
          <div class="frame-stage" class:active={activeAppId === app.id}>
            {#key `${app.id}:${frameReloadNonce[app.id] ?? 0}`}
              {#if runtimeSrc}
                <iframe
                  use:registerFrame={app.id}
                  title={`${app.name} container app`}
                  sandbox="allow-scripts allow-forms allow-same-origin"
                  src={runtimeSrc}
                  onload={() => markFrameReady(app.id)}
                  onerror={() => markFrameError(app.id)}
                ></iframe>
              {:else if packageFrameSrc}
                <iframe
                  use:registerFrame={app.id}
                  title={`${app.name} container app`}
                  sandbox="allow-scripts allow-forms"
                  src={packageFrameSrc}
                  onload={() => markFrameReady(app.id)}
                  onerror={() => markFrameError(app.id)}
                ></iframe>
              {:else}
                <iframe
                  use:registerFrame={app.id}
                  title={`${app.name} container app`}
                  sandbox="allow-scripts allow-forms"
                  srcdoc={srcdocFor(app)}
                  onload={() => markFrameReady(app.id)}
                  onerror={() => markFrameError(app.id)}
                ></iframe>
              {/if}
            {/key}
            {#if frameStates[app.id]?.status === 'error'}
              <div class="frame-recovery" role="alert">
                <strong>{app.name} needs a restart.</strong>
                <p>{frameStates[app.id]?.message}</p>
                <div>
                  <button onclick={() => reloadFrame(app.id)}>Reload app</button>
                  <button class="secondary" onclick={goHome}>Back home</button>
                </div>
              </div>
            {/if}
          </div>
        {/if}
      {/each}
    </section>

    <div class="inspector">
      <section>
        <h3>Local Namespaces</h3>
        {#each installedApps as app (app.id)}
          <p><code>{app.slug}</code> {rowsByApp[app.id]?.length ?? 0} rows</p>
        {/each}
      </section>

      <section>
        <h3>Bridge Calls</h3>
        {#if logs.length === 0}
          <p>No bridge calls yet.</p>
        {:else}
          <ul>
            {#each logs as log (log.id)}
              <li>
                <time>{log.at}</time>
                <code>{appById.get(log.appId)?.slug ?? log.appId}</code>
                <code>{log.capability}</code>
                <span>{log.summary}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    </div>
  </main>
</section>

<style>
  .shell {
    min-height: calc(100vh - var(--nav-height));
    display: grid;
    grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
    background: var(--bg);
    border-top: 1px solid var(--border-light);
  }
  .sidebar {
    padding: var(--space-2xl);
    border-right: 1px solid var(--border-light);
    display: flex;
    flex-direction: column;
    gap: var(--space-xl);
  }
  h1,
  h2,
  h3 {
    font-family: var(--font-heading);
    letter-spacing: 0;
  }
  h1 {
    margin: 0;
    font-size: clamp(2rem, 4vw, 3.1rem);
    line-height: 1;
  }
  h2,
  h3,
  p {
    margin: 0;
  }
  .eyebrow,
  .mini-label {
    margin: 0 0 0.5rem;
    font-family: var(--font-mono);
    font-size: var(--caption-size);
    text-transform: uppercase;
    letter-spacing: 0;
    color: var(--sunset);
  }
  .lede,
  .status-panel p,
  .section-head p,
  .inspector p,
  .inspector li,
  .data-list p {
    color: var(--text-secondary);
    line-height: 1.55;
  }
  .status-panel,
  .panel,
  .inspector section {
    border: 1px solid var(--border-light);
    background: var(--surface);
    border-radius: 8px;
  }
  .status-panel {
    padding: var(--space-md);
  }
  .status {
    display: inline-flex;
    width: fit-content;
    margin-bottom: var(--space-sm);
    padding: 3px 8px;
    border: 1px solid var(--marigold);
    border-radius: 999px;
    font-family: var(--font-mono);
    font-size: var(--caption-size);
    text-transform: uppercase;
    letter-spacing: 0;
    color: var(--marigold);
  }
  .status.ready {
    color: var(--sage-moss);
    border-color: var(--sage-moss);
  }
  .tabs {
    display: grid;
    gap: 8px;
  }
  button,
  .action-grid a {
    border: 1px solid var(--border-light);
    border-radius: 6px;
    background: var(--bg-pure);
    color: var(--text);
    text-decoration: none;
    cursor: pointer;
    font: inherit;
  }
  .tabs button {
    padding: 0.7rem 0.8rem;
    text-align: left;
    color: var(--text-secondary);
  }
  .tabs button.active,
  .home-button {
    background: var(--text);
    color: var(--bg-pure);
    border-color: var(--text);
  }
  .workspace {
    min-width: 0;
    padding: var(--space-xl);
    display: grid;
    gap: var(--space-md);
    align-content: start;
  }
  .topbar {
    display: flex;
    justify-content: space-between;
    gap: var(--space-md);
    align-items: center;
  }
  .home-button,
  .open-link {
    padding: 0.55rem 0.75rem;
    font-family: var(--font-mono);
    font-size: var(--small-size);
  }
  .open-link {
    color: var(--sunset);
  }
  .panel {
    padding: var(--space-lg);
    display: grid;
    gap: var(--space-lg);
  }
  .section-head {
    display: grid;
    gap: 0.35rem;
  }
  .app-grid,
  .action-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    gap: var(--space-md);
  }
  .app-tile,
  .action-grid a,
  .action-grid button {
    min-height: 128px;
    padding: var(--space-md);
    display: grid;
    gap: 0.45rem;
    align-content: center;
    justify-items: start;
  }
  .app-tile.installable {
    border-style: dashed;
    opacity: 0.78;
  }
  .app-tile.installable small {
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 600;
  }
  hr {
    border: 0;
    border-top: 1px solid var(--border-light, rgba(0, 0, 0, 0.08));
    margin: 24px 0;
  }
  .app-icon {
    --accent: var(--sunset);
    width: 42px;
    aspect-ratio: 1;
    border-radius: 8px;
    display: grid;
    place-items: center;
    background: var(--accent);
    color: var(--bg-pure);
    font-family: var(--font-mono);
    font-weight: 800;
    font-size: 0.85rem;
  }
  .updates,
  .collection-list,
  .data-list {
    display: grid;
    gap: 8px;
  }
  .updates article,
  .collection-list article,
  .data-list article {
    padding: var(--space-md);
    display: flex;
    align-items: center;
    gap: var(--space-md);
    justify-content: space-between;
    border: 1px solid var(--border-light);
    border-radius: 8px;
    background: var(--bg-pure);
  }
  .collection-list article > div,
  .data-list article > div {
    min-width: 0;
    flex: 1;
  }
  .collection-panel {
    padding: var(--space-md);
    border: 1px solid var(--border-light);
    border-radius: 8px;
    background: var(--bg-pure);
    display: grid;
    gap: var(--space-sm);
  }
  .collection-actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
  }
  .collection-actions input {
    min-height: 42px;
    padding: 0 0.75rem;
    border: 1px solid var(--border-light);
    border-radius: 6px;
    background: var(--surface);
    color: var(--text);
    font: inherit;
  }
  .collection-status,
  .collection-meta span {
    color: var(--text-secondary);
    font-size: var(--small-size);
  }
  .collection-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: baseline;
  }
  .collection-list button,
  .data-list button,
  .export-button {
    padding: 0.55rem 0.75rem;
  }
  .row-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: flex-end;
  }
  .receipt-export {
    margin: 0;
    padding: var(--space-md);
    border: 1px solid var(--border-light);
    border-radius: 8px;
    background: var(--bg-pure);
    color: var(--text);
    overflow: auto;
    max-height: 280px;
    font-size: var(--caption-size);
  }
  .backup-box {
    padding: var(--space-md);
    border: 1px solid var(--border-light);
    border-radius: 8px;
    background: var(--bg-pure);
    display: grid;
    gap: var(--space-sm);
  }
  .recovered-receipts {
    padding: var(--space-md);
    border: 1px dashed var(--border);
    border-radius: 8px;
    background: var(--surface);
    display: grid;
    gap: var(--space-sm);
  }
  .recovered-receipts > p {
    margin: 0;
    color: var(--text-secondary);
  }
  .backup-box input {
    min-height: 42px;
    padding: 0 0.75rem;
    border: 1px solid var(--border-light);
    border-radius: 6px;
    background: var(--surface);
    color: var(--text);
    font: inherit;
  }
  .backup-box textarea {
    min-height: 120px;
    padding: 0.75rem;
    border: 1px solid var(--border-light);
    border-radius: 6px;
    background: var(--surface);
    color: var(--text);
    font: inherit;
    resize: vertical;
  }
  .error-text {
    color: #B6472D;
  }
  .viewport-area {
    min-height: 500px;
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
    background: var(--bg-pure);
  }
  .viewport-area.hidden {
    display: none;
  }
  .frame-stage {
    position: relative;
    display: none;
  }
  .frame-stage.active {
    display: block;
  }
  iframe {
    width: 100%;
    min-height: 500px;
    border: 0;
    display: block;
  }
  .frame-recovery {
    position: absolute;
    inset: var(--space-lg);
    display: grid;
    place-content: center;
    gap: 8px;
    padding: var(--space-lg);
    border: 1px solid rgba(182, 71, 45, 0.3);
    border-radius: 8px;
    background: rgba(255, 250, 242, 0.96);
    color: var(--text);
    text-align: center;
    box-shadow: 0 18px 60px rgba(33, 29, 24, 0.16);
  }
  .frame-recovery p {
    margin: 0;
    color: var(--text-secondary);
  }
  .frame-recovery div {
    display: flex;
    justify-content: center;
    gap: 8px;
  }
  .frame-recovery button {
    padding: 0.55rem 0.75rem;
  }
  .frame-recovery .secondary {
    background: transparent;
    color: var(--text);
  }
  .inspector {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-md);
  }
  .inspector section {
    min-width: 0;
    padding: var(--space-md);
    display: grid;
    gap: 8px;
  }
  .inspector ul {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 8px;
  }
  .inspector li {
    overflow-wrap: anywhere;
    font-size: var(--small-size);
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  code,
  time {
    font-family: var(--font-mono);
    color: var(--text);
    font-size: var(--caption-size);
  }
  @media (max-width: 900px) {
    .shell {
      grid-template-columns: 1fr;
    }
    .sidebar {
      border-right: 0;
      border-bottom: 1px solid var(--border-light);
      padding: var(--space-xl);
    }
    .inspector {
      grid-template-columns: 1fr;
    }
    .topbar {
      align-items: flex-start;
      flex-direction: column;
    }
  }

  /* Phase A2 — cross-app intent permission prompt */
  .intent-prompt-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(20, 18, 15, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: var(--space-md);
  }
  .intent-prompt {
    background: var(--bg);
    border: 1px solid var(--border-light);
    border-radius: 8px;
    padding: var(--space-lg);
    max-width: 440px;
    width: 100%;
    box-shadow: 0 12px 48px rgba(0, 0, 0, 0.18);
  }
  .intent-prompt h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1.1rem;
  }
  .intent-prompt p {
    margin: 0 0 0.75rem 0;
    color: var(--text-secondary);
    font-size: 0.95rem;
  }
  .intent-prompt code {
    background: var(--surface-alt);
    padding: 0.1rem 0.3rem;
    border-radius: 3px;
    font-size: 0.85rem;
  }
  .intent-prompt .hint {
    color: var(--text-light);
    font-size: 0.85rem;
  }
  .intent-prompt-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
    margin-top: var(--space-md);
  }
  .intent-prompt-actions button {
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.95rem;
  }
  .intent-deny {
    background: var(--surface-alt);
    border: 1px solid var(--border-light);
    color: var(--text);
  }
  .intent-allow {
    background: var(--sunset, #E8603C);
    border: 1px solid var(--sunset, #E8603C);
    color: var(--bg-pure, #fff);
    font-weight: 600;
  }

  /* Phase B2 — mesh status badge in topbar */
  .mesh-badge {
    height: 30px;
    padding: 0 12px;
    border-radius: 999px;
    border: 1px solid var(--border-light, rgba(0, 0, 0, 0.1));
    background: transparent;
    font-size: 12px;
    font-weight: 500;
    color: var(--text);
    cursor: pointer;
  }
  .mesh-badge.active {
    background: rgba(94, 167, 119, 0.12);
    border-color: rgba(94, 167, 119, 0.4);
  }
  .nearby-panel {
    margin: 16px 0 24px;
    padding: 16px;
    border-radius: 12px;
    border: 1px solid var(--border-light, rgba(0, 0, 0, 0.1));
    background: rgba(0, 0, 0, 0.02);
  }
  .nearby-panel h3 {
    margin: 0 0 6px;
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .nearby-panel p {
    margin: 4px 0 12px;
    font-size: 14px;
  }
  .nearby-panel code {
    background: rgba(0, 0, 0, 0.05);
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 12px;
  }
  .mesh-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .mesh-actions span {
    color: rgba(0, 0, 0, 0.5);
    font-size: 12px;
  }
  .mesh-code-input {
    height: 36px;
    padding: 0 10px;
    border-radius: 8px;
    border: 1px solid var(--border-light, rgba(0, 0, 0, 0.15));
    font-size: 13px;
    text-transform: uppercase;
    width: 180px;
  }
  .mesh-create,
  .mesh-join,
  .mesh-leave {
    height: 36px;
    padding: 0 14px;
    border-radius: 999px;
    border: 1px solid var(--border-light, rgba(0, 0, 0, 0.1));
    background: transparent;
    color: var(--text);
    font-size: 13px;
    cursor: pointer;
  }
  .mesh-create {
    background: var(--sunset, #E8603C);
    border-color: var(--sunset, #E8603C);
    color: var(--bg-pure, #fff);
    font-weight: 600;
  }

  /* Phase A5 — banner shown when an iframe app triggered Your Data */
  .data-trigger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin: 12px 0 16px;
    padding: 10px 14px;
    border-radius: 10px;
    border: 1px solid var(--border-light, rgba(0, 0, 0, 0.1));
    background: rgba(232, 96, 60, 0.06);
    font-size: 13px;
    color: var(--text);
  }
  .data-trigger button {
    height: 28px;
    padding: 0 10px;
    border-radius: 999px;
    border: 1px solid var(--border-light, rgba(0, 0, 0, 0.1));
    background: transparent;
    color: var(--text);
    font-size: 12px;
    cursor: pointer;
  }
</style>
