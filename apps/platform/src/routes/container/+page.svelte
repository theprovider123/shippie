<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { goto } from '$app/navigation';
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
    type TransferAcceptor,
    type TransferCommitResult,
    type TransferStartResult,
  } from '$lib/container/bridge-handlers';
  import {
    createIntentRegistry,
    grantIntent,
    isIntentGranted,
    revokeIntent,
    type IntentGrants,
  } from '$lib/container/intent-registry';
  import {
    createTransferRegistry,
    grantTransfer,
    isTransferGranted,
    type TransferGrants,
  } from '$lib/container/transfer-registry';
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
  import { selectAiBackend, type AiBackend } from '$lib/container/ai-backend';
  import { SHIPPIE_MODEL_CACHE_NAME, TRANSFORMERS_RUNTIME_URL } from '$lib/container/ai-runtime';
  import {
    builtinStrategies,
    runAgent,
    type AgentRow,
    type Insight,
  } from '@shippie/agent';
  import InsightStrip from '$lib/container/InsightStrip.svelte';
  import IntentPromptModal from '$lib/container/IntentPromptModal.svelte';
  import TransferPromptModal from '$lib/container/TransferPromptModal.svelte';
  import AppFrameHost from '$lib/container/AppFrameHost.svelte';
  import AppSwitcherGesture from '$lib/container/AppSwitcherGesture.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import PushOptInToast from '$lib/components/notifications/PushOptInToast.svelte';
  import DashboardHome from '$lib/container/DashboardHome.svelte';
  import {
    consumeEviction,
    focusApp,
    queueEviction,
    type PendingEvictions,
  } from '$lib/container/iframe-lifecycle';
  import { appPackageSrcdoc } from '$lib/container/app-srcdoc';
  import { frameBridgeOrigins } from '$lib/container/frame-origin';
  import { resolveRuntimeSrc } from '$lib/container/runtime-src';
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
  // Eviction queue — a pending eviction won't dispose its target's
  // bridge host or frame source until the new (focusing) app's frame
  // fires markFrameReady or markFrameError. Closes the LRU race where
  // a rapid-click sequence destroys an iframe still mid-boot.
  let pendingEvictions: PendingEvictions<string> = new Map();
  const packageObjectUrls: PackageFrameSourceCache = new Map();

  let section = $state<ContainerSection>('home');
  let activeAppId = $state<string | null>(null);
  let openAppIds = $state<string[]>([]);
  // Focused-mode app-switcher drawer open state. Only meaningful when
  // `data.focused === true`; ignored in dashboard mode.
  let focusedDrawerOpen = $state(false);
  // Set when /run/<slug>/ resolved a slug we don't have. Used to render
  // an EmptyState in focused mode instead of silently swapping the user
  // onto a different app.
  let notFoundSlug = $state<string | null>(null);
  // True on a user's first-ever entry into focused mode. Drives a one-
  // shot pulse on the bottom-pill so first-run users learn the gesture.
  // Gated by localStorage so the hint never repeats on the same device.
  let firstRunHint = $state(false);
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
  let frameCanGoBackByApp = $state<Record<string, boolean>>({});
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
  // P1A.3 — transfer drop state. `transferGrants` is per (sourceId,
  // targetId) pair; `pendingTransferQueue` mirrors the intent prompt
  // queue so the user resolves one transfer at a time.
  let transferGrants = $state<TransferGrants>({});
  type PendingTransferPrompt = {
    sourceId: string;
    sourceName: string;
    targetId: string;
    targetName: string;
    kind: string;
    payload: unknown;
    resolve: (result: TransferCommitResult) => void;
  };
  let pendingTransferQueue = $state<PendingTransferPrompt[]>([]);
  const pendingTransferPrompt = $derived<PendingTransferPrompt | null>(
    pendingTransferQueue.length > 0 ? pendingTransferQueue[0]! : null,
  );
  const transferRegistry = createTransferRegistry();
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
  type AiReadiness = {
    backend: AiBackend;
    runtimeCached: boolean;
    modelCount: number;
    checked: boolean;
  };
  let aiReadiness = $state<AiReadiness>({
    backend: 'unavailable',
    runtimeCached: false,
    modelCount: 0,
    checked: false,
  });
  async function runAi(req: AiRunRequest): Promise<AiRunResult> {
    try {
      return await aiClient.run(req);
    } finally {
      void refreshAiReadiness();
    }
  }

  async function refreshAiReadiness(): Promise<void> {
    const backend = selectAiBackend().backend;
    const cachesApi = (globalThis as { caches?: CacheStorage }).caches;
    if (!cachesApi) {
      aiReadiness = { backend, runtimeCached: false, modelCount: 0, checked: true };
      return;
    }
    try {
      const cache = await cachesApi.open(SHIPPIE_MODEL_CACHE_NAME);
      const keys = await cache.keys();
      const runtimeCached = Boolean(await cache.match(TRANSFORMERS_RUNTIME_URL));
      const modelCount = keys.filter((req) => {
        const url = req.url;
        return url !== TRANSFORMERS_RUNTIME_URL && !url.endsWith('/runtime/transformers.js');
      }).length;
      aiReadiness = { backend, runtimeCached, modelCount, checked: true };
    } catch {
      aiReadiness = { backend, runtimeCached: false, modelCount: 0, checked: true };
    }
  }

  const aiReadinessLabel = $derived.by(() => {
    if (!aiReadiness.checked) return 'Checking';
    if (aiReadiness.backend === 'unavailable') return 'Unsupported on this device';
    if (!aiReadiness.runtimeCached) return 'Needs WiFi setup';
    if (aiReadiness.modelCount === 0) return 'Runtime ready';
    return 'Ready offline';
  });

  const aiReadinessBody = $derived.by(() => {
    if (!aiReadiness.checked) return 'Checking local runtime and model cache.';
    if (aiReadiness.backend === 'unavailable') {
      return 'This browser cannot run the local model backend yet, so apps will degrade gracefully.';
    }
    if (!aiReadiness.runtimeCached) {
      return 'The AI runtime has not been cached on this device yet. Connect once, then AI setup can become local.';
    }
    if (aiReadiness.modelCount === 0) {
      return 'The AI runtime is cached. The first app that uses AI will download its model once, then it can run offline.';
    }
    return `${aiReadiness.modelCount} AI cache ${aiReadiness.modelCount === 1 ? 'entry is' : 'entries are'} stored locally.`;
  });
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
    // LRU mount cap — keep at most 8 apps live. Re-focusing an
    // already-open app moves it to the head; opening a new one past
    // the cap evicts the oldest. Eviction is deferred until the new
    // app's frame settles (ready or error) so a rapid-click sequence
    // can't destroy an iframe still mid-boot. queue + supersede flow
    // (see iframe-lifecycle.ts) handles the case where the user
    // clicks past the queued frame before it settles.
    const decision = focusApp(openAppIds, appId);
    openAppIds = [...decision.openAppIds];
    if (decision.evicted) {
      const queued = queueEviction(pendingEvictions, appId, decision.evicted);
      pendingEvictions = queued.next;
      // If a previously-pending eviction got superseded (user clicked
      // through before the prior focus settled), dispose the prior
      // target now — there's no longer a frame waiting on it.
      if (queued.superseded) {
        disposeApp(queued.superseded);
      }
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

  function disposeApp(appId: string) {
    hosts.get(appId)?.dispose();
    hosts.delete(appId);
    frames.delete(appId);
    const { [appId]: _removed, ...rest } = frameCanGoBackByApp;
    frameCanGoBackByApp = rest;
    revokePackageFrameSource(appId, packageObjectUrls);
  }

  function commitPendingEviction(settledAppId: string) {
    const consumed = consumeEviction(pendingEvictions, settledAppId);
    if (consumed.evicted) {
      pendingEvictions = consumed.next;
      disposeApp(consumed.evicted);
    }
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
    commitPendingEviction(appId);
    // Emit a window-level event so PushOptInToast can offer notifications
    // after a successful first open. Keeps the container untangled from
    // the notification subsystem.
    const app = appById.get(appId);
    if (app && typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('shippie:app-opened', {
          detail: { slug: app.slug, name: app.name },
        }),
      );
    }
  }

  function markFrameError(appId: string, message = 'This app could not open in the container.') {
    frameStates = markFrameErrorState(frameStates, appId, message);
    // Also commit the queued eviction even on error — there's no point
    // holding the old app's resources hostage when the new one isn't
    // going to render anyway.
    commitPendingEviction(appId);
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
          ...frameBridgeOrigins(runtimeSrcFor(app), window.location.href),
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
          listOverlappingApps: (callerId) => listAppsOverlappingCaller(callerId),
          insightsForApp: (callerId) => insightsForCaller(callerId),
          startTransferDrop: (sourceId, kind, preview) =>
            startTransferDrop(sourceId, kind, preview),
          commitTransferDrop: (sourceId, targetSlug, kind, payload) =>
            commitTransferDrop(sourceId, targetSlug, kind, payload),
        }),
      }),
    );

    bridgeStatus = 'ready';
  }

  function postToAppFrame(appId: string, message: unknown): boolean {
    const frame = frames.get(appId);
    const target = frame?.contentWindow;
    const app = appById.get(appId);
    if (!target || !app) return false;
    target.postMessage(
      message,
      frameBridgeOrigins(runtimeSrcFor(app), window.location.href).targetOrigin,
    );
    return true;
  }

  function appIdForMessageSource(source: MessageEventSource | null): string | null {
    if (!source) return null;
    for (const [appId, frame] of frames.entries()) {
      if (frame.contentWindow === source) return appId;
    }
    return null;
  }

  function recordFrameNavigation(event: MessageEvent) {
    const payload = event.data as { type?: string; canGoBack?: unknown } | null;
    if (!payload || payload.type !== 'shippie:navigation-state') return;
    const appId = appIdForMessageSource(event.source);
    if (!appId) return;
    const canGoBack = payload.canGoBack === true;
    if (frameCanGoBackByApp[appId] === canGoBack) return;
    frameCanGoBackByApp = { ...frameCanGoBackByApp, [appId]: canGoBack };
  }

  function requestActiveFrameBack(): boolean {
    if (!activeAppId || frameCanGoBackByApp[activeAppId] !== true) return false;
    return postToAppFrame(activeAppId, { type: 'shippie:navigation-back' });
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
      if (
        postToAppFrame(consumer.appId, {
          kind: 'shippie.intent.broadcast',
          intent,
          rows,
          providerAppId,
        })
      ) {
        delivered += 1;
      }
    }
    return { delivered };
  }

  /**
   * P1A.1 — apps.list scoping.
   *
   * Returns the apps installed in the same container that share at
   * least one intent with the caller. Apps with no overlap stay
   * invisible — the result is never the user's full app set, so it
   * can't be used as a cross-iframe fingerprint.
   *
   * Threat model: an iframe with no declared intents declaring no
   * provides/consumes calls `apps.list` and gets back `[]`. Verified
   * in the bridge integration test.
   */
  function listAppsOverlappingCaller(callerAppId: string): Array<{
    slug: string;
    name: string;
    shortName: string;
    description: string;
    labelKind: ContainerApp['labelKind'];
    provides: readonly string[];
    consumes: readonly string[];
  }> {
    const caller = appById.get(callerAppId);
    if (!caller) return [];
    const callerIntents = caller.permissions.capabilities.crossAppIntents;
    const callerSet = new Set<string>([
      ...(callerIntents?.provides ?? []),
      ...(callerIntents?.consumes ?? []),
    ]);
    if (callerSet.size === 0) return []; // no intents declared → empty list
    return installedApps
      .filter((app) => {
        const intents = app.permissions.capabilities.crossAppIntents;
        const appSet = new Set<string>([
          ...(intents?.provides ?? []),
          ...(intents?.consumes ?? []),
        ]);
        if (app.id === callerAppId) return true; // self always visible
        for (const intent of appSet) if (callerSet.has(intent)) return true;
        return false;
      })
      .map((app) => ({
        slug: app.slug,
        name: app.name,
        shortName: app.shortName,
        description: app.description,
        labelKind: app.labelKind,
        provides: app.permissions.capabilities.crossAppIntents?.provides ?? [],
        consumes: app.permissions.capabilities.crossAppIntents?.consumes ?? [],
      }));
  }

  /**
   * P1A.2 — agent.insights source-data invariant.
   *
   * Returns insights whose `provenance` is fully readable by the
   * calling app. An app may read its own namespace + any intent it has
   * been granted; an insight is visible iff every slug in its
   * `provenance` is the caller's own slug OR an app whose granted
   * intent the caller consumes (i.e. data the caller could already
   * see). System insights with empty provenance are visible to all.
   *
   * This is the load-bearing privacy guarantee for the agent: a
   * cross-app correlation derived from data the caller never had
   * access to does not leak through `agent.insights`, even if the
   * insight is targeted at the caller.
   */
  function insightsForCaller(callerAppId: string): readonly Insight[] {
    const caller = appById.get(callerAppId);
    if (!caller) return [];
    const callerConsumes = new Set<string>(
      caller.permissions.capabilities.crossAppIntents?.consumes ?? [],
    );
    const readableSlugs = new Set<string>([caller.slug]);
    if (callerConsumes.size > 0) {
      for (const app of apps) {
        if (app.id === caller.id) continue;
        const provides = app.permissions.capabilities.crossAppIntents?.provides ?? [];
        for (const intent of provides) {
          if (!callerConsumes.has(intent)) continue;
          if (!isIntentGranted(intentGrants, caller.id, intent)) continue;
          readableSlugs.add(app.slug);
          break;
        }
      }
    }
    return agentInsights.filter((insight) => {
      if (insight.provenance.length === 0) return true;
      for (const slug of insight.provenance) {
        if (!readableSlugs.has(slug)) return false;
      }
      return true;
    });
  }

  /**
   * P1A.3 — `data.transferDrop` `starting` step.
   *
   * Source iframe announces a drag of `kind`. We look up acceptors
   * declared with that kind, broadcast the preview to each so they can
   * light up drop zones, and return the eligible-acceptor list back to
   * the source for its own UI affordance.
   *
   * No grant is needed at this step: nothing user-data crosses the
   * boundary yet, just a UI hint. The grant happens at commit.
   */
  function startTransferDrop(
    sourceAppId: string,
    kind: string,
    preview: unknown,
  ): TransferStartResult {
    const acceptors = transferRegistry
      .acceptorsFor(kind)
      .filter((entry) => entry.appId !== sourceAppId);
    for (const acceptor of acceptors) {
      postToAppFrame(
        acceptor.appId,
        {
          kind: 'shippie.transfer.starting',
          transferKind: kind,
          preview,
          sourceAppId,
        },
      );
    }
    return {
      kind,
      acceptors: acceptors.map((entry) => {
        const acceptorApp = appById.get(entry.appId);
        return {
          slug: entry.appSlug,
          name: entry.appName,
          kinds: acceptorApp?.permissions.capabilities.acceptsTransfer?.kinds ?? [kind],
        };
      }),
    };
  }

  /**
   * P1A.3 — `data.transferDrop` `commit` step.
   *
   * Source picked a target by slug; we resolve it to an app id, verify
   * the target accepts the announced kind, then check the per-pair
   * grant. First-time deliveries enqueue a permission prompt and
   * resolve once the user accepts/declines.
   */
  function commitTransferDrop(
    sourceAppId: string,
    targetSlug: string,
    kind: string,
    payload: unknown,
  ): TransferCommitResult | Promise<TransferCommitResult> {
    const sourceApp = appById.get(sourceAppId);
    if (!sourceApp) {
      return { delivered: false, target: null, reason: 'no_target' };
    }
    const targetApp = apps.find((a) => a.slug === targetSlug && a.id !== sourceAppId);
    if (!targetApp) {
      return { delivered: false, target: null, reason: 'no_target' };
    }
    const accepts = targetApp.permissions.capabilities.acceptsTransfer?.kinds ?? [];
    if (!accepts.includes(kind)) {
      return {
        delivered: false,
        target: { slug: targetApp.slug, name: targetApp.name },
        reason: 'kind_not_accepted',
      };
    }
    if (!isTransferGranted(transferGrants, sourceAppId, targetApp.id)) {
      // De-dupe: same (source, target) already queued → resolve when
      // existing prompt resolves. Mirrors the intent-grant queue.
      const existing = pendingTransferQueue.find(
        (p) => p.sourceId === sourceAppId && p.targetId === targetApp.id,
      );
      if (existing) {
        return {
          delivered: false,
          target: { slug: targetApp.slug, name: targetApp.name },
          reason: 'permission_not_yet_granted',
        };
      }
      return new Promise<TransferCommitResult>((resolve) => {
        pendingTransferQueue = [
          ...pendingTransferQueue,
          {
            sourceId: sourceAppId,
            sourceName: sourceApp.name,
            targetId: targetApp.id,
            targetName: targetApp.name,
            kind,
            payload,
            resolve,
          },
        ];
      });
    }
    return deliverTransfer(sourceAppId, targetApp.id, kind, payload);
  }

  function deliverTransfer(
    sourceAppId: string,
    targetAppId: string,
    kind: string,
    payload: unknown,
  ): TransferCommitResult {
    const targetApp = appById.get(targetAppId);
    if (!targetApp) {
      return { delivered: false, target: null, reason: 'no_target' };
    }
    postToAppFrame(targetAppId, {
      kind: 'shippie.transfer.commit',
      transferKind: kind,
      payload,
      sourceAppId,
    });
    return {
      delivered: true,
      target: { slug: targetApp.slug, name: targetApp.name },
    };
  }

  function approvePendingTransfer() {
    const prompt = pendingTransferPrompt;
    if (!prompt) return;
    transferGrants = grantTransfer(transferGrants, prompt.sourceId, prompt.targetId);
    pendingTransferQueue = pendingTransferQueue.slice(1);
    const result = deliverTransfer(prompt.sourceId, prompt.targetId, prompt.kind, prompt.payload);
    prompt.resolve(result);
  }

  function declinePendingTransfer() {
    const prompt = pendingTransferPrompt;
    if (!prompt) return;
    pendingTransferQueue = pendingTransferQueue.slice(1);
    prompt.resolve({
      delivered: false,
      target: null,
      reason: 'permission_denied',
    });
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
        transferGrants,
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
    transferGrants = next.transferGrants;
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
    window.addEventListener('message', recordFrameNavigation);
    return () => {
      window.removeEventListener('message', recordFromEvent);
      window.removeEventListener('message', recordFrameNavigation);
    };
  });

  // Refresh the cross-app intent registry whenever the installed-apps
  // list changes. The registry owns provider/consumer indexing; the
  // bridge handlers consult it on every intent.consume call.
  $effect(() => {
    intentRegistry.refresh(apps);
    transferRegistry.refresh(apps);
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
      transferGrants,
      dismissedInsightIds,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // localStorage may be blocked (iOS PWA partitioning, private
      // browsing, or quota exceeded). Persistence fails silently;
      // session state continues in memory until the user reloads.
    }
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
      transferGrants = saved.transferGrants ?? {};
      dismissedInsightIds = saved.dismissedInsightIds ?? {};
    } else if (defaultAppId) {
      const defaultApp = appById.get(defaultAppId);
      openAppIds = [defaultAppId];
      receiptsByApp = defaultApp ? { [defaultAppId]: createReceiptFor(defaultApp) } : {};
      activeAppId = defaultAppId;
    }
    const requestedApp = findRequestedApp(apps, data.requestedAppSlug);
    if (requestedApp) {
      openApp(requestedApp.id);
    } else if (data.requestedAppSlug && data.focused) {
      // Slug was requested via /run/<slug>/ but it's not in our installed
      // list (private, archived, container-eligibility-filtered). Surface
      // an EmptyState in focused mode instead of silently swapping onto
      // a different app — that path was the dominant "click landed me
      // somewhere weird" report.
      notFoundSlug = data.requestedAppSlug;
    } else if (!activeAppId || !appById.has(activeAppId)) {
      activeAppId = openAppIds[0] ?? null;
    }
    // Honour `?section=` so the focused-mode "Your Data" link from
    // inside an app routes the user to the right dashboard tab on
    // the way out. Valid values: 'home' | 'create' | 'data'.
    if (!data.focused) {
      const url = new URL(window.location.href);
      const requestedSection = url.searchParams.get('section');
      if (requestedSection === 'home' || requestedSection === 'create' || requestedSection === 'data') {
        section = requestedSection;
        if (requestedSection !== 'home') activeAppId = null;
      }
    }
    storageReady = true;
    void refreshAiReadiness();
    // First-run pill hint: pulse the bottom-pill once when this device
    // enters focused mode for the first time, so users discover the
    // exit gesture. Gated by localStorage so it never repeats.
    if (data.focused) {
      try {
        const seen = localStorage.getItem('shippie:exit-hint-seen');
        if (!seen) {
          firstRunHint = true;
          localStorage.setItem('shippie:exit-hint-seen', '1');
        }
      } catch {
        // localStorage may be blocked (private browsing, partitioned
        // contexts) — fall through silently. The hint just won't fire.
      }
      // Browser-back as an exit path. Push a sentinel history entry on
      // entering focused mode; if the user hits back (browser button,
      // iOS edge-swipe, Android system back), popstate fires and we
      // navigate to the dashboard. Without this push, back goes to
      // whatever was before /run/<slug>/ — usually the marketplace,
      // sometimes a cold tab with no history at all.
      try {
        history.pushState({ shippieFocused: true }, '');
        window.addEventListener('popstate', handleFocusedPopstate);
      } catch {
        // history API blocked — leave the user with the pill exits.
      }
    }
    void loadCollection();
  });

  function handleFocusedPopstate() {
    if (!data.focused) return;
    if (focusedDrawerOpen) {
      focusedDrawerOpen = false;
      try {
        history.pushState({ shippieFocused: true }, '');
      } catch {
        /* ignore */
      }
      return;
    }
    if (requestActiveFrameBack()) {
      try {
        history.pushState({ shippieFocused: true }, '');
      } catch {
        /* ignore */
      }
      return;
    }
    // popstate fires after the browser already moved one entry back.
    // We're now at the entry we want to leave from; goto() replaces
    // it with /container so refreshes don't bounce back into focused
    // mode.
    goto('/container', { replaceState: true });
  }

  onDestroy(() => {
    for (const host of hosts.values()) host.dispose();
    hosts.clear();
    revokeAllPackageFrameSources(packageObjectUrls);
    aiClient.dispose();
    if (typeof window !== 'undefined') {
      window.removeEventListener('popstate', handleFocusedPopstate);
    }
  });

  function srcdocFor(app: ContainerApp): string {
    return appPackageSrcdoc(app, packageFilesByApp[app.id]);
  }

  function frameSrcFor(app: ContainerApp): string | null {
    return createOrReusePackageFrameSource(app, packageFilesByApp[app.id], packageObjectUrls);
  }

  function runtimeSrcFor(app: ContainerApp): string | null {
    if (typeof window === 'undefined') return null;
    return resolveRuntimeSrc(app, window.location.hostname);
  }

</script>

<svelte:head>
  <title>Shippie Container</title>
  <meta
    name="description"
    content="The Shippie container runtime: one installed app for local-first apps, receipts, and portable packages."
  />
</svelte:head>

<IntentPromptModal
  prompt={pendingIntentPrompt}
  onApprove={approveIntentPrompt}
  onDeny={denyIntentPrompt}
/>
<PushOptInToast />
<TransferPromptModal
  prompt={pendingTransferPrompt}
  onApprove={approvePendingTransfer}
  onDeny={declinePendingTransfer}
/>

{#if data.focused}
  <!--
    Focused mode — entered via /run/<slug>/ → /container?app=&focused=1.
    Render the requested app full-bleed, no sidebar / topbar / tabs.
    The app-switcher gesture component sits as a fixed overlay; the
    drawer (when open) shows a compact app grid for instant switching.

    Bridge handlers + intent registry + texture engine + everything
    else stay wired exactly as in dashboard mode — they're orchestrated
    by the surrounding script block. Focused mode is a presentation
    branch, not a behaviour branch.
  -->
  <section class="focused-shell">
    <a
      class="focused-exit-pill"
      href="/container"
      aria-label="Leave this app and return to Shippie"
    >
      <img
        src="/__shippie-pwa/icon.svg"
        alt=""
        width="20"
        height="20"
        aria-hidden="true"
      />
      <span>Shippie</span>
    </a>
    <div class="focused-frame">
      {#if notFoundSlug}
        <div class="focused-not-found">
          <EmptyState
            title="We couldn't find that app."
            body={`No app installed at /${notFoundSlug}. It may have been unpublished, made private, or the link is wrong.`}
            actionLabel="Browse apps"
            actionHref="/apps"
          />
        </div>
      {:else}
        {#each openAppIds as appId (appId)}
          {@const app = appById.get(appId)}
          {#if app}
            <AppFrameHost
              {app}
              active={activeAppId === app.id}
              reloadNonce={frameReloadNonce[app.id] ?? 0}
              {frameStates}
              runtimeSrc={runtimeSrcFor(app)}
              packageFrameSrc={frameSrcFor(app)}
              srcdoc={srcdocFor(app)}
              onRegister={registerFrame}
              onReady={markFrameReady}
              onError={markFrameError}
              onReload={reloadFrame}
              onGoHome={goHome}
            />
          {/if}
        {/each}
      {/if}
    </div>
    <AppSwitcherGesture
      open={focusedDrawerOpen}
      onOpenChange={(value) => (focusedDrawerOpen = value)}
      edge="left"
      firstRun={firstRunHint}
    >
      <div class="focused-drawer">
        <header class="focused-drawer-head">
          <a class="focused-home" href="/container" aria-label="Shippie home">
            <span class="focused-rocket" aria-hidden="true">🚀</span>
            <span>Shippie</span>
          </a>
          <a class="focused-data" href="/container?section=data" aria-label="Your Data">
            Your Data
          </a>
        </header>
        <h2>Switch app</h2>
        <div class="focused-grid">
          {#each apps as app (app.id)}
            <button
              class="focused-tile"
              class:active={activeAppId === app.id}
              style:--accent={app.accent}
              onclick={() => {
                openApp(app.id);
                focusedDrawerOpen = false;
              }}
            >
              <span class="focused-dot" aria-hidden="true">{app.icon}</span>
              <strong>{app.name}</strong>
              <small>{openAppIds.includes(app.id) ? 'Live' : 'Open'}</small>
            </button>
          {/each}
        </div>
        {#if agentInsights.length > 0}
          <h2 class="focused-insights-heading">Insights</h2>
          <ul class="focused-insights">
            {#each agentInsights.slice(0, 3) as insight (insight.id)}
              <li class={`focused-insight focused-insight-${insight.urgency}`}>
                <strong>{insight.title}</strong>
                {#if insight.body}
                  <p>{insight.body}</p>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </AppSwitcherGesture>
  </section>
{:else}
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
        {@const standaloneHref = runtimeSrcFor(activeApp) ?? activeApp.standaloneUrl}
        <a href={standaloneHref} target="_blank" rel="noopener" class="open-link" data-sveltekit-preload-data="off">Open standalone</a>
      {/if}
    </div>

    {#if !activeApp}
      <section class="panel">
        {#if section === 'home'}
          <DashboardHome
            insights={agentInsights}
            {apps}
            {openAppIds}
            {updateCards}
            {meshStatus}
            {meshJoinCodeInput}
            {meshError}
            onOpenInsight={openInsight}
            onDismissInsight={dismissInsight}
            onOpenApp={openApp}
            onStayOnCurrent={stayOnCurrent}
            onAcceptUpdate={acceptUpdate}
            onCreateMeshRoom={createMeshRoom}
            onJoinMeshRoom={joinMeshRoom}
            onLeaveMeshRoom={leaveMeshRoom}
            onMeshJoinCodeChange={(value) => (meshJoinCodeInput = value)}
          />
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
          <div class="ai-readiness" role="status">
            <div>
              <p class="mini-label">On-device AI</p>
              <h3>{aiReadinessLabel}</h3>
              <p>{aiReadinessBody}</p>
            </div>
            <div class="ai-readiness-meta">
              <span>{aiReadiness.backend.toUpperCase()}</span>
              <span>{aiReadiness.runtimeCached ? 'Runtime cached' : 'Runtime not cached'}</span>
              <span>{aiReadiness.modelCount} model cache entries</span>
              <button onclick={refreshAiReadiness}>Check again</button>
            </div>
          </div>
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
          <AppFrameHost
            {app}
            active={activeAppId === app.id}
            reloadNonce={frameReloadNonce[app.id] ?? 0}
            {frameStates}
            runtimeSrc={runtimeSrcFor(app)}
            packageFrameSrc={frameSrcFor(app)}
            srcdoc={srcdocFor(app)}
            onRegister={registerFrame}
            onReady={markFrameReady}
            onError={markFrameError}
            onReload={reloadFrame}
            onGoHome={goHome}
          />
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
{/if}

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
    border-radius: 0;
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
    border-radius: 0;
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
    border-radius: 0;
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
  hr {
    border: 0;
    border-top: 1px solid var(--border-light, rgba(0, 0, 0, 0.08));
    margin: 24px 0;
  }
  .app-icon {
    --accent: var(--sunset);
    width: 42px;
    aspect-ratio: 1;
    border-radius: 0;
    display: grid;
    place-items: center;
    background: var(--accent);
    color: var(--bg-pure);
    font-family: var(--font-mono);
    font-weight: 800;
    font-size: 0.85rem;
  }
  .collection-list,
  .data-list {
    display: grid;
    gap: 8px;
  }
  .collection-list article,
  .data-list article {
    padding: var(--space-md);
    display: flex;
    align-items: center;
    gap: var(--space-md);
    justify-content: space-between;
    border: 1px solid var(--border-light);
    border-radius: 0;
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
    border-radius: 0;
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
    border-radius: 0;
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
  .ai-readiness {
    padding: var(--space-md);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
    border: 1px solid var(--border-light);
    border-radius: 0;
    background: var(--bg-pure);
  }
  .ai-readiness h3,
  .ai-readiness p {
    margin: 0;
  }
  .ai-readiness p:not(.mini-label) {
    color: var(--text-secondary);
  }
  .ai-readiness-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: flex-end;
  }
  .ai-readiness-meta span,
  .ai-readiness-meta button {
    padding: 0.45rem 0.6rem;
    border: 1px solid var(--border-light);
    border-radius: 0;
    background: var(--surface);
    color: var(--text);
    font-family: var(--font-mono);
    font-size: var(--caption-size);
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
    border-radius: 0;
    background: var(--bg-pure);
    color: var(--text);
    overflow: auto;
    max-height: 280px;
    font-size: var(--caption-size);
  }
  .backup-box {
    padding: var(--space-md);
    border: 1px solid var(--border-light);
    border-radius: 0;
    background: var(--bg-pure);
    display: grid;
    gap: var(--space-sm);
  }
  .recovered-receipts {
    padding: var(--space-md);
    border: 1px dashed var(--border);
    border-radius: 0;
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
    border-radius: 0;
    background: var(--surface);
    color: var(--text);
    font: inherit;
  }
  .backup-box textarea {
    min-height: 120px;
    padding: 0.75rem;
    border: 1px solid var(--border-light);
    border-radius: 0;
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
    border-radius: 0;
    overflow: hidden;
    background: var(--bg-pure);
  }
  .viewport-area.hidden {
    display: none;
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
    .ai-readiness {
      align-items: flex-start;
      flex-direction: column;
    }
    .ai-readiness-meta {
      justify-content: flex-start;
    }
  }

  /* Phase B2 — mesh status badge in topbar */
  .mesh-badge {
    height: 30px;
    padding: 0 12px;
    border-radius: 0;
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
  .mesh-code-input {
    height: 36px;
    padding: 0 10px;
    border-radius: 0;
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
    border-radius: 0;
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
    border-radius: 0;
    border: 1px solid var(--border-light, rgba(0, 0, 0, 0.1));
    background: rgba(232, 96, 60, 0.06);
    font-size: 13px;
    color: var(--text);
  }
  .data-trigger button {
    height: 28px;
    padding: 0 10px;
    border-radius: 0;
    border: 1px solid var(--border-light, rgba(0, 0, 0, 0.1));
    background: transparent;
    color: var(--text);
    font-size: 12px;
    cursor: pointer;
  }

  /* Unification plan — focused mode. /run/<slug>/ → /container?app=
     &focused=1 lands here. Full-bleed app + invisible chrome. The
     AppSwitcherGesture component owns its own overlays; this just
     sets up the iframe stage. */
  .focused-shell {
    position: fixed;
    inset: 0;
    background: var(--bg-pure, #fff);
  }
  .focused-frame {
    position: fixed;
    inset: 0;
  }
  .focused-frame :global(.frame-stage) {
    position: fixed;
    inset: 0;
  }
  .focused-frame :global(.frame-stage iframe) {
    width: 100%;
    height: 100%;
    min-height: 100svh;
    min-height: 100dvh;
    border: 0;
    display: block;
  }
  .focused-not-found {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    padding: clamp(1.5rem, 4vw, 3rem);
  }

  /* Persistent exit affordance — fixed top-left, always visible in
     focused mode. Distinct from the drawer-internal .focused-home
     (which is gated behind opening the drawer). Sits above the iframe;
     never obscures the corner of the underlying app's content beyond
     a small badge. Respects iOS safe-area-inset-top. */
  .focused-exit-pill {
    position: fixed;
    top: calc(env(safe-area-inset-top, 0px) + var(--space-md));
    left: calc(env(safe-area-inset-left, 0px) + var(--space-md));
    z-index: 60;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.65rem 0.4rem 0.45rem;
    background: rgba(20, 18, 15, 0.65);
    border: 1px solid rgba(168, 196, 145, 0.35);
    color: var(--text);
    font-family: var(--font-heading);
    font-weight: 700;
    font-size: 0.95rem;
    letter-spacing: -0.015em;
    text-decoration: none;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    opacity: 0.7;
    transition: opacity 0.18s ease, background 0.18s ease, border-color 0.18s ease;
  }
  .focused-exit-pill:hover,
  .focused-exit-pill:focus-visible {
    opacity: 1;
    background: rgba(20, 18, 15, 0.85);
    border-color: var(--sage-leaf);
  }
  .focused-exit-pill img {
    display: block;
    flex-shrink: 0;
  }

  .focused-drawer {
    padding: env(safe-area-inset-top, 24px) 20px env(safe-area-inset-bottom, 24px);
    display: flex;
    flex-direction: column;
    gap: 16px;
    color: var(--text, #14120f);
  }
  .focused-drawer-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    padding-bottom: 12px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  }
  .focused-home {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: inherit;
    text-decoration: none;
    font-weight: 600;
    font-size: 18px;
  }
  .focused-rocket {
    font-size: 20px;
    line-height: 1;
  }
  .focused-data {
    color: var(--sunset, #e8603c);
    font-size: 13px;
    text-decoration: none;
    padding: 6px 12px;
    border: 1px solid rgba(232, 96, 60, 0.4);
    border-radius: 999px;
  }
  .focused-data:hover {
    background: rgba(232, 96, 60, 0.08);
  }
  .focused-drawer h2 {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: rgba(0, 0, 0, 0.55);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .focused-insights-heading {
    margin-top: 8px;
  }
  .focused-insights {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .focused-insight {
    background: rgba(255, 255, 255, 0.85);
    border: 1px solid rgba(0, 0, 0, 0.08);
    border-radius: 12px;
    padding: 12px 14px;
  }
  .focused-insight strong {
    display: block;
    font-size: 14px;
  }
  .focused-insight p {
    margin: 4px 0 0;
    color: rgba(0, 0, 0, 0.55);
    font-size: 13px;
  }
  .focused-insight-high {
    border-color: rgba(232, 96, 60, 0.5);
    background: rgba(232, 96, 60, 0.05);
  }
  .focused-insight-medium {
    border-color: rgba(94, 167, 119, 0.4);
    background: rgba(94, 167, 119, 0.06);
  }
  .focused-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 8px;
  }
  .focused-tile {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    padding: 12px;
    border: 1px solid rgba(0, 0, 0, 0.08);
    background: rgba(255, 255, 255, 0.85);
    cursor: pointer;
    text-align: left;
    color: inherit;
    font: inherit;
  }
  .focused-tile.active {
    border-color: var(--accent);
    background: #fff;
    box-shadow: 0 0 0 2px var(--accent);
  }
  .focused-tile strong {
    font-size: 14px;
  }
  .focused-tile small {
    color: rgba(0, 0, 0, 0.55);
    font-size: 12px;
  }
  .focused-dot {
    width: 28px;
    height: 28px;
    background: var(--accent);
    color: #fff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    margin-bottom: 4px;
  }
</style>
