<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import { goto, pushState, replaceState } from '$app/navigation';
  import { page } from '$app/stores';
  import { readShippiePackageArchive } from '@shippie/app-package-builder';
  import { ContainerBridgeHost, createWindowBridgeTransport } from '@shippie/container-bridge';
  import { postWrapperAnalyticsViaRegistry } from '$lib/telemetry/egress-registry';
  import { emitBridgeLedgerRow, withRevocationGate } from '$lib/trust-ledger/host';
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
    type AppSpaceContext,
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
  import { recordIntents } from '$lib/intent-store/store';
  import {
    findRequestedApp,
    manifestToContainerApp,
    mergeApps,
    pickBaseApps,
    visibleContainerApps,
  } from '$lib/container/app-registry';
  import {
    buildLauncherVisibleSlugSet as drawerBuildLauncherVisibleSlugSet,
    filterCanonicalLauncherItems as drawerFilterCanonicalLauncherItems,
    launcherPhase as drawerLauncherPhase,
    mergeCatalog as drawerMergeCatalog,
  } from '$lib/launcher';
  import {
    buildLocalRow,
    computeStorageUsage,
    createAppHandlers,
    deleteLocalDbRow,
    filterRowsByTable,
    queryLocalDbRows,
    updateLocalDbRow,
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
  import AccessPane from '$lib/container/your-data/AccessPane.svelte';
  import YourDataTab from '$lib/container/your-data/YourDataTab.svelte';
  import { createTextureRouter, type TextureName } from '$lib/container/texture-router';
  import {
    createMeshStatusStore,
    meshBadgeLabel,
    type MeshStatus,
  } from '$lib/container/mesh-status';
  import {
    createAiWorkerClient,
    createMemoryAiTransport,
    createWorkerTransport,
    type AiWorkerClient,
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
  import {
    ToolTile,
    containerAppToToolTile,
    type ToolRuntimeState,
  } from '$lib/components/tool-surface';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import PushOptInToast from '$lib/components/notifications/PushOptInToast.svelte';
  import DashboardHome from '$lib/container/DashboardHome.svelte';
  import {
    hydrateLauncherMemory,
    launcherMemory,
    recordAppLaunch,
    togglePinnedApp,
  } from '$lib/stores/launcher-memory';
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
    appLifecycleErrorMessage,
    isRecoverableAppLifecycleError,
    isRetryableAppLifecycleError,
    parseAppLifecycleMessage,
    type AppLifecycleMessage,
  } from '$lib/container/app-lifecycle';
  import {
    buildSingleHtmlPackage,
    installBuiltPackage,
    recoveredReceiptsFor,
    uninstallContainerAppState,
  } from '$lib/container/package-runtime';
  import {
    deleteImportedPackage,
    loadImportedPackage,
    saveImportedPackage,
  } from '$lib/container/local-package-store';
  import { startCatalogSync } from '$lib/client/catalog-sync';

  let { data }: { data: PageData } = $props();
  type PrivateJoinData = NonNullable<PageData['privateJoin']>;

  const initialFocusedApp = untrack(() => (
    data.focused
      ? findRequestedApp(pickBaseApps(data.packages), data.requestedAppSlug)
      : null
  ));
  const baseApps = $derived(pickBaseApps(data.packages));

  let importedApps = $state<ContainerApp[]>([]);
  const merged = $derived(mergeApps(baseApps, importedApps));
  const apps = $derived(merged.apps);
  /**
   * Drawer's visible app set. Replaces the old `visibleContainerApps`
   * filter, which only knew about archived showcases. The shared
   * launcher shelf applies the same canonicalisation (SLUG_ALIASES),
   * upcoming-promotion (PROMOTIONS_BY_PHASE), and archived rules that
   * `/+page.server.ts` uses for the homepage. Result: both surfaces
   * resolve to the same canonical app set. See the convergence test in
   * `$lib/launcher/convergence.test.ts`.
   */
  const launchVisibleApps = $derived.by(() => {
    const phase = drawerLauncherPhase();
    const catalog = drawerMergeCatalog(visibleContainerApps(apps), []);
    const allowed = drawerBuildLauncherVisibleSlugSet(catalog, phase);
    // Drop apps whose raw slug is an alias source — only display the
    // canonical entry, never the legacy slug, even when the container
    // bundle still ships it for /run/<old-slug>/ resolution.
    return drawerFilterCanonicalLauncherItems(apps, allowed);
  });
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
  let activeAppId = $state<string | null>(initialFocusedApp?.id ?? null);
  let openAppIds = $state<string[]>(initialFocusedApp ? [initialFocusedApp.id] : []);
  // Focused-mode app-switcher drawer open state. Only meaningful when
  // `data.focused === true`; ignored in dashboard mode.
  let focusedDrawerOpen = $state(false);
  let focusedToolOptionsOpen = $state(false);
  let focusedShareFeedback = $state('');
  let focusedQrMarkup = $state<string | null>(null);
  // Safe-edges contract: each iframe-mounted app can declare which
  // part of the viewport its own touch input owns via the
  // @shippie/iframe-sdk safe-edges API. Host honours this by shrinking
  // its own chrome (focused-chrome-tools + focused-chrome-options
  // buttons) so a tap meant for a game doesn't open container UI.
  // 'none' keeps the chrome at full size; 'bottom' is a placeholder
  // for future bottom-grabber suppression; 'all' shrinks the chrome
  // to a 12px edge sliver that's still tappable but stops bleeding
  // into game touch targets.
  type InputRegionOwns = 'none' | 'bottom' | 'all';
  let inputRegionByAppId = $state<Record<string, InputRegionOwns>>({});
  // Set when /run/<slug>/ resolved a slug we don't have. Used to render
  // an EmptyState in focused mode instead of silently swapping the user
  // onto a different app.
  let notFoundSlug = $state<string | null>(null);
  // True on a user's first-ever entry into focused mode. Drives a one-
  // shot pulse on the Shippie mark so first-run users discover that it
  // opens the tool switcher. Gated by localStorage.
  let firstRunHint = $state(false);
  // Viewport width for drawer-edge selection. ≤640px → drawer rises from
  // the bottom (matches the mark's top-right placement on mobile via the
  // existing media query); larger → slides in from the left next to the
  // mark's top-left placement on desktop.
  let viewportWidth = $state(typeof window === 'undefined' ? 1024 : window.innerWidth);
  const focusedDrawerEdge = $derived<'left' | 'bottom'>(viewportWidth <= 640 ? 'bottom' : 'left');
  let receiptsByApp = $state<Record<string, AppReceipt>>(
    initialFocusedApp ? { [initialFocusedApp.id]: createReceiptFor(initialFocusedApp) } : {},
  );
  let receiptExport = $state('');
  let backupPassphrase = $state('');
  let backupExport = $state('');
  let backupError = $state('');
  let restorePassphrase = $state('');
  let restorePayload = $state('');
  let restoreStatus = $state('');
  let dataRecoveryStatus = $state('');
  let packageImportPayload = $state('');
  let packageImportStatus = $state('');
  let packageDropActive = $state(false);
  let packageFilesByApp = $state<Record<string, Record<string, PackageFileCache>>>({});
  let frameStates = $state<FrameStates>({});
  let frameReloadNonce = $state<FrameReloadNonces>({});
  let framePaintMissRetries = $state<Record<string, number>>({});
  let collectionUrl = $state('/api/collections/official');
  let collectionStatus = $state('');
  let activeCollection = $state<AppCollectionManifest | null>(null);
  let installingPackageHash = $state<string | null>(null);
  let privateJoinAttempted = $state(false);
  let privateJoinStatus = $state('');
  let privateJoinState = $state<'loading' | 'ready' | 'error'>('loading');
  let rowsByApp = $state<Record<string, LocalRow[]>>({});
  let logs = $state<BridgeLog[]>([]);
  let bridgeStatus = $state<'waiting' | 'ready'>('waiting');
  let frameCanGoBackByApp = $state<Record<string, boolean>>({});
  let frameLifecycleByApp = $state<Record<string, AppLifecycleMessage>>({});
  let pendingFocusedBackAppId: string | null = null;
  let pendingFocusedBackFallbackTimer: ReturnType<typeof setTimeout> | null = null;
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
  const pendingIntentBatch = $derived.by(() => {
    const first = pendingIntentQueue[0];
    if (!first) return null;
    const items = pendingIntentQueue.filter((p) => p.consumerId === first.consumerId);
    return {
      consumerId: first.consumerId,
      consumerName: first.consumerName,
      intents: items.map((p) => p.intent),
    };
  });
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

  // Per-(source, target) in-flight transfer set. Surfaced as a small chip
  // so the user has a "we received your drop" signal between the source
  // app firing the drop and the target acknowledging it. Keys are
  // `${sourceId}->${targetId}` so a single source/target pair only shows
  // one chip at a time.
  let transferPending = $state<Set<string>>(new Set());
  let transferPendingLabel = $state<string>('');
  let transferPendingLabelTimer: ReturnType<typeof setTimeout> | null = null;
  function transferPendingKey(sourceId: string, targetId: string): string {
    return `${sourceId}->${targetId}`;
  }
  function markTransferPending(sourceId: string, targetId: string, kind: string) {
    const key = transferPendingKey(sourceId, targetId);
    if (transferPending.has(key)) return;
    const next = new Set(transferPending);
    next.add(key);
    transferPending = next;
    transferPendingLabel = `Sending ${kind}…`;
    if (transferPendingLabelTimer) clearTimeout(transferPendingLabelTimer);
  }
  function clearTransferPending(sourceId: string, targetId: string) {
    const key = transferPendingKey(sourceId, targetId);
    if (!transferPending.has(key)) return;
    const next = new Set(transferPending);
    next.delete(key);
    transferPending = next;
    if (next.size === 0) {
      // Briefly hold the label so the chip doesn't ghost-flicker on
      // fast resolutions; clearing immediately reads as "did anything
      // happen?".
      if (transferPendingLabelTimer) clearTimeout(transferPendingLabelTimer);
      transferPendingLabelTimer = setTimeout(() => {
        if (transferPending.size === 0) transferPendingLabel = '';
        transferPendingLabelTimer = null;
      }, 200);
    }
  }

  // Combined modal queue surface — intents are batched by consumerId so each
  // unique consumer counts once; transfers are one prompt per item.
  // Intents render first (the orchestrator dismisses them in that order), so
  // the active intent batch is always index 1 of the combined queue.
  const pendingIntentBatchCount = $derived.by(() => {
    const seen = new Set<string>();
    for (const p of pendingIntentQueue) seen.add(p.consumerId);
    return seen.size;
  });
  const pendingPromptQueueSize = $derived(
    pendingIntentBatchCount + pendingTransferQueue.length,
  );
  // The intent modal is always at position 1 when it's open; if it's closed,
  // the transfer modal is at position 1 (no intents ahead of it).
  const intentQueueIndex = $derived(pendingIntentPrompt ? 1 : 0);
  const transferQueueIndex = $derived(
    pendingTransferPrompt ? pendingIntentBatchCount + 1 : 0,
  );
  let yourDataOpenForApp = $state<string | null>(null);
  const yourDataHost = createYourDataHost({
    onChange: (next) => {
      yourDataOpenForApp = next.appId;
      if (next.open) {
        if (data.focused) {
          exitFocusedMode('data');
        } else {
          section = 'data';
          activeAppId = null;
        }
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

  function dataTrustLine(app: ContainerApp): string {
    const grade = app.trust?.privacy.grade ?? 'ungraded';
    const domains = app.trust?.privacy.externalDomains.length ?? 0;
    const score = app.trust?.security.score;
    return `Privacy ${grade} · ${domains} external domain${domains === 1 ? '' : 's'} · security ${score ?? 'unscored'}`;
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
  // Phase B1 — AI worker. Spawn the actual model worker lazily on the
  // first ai.run so the launcher stays light, but make the fallback
  // path look like a normal "unavailable" result instead of an app
  // error. Apps can call AI opportunistically and hide bonus features
  // without showing users setup prompts.
  function buildUnavailableAiClient(): AiWorkerClient {
    return createAiWorkerClient({
      transport: createMemoryAiTransport((req) => ({
        kind: 'shippie.ai.response',
        id: req.id,
        ok: true,
        result: { task: req.request.task, output: null, source: 'unavailable' },
      })),
    });
  }

  function buildRealAiClient(): AiWorkerClient | null {
    if (typeof Worker === 'undefined') return null;
    try {
      const worker = new Worker(new URL('../../lib/container/ai-worker.ts', import.meta.url), {
        type: 'module',
      });
      return createAiWorkerClient({
        transport: createWorkerTransport(worker),
      });
    } catch (err) {
      console.warn('[container] AI worker unavailable', err);
      return null;
    }
  }

  let aiClient = buildUnavailableAiClient();
  let aiWorkerStarted = false;
  function ensureAiWorkerStarted(): void {
    if (aiWorkerStarted) return;
    aiWorkerStarted = true;
    const nextClient = buildRealAiClient();
    if (!nextClient) return;
    aiClient.dispose();
    aiClient = nextClient;
  }
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
      ensureAiWorkerStarted();
      return await aiClient.run(req);
    } catch (err) {
      console.warn('[container] AI request unavailable', err);
      return { task: req.task, output: null, source: 'unavailable' };
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
  const activeToolUrl = $derived.by(() => {
    if (!activeApp || typeof window === 'undefined') return '';
    return new URL(`/run/${encodeURIComponent(activeApp.slug)}`, window.location.origin).toString();
  });
  // Dedupe QR generation by (activeApp.id, focusedToolOptionsOpen). The
  // previous derivation re-fired whenever `focusedToolOptionsOpen`
  // changed even if the URL was identical, briefly clearing
  // `focusedQrMarkup` to null on fast open/close and producing a
  // visible flicker. The key keeps the last completed generation
  // pinned so re-opening the same tool reuses the same SVG.
  const qrGenKey = $derived(
    activeApp && focusedToolOptionsOpen
      ? `${activeApp.id}:${focusedToolOptionsOpen}`
      : '',
  );
  let lastQrGenKey = '';
  $effect(() => {
    if (!qrGenKey || !activeToolUrl || typeof window === 'undefined') {
      focusedQrMarkup = null;
      lastQrGenKey = '';
      return;
    }
    if (qrGenKey === lastQrGenKey && focusedQrMarkup) {
      // Same key, SVG already generated — skip the regeneration and
      // hold the existing markup to avoid the open/close flicker.
      return;
    }
    let cancelled = false;
    const url = activeToolUrl;
    const startedAppId = activeApp?.id ?? null;
    const generationKey = qrGenKey;
    focusedQrMarkup = null;
    void import('@shippie/qr')
      .then(({ qrSvg }) => qrSvg(url, { ecc: 'M', size: 132 }))
      .then((svg) => {
        if (cancelled) return;
        // Race-safe bail: activeApp.id changed mid-generation, drop
        // the result silently so the stale URL never paints.
        if ((activeApp?.id ?? null) !== startedAppId) return;
        if (activeToolUrl !== url) return;
        lastQrGenKey = generationKey;
        focusedQrMarkup = svg;
      })
      .catch(() => {
        if (!cancelled) focusedQrMarkup = null;
      });
    return () => {
      cancelled = true;
    };
  });
  const activeFrameCanGoBack = $derived(Boolean(activeAppId && frameCanGoBackByApp[activeAppId]));
  const installedApps = $derived(apps.filter((app) => openAppIds.includes(app.id)));

  /**
   * Cross-tool observation flows for the Your Data panel.
   *
   * Walks every installed provider's declared
   * `crossAppIntents.provides` and, for each declared intent, lists
   * the consumers that have an active grant in `intentGrants`. Powers
   * the "Cross-tool flows" section: per provider → per intent →
   * granted consumers + revoke control.
   *
   * Note on emit-counts: this derives from declarations + grants, not
   * from runtime broadcasts. Tracking historical emit counts requires
   * a separate per-app log (deferred to a later phase).
   */
  const observationFlows = $derived.by(() => {
    type Flow = {
      provider: ContainerApp;
      intent: string;
      consumers: ContainerApp[];
    };
    const flows: Flow[] = [];
    for (const provider of installedApps) {
      const provides = provider.permissions.capabilities.crossAppIntents?.provides ?? [];
      for (const intent of provides) {
        const consumers = installedApps.filter(
          (consumer) =>
            consumer.id !== provider.id && isIntentGranted(intentGrants, consumer.id, intent),
        );
        flows.push({ provider, intent, consumers });
      }
    }
    return flows;
  });
  const appBySlug = $derived(new Map(apps.map((app) => [app.slug, app])));
  const launchVisibleAppBySlug = $derived(new Map(launchVisibleApps.map((app) => [app.slug, app])));
  const drawerPinnedSet = $derived(new Set($launcherMemory.pinned));
  const drawerPinnedApps = $derived.by(() => {
    // Pinned slugs are unique by construction (toggle prevents dupes),
    // so we can resolve and filter in a single pass without a second
    // dedup step.
    const out: ContainerApp[] = [];
    for (const slug of $launcherMemory.pinned) {
      const app = launchVisibleAppBySlug.get(slug);
      if (app) out.push(app);
    }
    return out;
  });
  const drawerRecentApps = $derived.by(() => {
    // Reuse the pinned set from `drawerPinnedSet`. Building a fresh
    // Set per derive is wasted work for ~12 pinned slugs.
    const seen = new Set<string>();
    const out: ContainerApp[] = [];
    for (const recent of $launcherMemory.recents) {
      if (drawerPinnedSet.has(recent.slug)) continue;
      const app = launchVisibleAppBySlug.get(recent.slug);
      if (!app || seen.has(app.id)) continue;
      seen.add(app.id);
      out.push(app);
    }
    return out;
  });
  const drawerQuickApps = $derived.by(() => {
    // Pinned and recent are mutually exclusive by construction
    // (drawerRecentApps filters by drawerPinnedSet), so concatenation is
    // already deduplicated.
    return [...drawerPinnedApps, ...drawerRecentApps];
  });
  const drawerPersonalized = $derived(drawerQuickApps.length > 0);
  const drawerRemainingApps = $derived.by(() => {
    if (!drawerPersonalized) return launchVisibleApps;
    const shown = new Set(drawerQuickApps.map((app) => app.id));
    return launchVisibleApps.filter((app) => !shown.has(app.id));
  });
  // Drawer search — surfaces a lightweight filter once the visible
  // tool set is large enough to need it. Below ~12 apps a search box
  // is just noise; above it, scrolling the drawer becomes the slowest
  // path to the tool you want.
  let drawerSearchQuery = $state('');
  const drawerSearchActive = $derived(
    drawerQuickApps.length + drawerRemainingApps.length > 12,
  );
  const drawerSearchTrim = $derived(drawerSearchQuery.trim().toLowerCase());
  function matchesDrawerSearch(app: ContainerApp): boolean {
    if (!drawerSearchTrim) return true;
    return (
      app.name.toLowerCase().includes(drawerSearchTrim) ||
      app.slug.toLowerCase().includes(drawerSearchTrim) ||
      (app.shortName ?? '').toLowerCase().includes(drawerSearchTrim) ||
      (app.category ?? '').toLowerCase().includes(drawerSearchTrim)
    );
  }
  const drawerQuickAppsFiltered = $derived(
    drawerSearchTrim ? drawerQuickApps.filter(matchesDrawerSearch) : drawerQuickApps,
  );
  const drawerRemainingAppsFiltered = $derived(
    drawerSearchTrim ? drawerRemainingApps.filter(matchesDrawerSearch) : drawerRemainingApps,
  );
  const drawerSearchResults = $derived.by(() => {
    if (!drawerSearchTrim) return [];
    const seen = new Set<string>();
    return [...drawerQuickAppsFiltered, ...drawerRemainingAppsFiltered].filter((app) => {
      if (seen.has(app.id)) return false;
      seen.add(app.id);
      return true;
    });
  });
  function drawerRuntimeStateFor(app: ContainerApp): ToolRuntimeState {
    if (activeAppId === app.id) return 'current';
    if (openAppIds.includes(app.id)) return 'live';
    return 'idle';
  }
  const recoveredReceipts = $derived(recoveredReceiptsFor(receiptsByApp, appById));
  const totalRows = $derived(Object.values(rowsByApp).reduce((sum, rows) => sum + rows.length, 0));
  const updateCards = $derived(
    installedApps
      .map((app) => buildUpdateCard(app, receiptsByApp[app.id]))
      .filter((card): card is UpdateCard => Boolean(card)),
  );

  function openApp(appId: string) {
    const wasAlreadyFocused = activeAppId === appId && section === 'home';
    const app = appById.get(appId);

    if (data.focused) {
      openAppIds = [appId];
      if (app && !receiptsByApp[appId]) {
        receiptsByApp = {
          ...receiptsByApp,
          [appId]: createReceiptFor(app),
        };
      }
      activeAppId = appId;
      section = 'home';
      if (!wasAlreadyFocused) {
        rememberAppLaunch(app);
        void trackAppOpen(appId);
      }
      return;
    }

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
    if (app && !receiptsByApp[appId]) {
      receiptsByApp = {
        ...receiptsByApp,
        [appId]: createReceiptFor(app),
      };
    }
    activeAppId = appId;
    section = 'home';
    if (!wasAlreadyFocused) {
      rememberAppLaunch(app);
      void trackAppOpen(appId);
    }
  }

  function switchFocusedApp(app: ContainerApp) {
    openApp(app.id);
    closeFocusedDrawer();
    focusedToolOptionsOpen = false;
    if (data.focused && typeof window !== 'undefined') {
      replaceFocusedRunUrl(app);
      window.requestAnimationFrame(() => frames.get(app.id)?.focus());
    }
  }

  function replaceFocusedRunUrl(app: ContainerApp) {
    if (!data.focused || typeof window === 'undefined') return;
    const href = `/run/${encodeURIComponent(app.slug)}`;
    if (window.location.pathname === href && !window.location.search) return;
    try {
      window.history.replaceState(
        { ...window.history.state, shippieFocused: true },
        '',
        href,
      );
    } catch {
      replaceState(href, { ...window.history.state, shippieFocused: true });
    }
  }

  function exitFocusedMode(targetSection: ContainerSection = 'home') {
    dismissTransientPrompts();
    closeFocusedDrawer();
    focusedToolOptionsOpen = false;
    activeAppId = null;
    section = targetSection;
    const href = targetSection === 'home' ? '/workspace' : `/workspace?section=${targetSection}`;
    void goto(href, { noScroll: true, keepFocus: true });
  }

  function closeFocusedDrawer() {
    drawerSearchQuery = '';
    focusedDrawerOpen = false;
  }

  function toggleFocusedDrawer() {
    focusedToolOptionsOpen = false;
    if (focusedDrawerOpen) {
      closeFocusedDrawer();
      return;
    }
    drawerSearchQuery = '';
    focusedDrawerOpen = true;
  }

  function toggleFocusedToolOptions() {
    closeFocusedDrawer();
    focusedToolOptionsOpen = !focusedToolOptionsOpen;
  }

  function closeFocusedToolOptions() {
    focusedToolOptionsOpen = false;
  }

  function handleFocusedChromeKeydown(event: KeyboardEvent) {
    if (!data.focused || event.key !== 'Escape') return;
    if (focusedToolOptionsOpen) {
      event.preventDefault();
      focusedToolOptionsOpen = false;
    }
  }

  async function copyActiveToolLink() {
    if (!activeToolUrl) return;
    try {
      await navigator.clipboard?.writeText(activeToolUrl);
      focusedShareFeedback = 'Copied';
    } catch {
      focusedShareFeedback = 'Copy failed';
    }
    window.setTimeout(() => {
      focusedShareFeedback = '';
    }, 1600);
  }

  async function shareActiveTool() {
    if (!activeApp || !activeToolUrl) return;
    const shareData = {
      title: `${activeApp.name} on Shippie`,
      text: activeApp.description || `Open ${activeApp.name} in Shippie.`,
      url: activeToolUrl,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        focusedShareFeedback = 'Shared';
      } else {
        await copyActiveToolLink();
        return;
      }
    } catch (error) {
      if ((error as DOMException)?.name !== 'AbortError') {
        await copyActiveToolLink();
        return;
      }
    }
    window.setTimeout(() => {
      focusedShareFeedback = '';
    }, 1600);
  }

  function dismissTransientPrompts() {
    if (pendingIntentQueue.length > 0) {
      for (const prompt of pendingIntentQueue) {
        prompt.resolve({ provider: null, rows: [], reason: 'permission_denied' });
      }
      pendingIntentQueue = [];
    }
    if (pendingTransferQueue.length > 0) {
      for (const prompt of pendingTransferQueue) {
        prompt.resolve({ delivered: false, target: null, reason: 'permission_denied' });
      }
      pendingTransferQueue = [];
    }
  }

  function toggleDrawerPin(app: ContainerApp) {
    togglePinnedApp(app.slug);
  }

  function rememberAppLaunch(app: ContainerApp | undefined) {
    if (!app) return;
    const recent = $launcherMemory.recents.find((item) => item.slug === app.slug);
    const lastOpened = recent ? Date.parse(recent.lastOpened) : 0;
    if (Number.isFinite(lastOpened) && Date.now() - lastOpened < 5_000) return;
    recordAppLaunch(app.slug);
  }

  function trackAppOpen(appId: string) {
    const app = appById.get(appId);
    if (!app) return;
    if (!claimAppOpenEvent(appId)) return;
    void trackAnalytics(appId, {
      event: 'app_open',
      session_id: analyticsSessionId(),
      props: {
        source: 'container',
        focused: data.focused,
        app_kind: app.appKind,
        category: app.category ?? null,
      },
      ts: Date.now(),
    });
  }

  function claimAppOpenEvent(appId: string, now = Date.now()): boolean {
    const key = `shippie:analytics-open:${appId}`;
    try {
      const previous = Number(sessionStorage.getItem(key) ?? '0');
      if (Number.isFinite(previous) && now - previous < 10_000) return false;
      sessionStorage.setItem(key, String(now));
      return true;
    } catch {
      return true;
    }
  }

  function analyticsSessionId(): string {
    const key = 'shippie:analytics-session:v1';
    try {
      const existing = sessionStorage.getItem(key);
      if (existing) return existing;
      const id = `anon_${typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`}`;
      sessionStorage.setItem(key, id);
      return id;
    } catch {
      return `anon_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
    }
  }

  function disposeApp(appId: string) {
    hosts.get(appId)?.dispose();
    hosts.delete(appId);
    frames.delete(appId);
    const { [appId]: _removed, ...rest } = frameCanGoBackByApp;
    frameCanGoBackByApp = rest;
    const { [appId]: _removedLifecycle, ...restLifecycle } = frameLifecycleByApp;
    frameLifecycleByApp = restLifecycle;
    revokePackageFrameSource(appId, packageObjectUrls);
  }

  const prewarmedRuntimeHrefs = new Set<string>();

  function prewarmRuntime(app: ContainerApp | null | undefined) {
    if (!app || typeof document === 'undefined') return;
    const href = runtimeSrcFor(app);
    if (!href || prewarmedRuntimeHrefs.has(href)) return;
    prewarmedRuntimeHrefs.add(href);
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.as = 'document';
    link.href = href;
    document.head.appendChild(link);
  }

  function prewarmLikelyNextApps() {
    const seen = new Set<string>();
    const candidates = [
      ...drawerQuickApps,
      ...installedApps,
    ].filter((app) => {
      if (!app || app.id === activeAppId || seen.has(app.id)) return false;
      seen.add(app.id);
      return true;
    });
    for (const app of candidates.slice(0, 4)) prewarmRuntime(app);
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
    const paintChecks = [2_500, 8_000, 16_000].map((delay) =>
      window.setTimeout(() => markFrameReady(appId, node), delay),
    );
    const timeout = window.setTimeout(() => {
      if (frameStates[appId]?.status === 'booting') {
        markFrameError(appId, 'This app took too long to start.');
      }
    }, 15_000);

    return {
      destroy() {
        for (const check of paintChecks) window.clearTimeout(check);
        window.clearTimeout(timeout);
        frames.delete(appId);
        hosts.get(appId)?.dispose();
        hosts.delete(appId);
      },
    };
  }

  function markFrameBooting(appId: string) {
    frameStates = markFrameBootingState(frameStates, appId);
    const remainingLifecycle = { ...frameLifecycleByApp };
    delete remainingLifecycle[appId];
    frameLifecycleByApp = remainingLifecycle;
  }

  function markFrameReady(appId: string, frame?: HTMLIFrameElement) {
    const app = appById.get(appId);
    if (frame && app && isInspectableRuntimeFrame(frame, app)) {
      window.requestAnimationFrame(() => {
        if (!isResolvableFrame(appId, frame) || !canResolveFrameReady(appId)) return;
        if (frameLifecycleByApp[appId]?.event === 'ready' || frameLifecycleByApp[appId]?.event === 'heartbeat') {
          markFrameReady(appId);
          return;
        }
        if (frameLooksPainted(frame)) {
          markFrameReady(appId);
          return;
        }
        window.setTimeout(() => {
          if (!isResolvableFrame(appId, frame) || !canResolveFrameReady(appId)) return;
          if (frameLifecycleByApp[appId]?.event === 'ready' || frameLifecycleByApp[appId]?.event === 'heartbeat') {
            markFrameReady(appId);
            return;
          }
          if (frameLooksPainted(frame)) {
            markFrameReady(appId);
            return;
          }
          // Apps that speak the lifecycle contract get a slightly longer
          // grace period because their SDK waits for a meaningful DOM paint
          // before reporting ready. Older apps still fall back quickly.
          const lifecycleAware = Boolean(frameLifecycleByApp[appId]);
          const fallbackDelay = lifecycleAware ? 3_200 : 1_600;
          window.setTimeout(() => {
            if (!isResolvableFrame(appId, frame) || !canResolveFrameReady(appId)) return;
            if (frameLifecycleByApp[appId]?.event === 'ready' || frameLifecycleByApp[appId]?.event === 'heartbeat') {
              markFrameReady(appId);
              return;
            }
            if (frameLooksPainted(frame)) {
              markFrameReady(appId);
              return;
            }
            markFrameError(
              appId,
              `${app.name} loaded but did not paint. This is usually a stale app bundle or a script crash; reload it once.`,
              { retryablePaintMiss: true },
            );
          }, fallbackDelay);
        }, 0);
      });
      return;
    }
    frameStates = markFrameReadyState(frameStates, appId);
    const remainingRetries = { ...framePaintMissRetries };
    delete remainingRetries[appId];
    framePaintMissRetries = remainingRetries;
    commitPendingEviction(appId);
    // Emit a window-level event so PushOptInToast can offer notifications
    // after a successful first open. Keeps the container untangled from
    // the notification subsystem.
    if (app && typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('shippie:app-opened', {
          detail: { slug: app.slug, name: app.name },
        }),
      );
    }
  }

  function canResolveFrameReady(appId: string): boolean {
    const status = frameStates[appId]?.status;
    return status === 'booting' || status === 'error';
  }

  function isResolvableFrame(appId: string, frame: HTMLIFrameElement): boolean {
    if (frames.get(appId) === frame) return true;
    return frame.isConnected && frame.dataset.shippieAppId === appId;
  }

  function isInspectableRuntimeFrame(frame: HTMLIFrameElement, app: ContainerApp): boolean {
    const src = frame.getAttribute('src') ?? runtimeSrcFor(app);
    if (!src) return false;
    try {
      const url = new URL(src, window.location.href);
      return url.origin === window.location.origin && url.pathname.startsWith('/__shippie-run/');
    } catch {
      return false;
    }
  }

  function frameLooksPainted(frame: HTMLIFrameElement): boolean {
    let doc: Document | null = null;
    try {
      doc = frame.contentDocument;
    } catch {
      return true;
    }
    if (!doc?.body) return true;
    const bodyText = (doc.body.innerText || doc.body.textContent || '').trim();
    if (/something went wrong|application error|failed to load|not found|404|500/i.test(bodyText)) return false;
    if (bodyText.length > 0) return true;
    if (doc.querySelector('canvas, svg, img, video, button, input, textarea, select, [role="button"], [role="main"]')) {
      return true;
    }
    const root = doc.querySelector('#root, #app, main');
    return Boolean(root && root.children.length > 0);
  }

  function markFrameError(
    appId: string,
    message = 'This app could not open in the container.',
    options: { retryable?: boolean; retryablePaintMiss?: boolean } = {},
  ) {
    if ((options.retryable || options.retryablePaintMiss) && (framePaintMissRetries[appId] ?? 0) === 0) {
      framePaintMissRetries = { ...framePaintMissRetries, [appId]: 1 };
      reloadFrame(appId, { resetPaintMissRetry: false });
      return;
    }
    frameStates = markFrameErrorState(frameStates, appId, message);
    // Also commit the queued eviction even on error — there's no point
    // holding the old app's resources hostage when the new one isn't
    // going to render anyway.
    commitPendingEviction(appId);
  }

  function reloadFrame(appId: string, options: { resetPaintMissRetry?: boolean } = {}) {
    if (options.resetPaintMissRetry !== false) {
      const remainingRetries = { ...framePaintMissRetries };
      delete remainingRetries[appId];
      framePaintMissRetries = remainingRetries;
    }
    markFrameBooting(appId);
    revokePackageFrameSource(appId, packageObjectUrls);
    frameReloadNonce = nextFrameReloadNonces(frameReloadNonce, appId);
  }

  async function bootHost(appId: string, frame: HTMLIFrameElement) {
    const app = appById.get(appId);
    if (!app || hosts.has(appId)) return;

    if (!frame.contentWindow) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      if (!frame.contentWindow) return;
    }

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
        // Local-first apps can legitimately burst during first-run seeding.
        // Keep a bounded bridge limit, but don't make builders batch around
        // infrastructure just to persist starter data.
        rateLimit: { maxRequests: 500, windowMs: 10_000 },
        onCommitLedger: (event) =>
          emitBridgeLedgerRow(event, {
            resolveApp: (id) => {
              const a = appById.get(id);
              if (!a) return null;
              return {
                appSlug: a.slug,
                egressVisibility: ledgerEgressVisibilityFor(a),
              };
            },
          }),
        handlers: withRevocationGate(createAppHandlers({
          appId,
          app,
          spaceContext: currentSpaceContextFor(app),
          insertRow,
          createTable,
          updateRow,
          deleteRow,
          queryRows,
          storageUsage,
          consumeIntent,
          consumersFor: (intent) => intentRegistry.consumersFor(intent),
          dataOpenPanel: (id) => {
            yourDataHost.openFor(id);
            return { opened: true };
          },
          trackAnalytics,
          fireTexture: (name) => textureRouter.fire(name),
          runAi,
          broadcastIntent: (providerAppId, intent, rows) =>
            broadcastIntentToConsumers(providerAppId, intent, rows),
          recordIntentForToday: (providerAppId, intent, rows) => {
            // IndexedDB write — fire-and-forget. The /today summary
            // is observability, not consistency-critical.
            void recordIntents(providerAppId, intent, rows).catch(() => {});
          },
          listOverlappingApps: (callerId) => listAppsOverlappingCaller(callerId),
          insightsForApp: (callerId) => insightsForCaller(callerId),
          startTransferDrop: (sourceId, kind, preview) =>
            startTransferDrop(sourceId, kind, preview),
          commitTransferDrop: (sourceId, targetSlug, kind, payload) =>
            trackedCommitTransferDrop(sourceId, targetSlug, kind, payload),
        }), app.slug),
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

  function recordAppLifecycle(event: MessageEvent) {
    const payload = parseAppLifecycleMessage(event.data);
    if (!payload) return;
    const appId = appIdForMessageSource(event.source);
    if (!appId) return;

    frameLifecycleByApp = { ...frameLifecycleByApp, [appId]: payload };

    if (typeof payload.canGoBack === 'boolean' && frameCanGoBackByApp[appId] !== payload.canGoBack) {
      frameCanGoBackByApp = { ...frameCanGoBackByApp, [appId]: payload.canGoBack };
    }

    if (payload.event === 'ready' || payload.event === 'heartbeat') {
      if (frameStates[appId]?.status !== 'ready') markFrameReady(appId);
      return;
    }

    if (payload.event === 'error') {
      if (isRecoverableAppLifecycleError(payload)) {
        if (frameStates[appId]?.status !== 'ready') markFrameReady(appId);
        return;
      }
      markFrameError(appId, appLifecycleErrorMessage(payload), {
        retryable: isRetryableAppLifecycleError(payload),
      });
    }
  }

  function recordFrameNavigationBackResult(event: MessageEvent) {
    const payload = event.data as { type?: string; handled?: unknown } | null;
    if (!payload || payload.type !== 'shippie:navigation-back-result') return;
    const appId = appIdForMessageSource(event.source);
    if (!appId || appId !== pendingFocusedBackAppId) return;
    clearPendingFocusedBackFallback();
    if (payload.handled === false) {
      frameCanGoBackByApp = { ...frameCanGoBackByApp, [appId]: false };
      openFocusedDrawerAsBackFallback();
    }
  }

  function clearPendingFocusedBackFallback() {
    pendingFocusedBackAppId = null;
    if (pendingFocusedBackFallbackTimer) {
      clearTimeout(pendingFocusedBackFallbackTimer);
      pendingFocusedBackFallbackTimer = null;
    }
  }

  function restoreFocusedHistorySentinel() {
    if (!data.focused || typeof window === 'undefined') return;
    try {
      pushState('', { ...window.history.state, shippieFocused: true });
    } catch {
      /* history API may be blocked */
    }
  }

  function openFocusedDrawerAsBackFallback() {
    if (!data.focused) return;
    focusedToolOptionsOpen = false;
    drawerSearchQuery = '';
    focusedDrawerOpen = true;
    restoreFocusedHistorySentinel();
  }

  function requestActiveFrameBack(opts: { fallbackToDrawer?: boolean } = {}): boolean {
    if (!activeAppId || frameCanGoBackByApp[activeAppId] !== true) return false;
    const posted = postToAppFrame(activeAppId, { type: 'shippie:navigation-back' });
    if (!posted || !opts.fallbackToDrawer) return posted;
    clearPendingFocusedBackFallback();
    pendingFocusedBackAppId = activeAppId;
    pendingFocusedBackFallbackTimer = setTimeout(() => {
      if (pendingFocusedBackAppId === activeAppId) {
        clearPendingFocusedBackFallback();
        openFocusedDrawerAsBackFallback();
      }
    }, 900);
    return true;
  }

  function goBackInActiveFrame() {
    if (requestActiveFrameBack({ fallbackToDrawer: true })) {
      restoreFocusedHistorySentinel();
    }
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
    const consumerId = pendingIntentPrompt.consumerId;
    const batch = pendingIntentQueue.filter((p) => p.consumerId === consumerId);
    let nextGrants = intentGrants;
    for (const prompt of batch) {
      nextGrants = grantIntent(nextGrants, prompt.consumerId, prompt.intent);
      prompt.resolve(collectRowsForIntent(prompt.intent));
    }
    intentGrants = nextGrants;
    pendingIntentQueue = pendingIntentQueue.filter((p) => p.consumerId !== consumerId);
  }

  function denyIntentPrompt() {
    if (!pendingIntentPrompt) return;
    const consumerId = pendingIntentPrompt.consumerId;
    const batch = pendingIntentQueue.filter((p) => p.consumerId === consumerId);
    for (const prompt of batch) {
      prompt.resolve({
        provider: null,
        rows: [],
        reason: 'permission_denied',
      });
    }
    pendingIntentQueue = pendingIntentQueue.filter((p) => p.consumerId !== consumerId);
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
  /**
   * Wraps `commitTransferDrop` with a per-(source, target) pending chip
   * so the user gets a "Sending {kind}…" signal between the drag-drop
   * commit and the target's bridge ack. Cleared when the commit
   * resolves (or rejects).
   */
  function trackedCommitTransferDrop(
    sourceAppId: string,
    targetSlug: string,
    kind: string,
    payload: unknown,
  ): TransferCommitResult | Promise<TransferCommitResult> {
    // Resolve the target id once for the pending-key. If the target
    // can't be resolved, fall through — the underlying call will
    // return a synchronous failure result, and there's no pending UI
    // to display.
    const targetApp = apps.find((a) => a.slug === targetSlug && a.id !== sourceAppId);
    const targetId = targetApp?.id;
    if (targetId) markTransferPending(sourceAppId, targetId, kind);
    let result: TransferCommitResult | Promise<TransferCommitResult>;
    try {
      result = commitTransferDrop(sourceAppId, targetSlug, kind, payload);
    } catch (err) {
      if (targetId) clearTransferPending(sourceAppId, targetId);
      throw err;
    }
    if (result instanceof Promise) {
      return result.finally(() => {
        if (targetId) clearTransferPending(sourceAppId, targetId);
      });
    }
    if (targetId) clearTransferPending(sourceAppId, targetId);
    return result;
  }

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
    const nextRowsByApp = {
      ...rowsByApp,
      [appId]: [row, ...existing],
    };
    rowsByApp = nextRowsByApp;
    persistContainerState(nextRowsByApp);
    return row;
  }

  function queryRows(appId: string, payload: unknown) {
    return { rows: queryLocalDbRows(rowsByApp[appId] ?? [], payload).map(plainLocalRow) };
  }

  function plainLocalRow(row: LocalRow): LocalRow {
    return {
      id: row.id,
      table: row.table,
      payload: plainBridgeValue(row.payload),
      createdAt: row.createdAt,
    };
  }

  function plainBridgeValue(value: unknown): unknown {
    try {
      return structuredClone(value);
    } catch {
      try {
        return JSON.parse(JSON.stringify(value ?? null));
      } catch {
        return null;
      }
    }
  }

  function createTable(_appId: string, payload: unknown) {
    return { created: true as const, table: typeof payload === 'object' && payload !== null && 'table' in payload
      ? String((payload as Record<string, unknown>).table)
      : 'items' };
  }

  function updateRow(appId: string, payload: unknown) {
    const result = updateLocalDbRow(rowsByApp[appId] ?? [], payload);
    const nextRowsByApp = {
      ...rowsByApp,
      [appId]: result.rows,
    };
    rowsByApp = nextRowsByApp;
    persistContainerState(nextRowsByApp);
    return { updated: result.updated };
  }

  function deleteRow(appId: string, payload: unknown) {
    const result = deleteLocalDbRow(rowsByApp[appId] ?? [], payload);
    const nextRowsByApp = {
      ...rowsByApp,
      [appId]: result.rows,
    };
    rowsByApp = nextRowsByApp;
    persistContainerState(nextRowsByApp);
    return { deleted: result.deleted };
  }

  function storageUsage(appId: string) {
    return computeStorageUsage(rowsByApp[appId] ?? []);
  }

  function clearAppData(appId: string) {
    const nextRowsByApp = {
      ...rowsByApp,
      [appId]: [],
    };
    rowsByApp = nextRowsByApp;
    persistContainerState(nextRowsByApp);
  }

  function showPrivateRecoveryStatus(action: 'add-device' | 'move-phone' | 'recovery-card' | 'restore') {
    const messages = {
      'add-device': 'Add another device will use a one-time sealed handover. No raw keys get uploaded.',
      'move-phone': 'Move to new phone will copy your sealed access bundle, then let you choose whether to keep this phone active.',
      'recovery-card': 'Recovery cards are the paper fallback for browser storage wipes. Keep the card private: it can restore access.',
      restore: 'Restore accepts a transfer link, QR scan, or recovery card. Shippie relays sealed copies but cannot open them.',
    } satisfies Record<typeof action, string>;
    dataRecoveryStatus = messages[action];
  }

  async function openContainerYourData(
    action: 'add-device' | 'move-phone' | 'recovery-card' | 'restore',
    transferId?: string | null,
  ) {
    showPrivateRecoveryStatus(action);
    if (action === 'restore' && transferId) {
      setIncomingJoinTransferId(transferId);
    }
    const activeApp = activeAppId ? appById.get(activeAppId) : null;
    const appSlug = activeApp?.slug ?? 'container';
    try {
      const { openYourData } = await import('@shippie/sdk/wrapper');
      openYourData({
        appSlug,
        transferRelayOrigin: window.location.origin,
        initialTransferAction: action,
        accessTransferId: transferId ?? undefined,
      });
      if (action === 'restore' && !transferId && !readIncomingJoinTransferId()) {
        dataRecoveryStatus = 'Choose Restore data in the panel to paste a transfer link, scan a QR, or use a recovery card.';
      }
    } catch (err) {
      console.info('shippie:container Your Data overlay unavailable', err);
      dataRecoveryStatus = 'Your Data is available from each app’s Shippie menu. This container could not open the overlay.';
    }
  }

  function readIncomingJoinTransferId(): string | null {
    if (typeof window === 'undefined') return null;
    const url = new URL(window.location.href);
    const hash = url.hash.replace(/^#/, '');
    const hashParams = new URLSearchParams(hash);
    return transferIdFromJoinValue(
      hashParams.get('shippie-restore') ??
        url.searchParams.get('shippie-restore') ??
        url.searchParams.get('transfer') ??
        url.searchParams.get('code'),
    );
  }

  function transferIdFromJoinValue(value: string | null | undefined): string | null {
    const raw = value?.trim();
    if (!raw) return null;
    try {
      const url = new URL(raw);
      const hash = url.hash.replace(/^#/, '');
      const hashParams = new URLSearchParams(hash);
      const fromUrl =
        hashParams.get('shippie-restore') ??
        url.searchParams.get('shippie-restore') ??
        url.searchParams.get('transfer') ??
        url.searchParams.get('code');
      if (fromUrl) return transferIdFromJoinValue(fromUrl);
    } catch {
      // Raw transfer codes are expected.
    }
    const match = raw.match(/\btransfer_[A-Za-z0-9_-]{8,}\b/);
    return match ? (match[0] ?? null) : null;
  }

  function setIncomingJoinTransferId(transferId: string) {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.hash = `shippie-restore=${encodeURIComponent(transferId)}`;
    replaceState(url, window.history.state ?? {});
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
    void deleteImportedPackage(appId);
    persistContainerState(next.rowsByApp);
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
        summary: `Staying on saved ${receiptsByApp[appId]?.version ?? 'version'}`,
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

  async function importPackageFile(file: File) {
    packageImportStatus = '';
    try {
      if (file.name.toLowerCase().endsWith('.html') || file.name.toLowerCase().endsWith('.htm')) {
        const built = await buildSingleHtmlPackage(file);
        const app = await cacheBuiltPackage(built);
        packageImportStatus = `Imported ${app.name} on this device. Deploy with shippie deploy --private to use it elsewhere.`;
        return;
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const built = await readShippiePackageArchive(bytes);
      const app = await cacheBuiltPackage(built);
      packageImportStatus = `Imported and cached ${app.name} from ${file.name}.`;
    } catch (err) {
      packageImportStatus = err instanceof Error ? err.message : `Could not import ${file.name}.`;
    }
  }

  async function importSelectedFiles(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) await importPackageFile(file);
    input.value = '';
  }

  async function dropImportFile(event: DragEvent) {
    event.preventDefault();
    packageDropActive = false;
    const file = event.dataTransfer?.files?.[0];
    if (file) await importPackageFile(file);
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
      const app = await cacheBuiltPackage(built);
      packageImportStatus = `Imported and cached ${app.name} from a verified .shippie archive.`;
    } catch (err) {
      packageImportStatus = err instanceof Error ? err.message : 'Could not import package archive.';
    }
  }

  async function cacheBuiltPackage(
    built: Awaited<ReturnType<typeof readShippiePackageArchive>>,
    registryApp?: ContainerApp | null,
  ): Promise<ContainerApp> {
    const installed = installBuiltPackage(built);
    const app = registryApp ? mergeInstalledPackageApp(installed.app, registryApp) : installed.app;
    const packageFiles = installed.packageFiles;
    importedApps = [...importedApps.filter((existing) => existing.id !== app.id), app];
    packageFilesByApp = {
      ...packageFilesByApp,
      [app.id]: packageFiles,
    };
    void saveImportedPackage(app.id, packageFiles);
    openApp(app.id);
    return app;
  }

  function mergeInstalledPackageApp(installed: ContainerApp, registryApp: ContainerApp): ContainerApp {
    return {
      ...installed,
      description: registryApp.description || installed.description,
      labelKind: registryApp.labelKind,
      icon: registryApp.icon,
      accent: registryApp.accent,
      version: registryApp.version,
      standaloneUrl: registryApp.standaloneUrl,
      visibility: registryApp.visibility,
      owned: registryApp.owned,
      permissions: registryApp.permissions,
      trust: registryApp.trust,
      category: registryApp.category ?? installed.category,
      surface: registryApp.surface ?? installed.surface,
      devUrl: registryApp.devUrl ?? installed.devUrl,
    };
  }

  async function installPrivateJoinPackage(join: PrivateJoinData) {
    const registryApp = findRequestedApp(baseApps, join.appSlug);
    const appName = registryApp?.name ?? join.appName;
    privateJoinState = 'loading';
    privateJoinStatus = `Joining ${appName}...`;

    try {
      if (registryApp && packageFilesByApp[registryApp.id]) {
        openApp(registryApp.id);
        privateJoinState = 'ready';
        privateJoinStatus = `${registryApp.name} is ready on this device.`;
        await maybeOpenPrivateJoinRestore(join);
        return;
      }

      const response = await fetch(join.packageUrl, {
        headers: { Accept: 'application/vnd.shippie.package+json' },
      });
      if (!response.ok) {
        throw new Error(`Private package returned ${response.status}.`);
      }
      const built = await readShippiePackageArchive(new Uint8Array(await response.arrayBuffer()));
      if (built.packageHash !== join.packageHash) {
        throw new Error('Downloaded package hash does not match the invite.');
      }
      const app = await cacheBuiltPackage(built, registryApp);
      privateJoinState = 'ready';
      privateJoinStatus = `${app.name} is ready on this device.`;
      await maybeOpenPrivateJoinRestore(join);
    } catch (err) {
      if (registryApp) openApp(registryApp.id);
      privateJoinState = 'error';
      privateJoinStatus = err instanceof Error ? err.message : `Could not save ${appName}.`;
    }
  }

  async function maybeOpenPrivateJoinRestore(join: PrivateJoinData) {
    const transferId = join.transferId ?? readIncomingJoinTransferId();
    if (!transferId) return;
    setIncomingJoinTransferId(transferId);
    privateJoinStatus = 'Private tool ready. Waiting for sealed data access...';
    await openContainerYourData('restore', transferId);
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
      const app = await cacheBuiltPackage(built);
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

  async function trackAnalytics(appId: string, payload: unknown) {
    const app = appById.get(appId);
    if (!app) {
      return {
        accepted: false,
        mode: 'aggregate-only' as const,
        persisted: false,
        reason: 'analytics_unavailable' as const,
      };
    }
    const event = normalizeAnalyticsEvent(payload);
    if (!event) {
      return {
        accepted: false,
        mode: 'aggregate-only' as const,
        persisted: false,
        reason: 'invalid_event' as const,
      };
    }

    const result = await postWrapperAnalyticsViaRegistry(app.slug, event);
    if (result.reason === 'network_error') {
      return {
        accepted: false,
        mode: 'aggregate-only' as const,
        persisted: false,
        reason: 'network_error' as const,
      };
    }
    if (!result.accepted && !result.mirrored) {
      return {
        accepted: false,
        mode: 'aggregate-only' as const,
        persisted: false,
        reason: 'analytics_unavailable' as const,
      };
    }
    const body = (result.body ?? {}) as { ingested?: number; error?: string };
    return {
      accepted: result.accepted,
      mode: 'aggregate-only' as const,
      persisted: result.accepted,
      ingested: typeof body.ingested === 'number' ? body.ingested : undefined,
      reason: result.accepted ? undefined : analyticsFailureReason(body.error),
    };
  }

  function analyticsFailureReason(error: string | undefined) {
    if (error === 'unknown_app') return 'unknown_app' as const;
    if (error === 'rate_limited') return 'rate_limited' as const;
    return 'analytics_unavailable' as const;
  }

  function normalizeAnalyticsEvent(payload: unknown):
    | {
        event: string;
        props?: Record<string, unknown>;
        ts: number;
        session_id?: string;
      }
    | null {
    if (!payload || typeof payload !== 'object') return null;
    const record = payload as Record<string, unknown>;
    const event = record.event ?? record.event_name;
    if (typeof event !== 'string' || event.length === 0 || event.length > 128) return null;
    const props = record.props ?? record.properties;
    return {
      event,
      props: props && typeof props === 'object' && !Array.isArray(props)
        ? (props as Record<string, unknown>)
        : undefined,
      ts: typeof record.ts === 'number' ? record.ts : Date.now(),
      session_id: typeof record.session_id === 'string' ? record.session_id : undefined,
    };
  }

  $effect(() => {
    window.addEventListener('message', recordFromEvent);
    window.addEventListener('message', recordAppLifecycle);
    window.addEventListener('message', recordFrameNavigation);
    window.addEventListener('message', recordFrameNavigationBackResult);
    window.addEventListener('message', recordSafeEdgesDeclaration);
    return () => {
      window.removeEventListener('message', recordFromEvent);
      window.removeEventListener('message', recordAppLifecycle);
      window.removeEventListener('message', recordFrameNavigation);
      window.removeEventListener('message', recordFrameNavigationBackResult);
      window.removeEventListener('message', recordSafeEdgesDeclaration);
    };
  });

  /**
   * Receive `safe-edges.declareInputRegion` from an iframe and store
   * the declared ownership. The message must come from one of our
   * mounted iframes (origin-validated by matching event.source against
   * the frame map). Unknown sources are silently dropped — we don't
   * trust the message at face value because a malicious wrapped app
   * could try to suppress container chrome.
   */
  function recordSafeEdgesDeclaration(event: MessageEvent): void {
    const data = event.data as
      | { protocol?: string; appId?: string; capability?: string; method?: string; payload?: { owns?: unknown } }
      | null;
    if (!data || data.protocol !== 'shippie.bridge.v1') return;
    if (data.capability !== 'safe-edges' || data.method !== 'declareInputRegion') return;
    if (typeof data.appId !== 'string') return;
    const owns = data.payload?.owns;
    if (owns !== 'none' && owns !== 'bottom' && owns !== 'all') return;
    // Source validation: event.source should be the iframe's window.
    // We trust the appId only after confirming the source matches one
    // of our hosted frames.
    const knownAppIds = new Set(apps.map((a) => a.id));
    if (!knownAppIds.has(data.appId)) return;
    inputRegionByAppId = { ...inputRegionByAppId, [data.appId]: owns };
  }

  // Active app's declared region, used by the focused-shell template
  // to pick the right CSS class on the chrome buttons.
  const activeInputRegion: InputRegionOwns = $derived(
    activeAppId ? (inputRegionByAppId[activeAppId] ?? 'none') : 'none',
  );

  // Refresh the cross-app intent registry whenever the installed-apps
  // list changes. The registry owns provider/consumer indexing; the
  // bridge handlers consult it on every intent.consume call.
  $effect(() => {
    intentRegistry.refresh(apps);
    transferRegistry.refresh(apps);
  });

  function persistContainerState(nextRowsByApp: Record<string, LocalRow[]> = rowsByApp) {
    if (!storageReady) return;
    const state: ContainerState = {
      openAppIds,
      importedApps,
      packageFilesByApp,
      receiptsByApp,
      rowsByApp: nextRowsByApp,
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
  }

  async function hydrateImportedPackageFiles(appsToHydrate: readonly ContainerApp[]) {
    const missing = appsToHydrate.filter((app) => !packageFilesByApp[app.id]);
    if (missing.length === 0) return;
    const loadedEntries = await Promise.all(
      missing.map(async (app) => [app.id, await loadImportedPackage(app.id)] as const),
    );
    const loaded = Object.fromEntries(
      loadedEntries.filter((entry): entry is readonly [string, Record<string, PackageFileCache>] => Boolean(entry[1])),
    );
    if (Object.keys(loaded).length === 0) return;
    packageFilesByApp = { ...packageFilesByApp, ...loaded };
    persistContainerState(rowsByApp);
  }

  $effect(() => {
    if (!storageReady) return;
    persistContainerState(rowsByApp);
  });

  $effect(() => {
    if (!storageReady || privateJoinAttempted || !data.privateJoin) return;
    privateJoinAttempted = true;
    void installPrivateJoinPackage(data.privateJoin);
  });

  $effect(() => {
    if (!storageReady) return;
    const requestedSection = $page.url.searchParams.get('section');
    const routeKey = `${data.focused ? 'focused' : 'dashboard'}:${data.requestedAppSlug ?? ''}:${requestedSection ?? ''}`;
    applyRouteState(routeKey, requestedSection);
  });

  $effect(() => {
    if (data.focused || section !== 'data') return;
    if (pendingIntentQueue.length > 0 || pendingTransferQueue.length > 0) {
      dismissTransientPrompts();
    }
  });

  let lastAppliedRouteKey = $state('');

  function applyRouteState(routeKey: string, requestedSection: string | null) {
    if (routeKey === lastAppliedRouteKey) return;
    lastAppliedRouteKey = routeKey;

    if (data.focused) {
      const requestedApp = findRequestedApp(apps, data.requestedAppSlug);
      if (requestedApp) {
        notFoundSlug = null;
        if (activeAppId !== requestedApp.id) {
          openApp(requestedApp.id);
        }
      } else if (data.requestedAppSlug) {
        notFoundSlug = data.requestedAppSlug;
      }
      return;
    }

    closeFocusedDrawer();
    focusedToolOptionsOpen = false;
    notFoundSlug = null;
    if (
      requestedSection === 'home' ||
      requestedSection === 'create' ||
      requestedSection === 'data' ||
      requestedSection === 'access'
    ) {
      section = requestedSection;
      if (requestedSection !== 'home') {
        activeAppId = null;
      } else if (!activeAppId || !appById.has(activeAppId)) {
        activeAppId = openAppIds[0] ?? null;
      }
    } else if (!activeAppId || !appById.has(activeAppId)) {
      activeAppId = openAppIds[0] ?? null;
    }
  }

  onMount(() => {
    hydrateLauncherMemory();
    const stopCatalogSync = startCatalogSync({
      onUpdate: () => {
        prewarmLikelyNextApps();
      },
    });
    viewportWidth = window.innerWidth;
    const requestedApp = findRequestedApp(apps, data.requestedAppSlug);
    const saved = loadContainerState(localStorage);
    if (saved) {
      importedApps = saved.importedApps ?? [];
      packageFilesByApp = saved.packageFilesByApp ?? {};
      void hydrateImportedPackageFiles(importedApps);
      const knownAppIds = new Set(apps.map((app) => app.id));
      const savedOpenApps = saved.openAppIds.filter((appId) => knownAppIds.has(appId));
      openAppIds = data.focused
        ? (requestedApp ? [requestedApp.id] : [])
        : savedOpenApps.length > 0 ? savedOpenApps : defaultAppId ? [defaultAppId] : [];
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
    if (requestedApp) {
      if (activeAppId === requestedApp.id) {
        rememberAppLaunch(requestedApp);
        void trackAppOpen(requestedApp.id);
      }
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
    // the way out. Valid values: 'home' | 'create' | 'data' | 'access'.
    if (!data.focused) {
      const url = new URL(window.location.href);
      const requestedSection = url.searchParams.get('section');
      if (
        requestedSection === 'home' ||
        requestedSection === 'create' ||
        requestedSection === 'data' ||
        requestedSection === 'access'
      ) {
        section = requestedSection;
        if (requestedSection !== 'home') activeAppId = null;
      }
    }
    storageReady = true;
    prewarmLikelyNextApps();
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
        restoreFocusedHistorySentinel();
        window.addEventListener('popstate', handleFocusedPopstate);
      } catch {
        // history API blocked — leave the user with the pill exits.
      }

      // Origin-safe keyboard contract: child tools that include the SDK's
      // useKeyboard() helper post `shippie:tool-keyboard-open/close` when
      // their on-screen keyboard rises/falls. We adapt the focused chrome
      // (push the exit-pill out of the way) by setting CSS variables on
      // the root. 4-step validation per the plan:
      //   1. message type matches our namespace
      //   2. event.source matches the active app's iframe contentWindow
      //   3. event.origin matches the expected origin for the active app
      //   4. payload shape sanity
      // Without all four, drop the message silently.
      window.addEventListener('message', handleToolKeyboardMessage);
    }
    void loadCollection();
    return () => stopCatalogSync();
  });

  function expectedOriginForActiveApp(): string | null {
    const app = activeAppId ? appById.get(activeAppId) : null;
    if (!app) return null;
    // First-party showcases render under the platform origin via /run/<slug>/.
    // Maker subdomains have their own origin — derive from app.standaloneUrl
    // if present, else fall back to the current origin.
    if (app.standaloneUrl) {
      try {
        return new URL(app.standaloneUrl).origin;
      } catch {
        // fall through
      }
    }
    return window.location.origin;
  }

  function handleToolKeyboardMessage(event: MessageEvent) {
    const data = event.data as { type?: string; height?: number } | null;
    const type = data?.type;
    if (type !== 'shippie:tool-keyboard-open' && type !== 'shippie:tool-keyboard-close') return;

    // Resolve the active iframe's contentWindow. The container hosts iframes
    // via AppFrameHost; we don't have a direct map here, so we resolve via
    // the rendered DOM by app id.
    if (!activeAppId) return;
    const iframe = document.querySelector<HTMLIFrameElement>(
      `iframe[data-shippie-app-id="${activeAppId}"]`,
    );
    if (!iframe || event.source !== iframe.contentWindow) return;

    const expectedOrigin = expectedOriginForActiveApp();
    if (!expectedOrigin || event.origin !== expectedOrigin) return;

    const root = document.documentElement;
    if (type === 'shippie:tool-keyboard-open') {
      const height = typeof data?.height === 'number' && data.height >= 0 ? data.height : 0;
      root.style.setProperty('--keyboard-offset', `${height}px`);
      root.dataset.keyboardOpen = 'true';
      // One telemetry per (slug, session) so we don't spam on every focus.
      const slug = activeApp?.slug;
      try {
        const key = `shippie:track:kb:${slug ?? 'unknown'}`;
        if (slug && !sessionStorage.getItem(key)) {
          void import('$lib/util/track').then(({ track }) => track('keyboard_open_in_tool', { slug }));
          sessionStorage.setItem(key, '1');
        }
      } catch {
        // sessionStorage blocked — skip the telemetry to avoid spamming.
      }
    } else {
      root.style.removeProperty('--keyboard-offset');
      delete root.dataset.keyboardOpen;
    }
  }

  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('message', handleToolKeyboardMessage);
    }
  });

  function handleFocusedPopstate() {
    if (!data.focused) return;
    if (focusedToolOptionsOpen) {
      focusedToolOptionsOpen = false;
      restoreFocusedHistorySentinel();
      return;
    }
    if (focusedDrawerOpen) {
      closeFocusedDrawer();
      restoreFocusedHistorySentinel();
      return;
    }
    if (requestActiveFrameBack({ fallbackToDrawer: true })) {
      restoreFocusedHistorySentinel();
      return;
    }
    openFocusedDrawerAsBackFallback();
  }

  onDestroy(() => {
    for (const host of hosts.values()) host.dispose();
    hosts.clear();
    revokeAllPackageFrameSources(packageObjectUrls);
    aiClient.dispose();
    clearPendingFocusedBackFallback();
    if (typeof window !== 'undefined') {
      window.removeEventListener('popstate', handleFocusedPopstate);
    }
  });

  function srcdocFor(app: ContainerApp): string {
    return appPackageSrcdoc(app, packageFilesByApp[app.id], {
      spaceContext: currentSpaceContextFor(app),
    });
  }

  function frameSrcFor(app: ContainerApp): string | null {
    return createOrReusePackageFrameSource(app, packageFilesByApp[app.id], packageObjectUrls);
  }

  function runtimeSrcFor(app: ContainerApp): string | null {
    const currentUrl = typeof window === 'undefined' ? $page.url : new URL(window.location.href);
    const preferDevUrl = currentUrl.searchParams.get('dev_apps') === '1';
    if (!preferDevUrl && packageFilesByApp[app.id]) return null;
    const forwardedParams = data.focused && data.requestedAppSlug === app.slug
      ? focusedRuntimeParams(currentUrl.searchParams)
      : undefined;
    return resolveRuntimeSrc(app, currentUrl.hostname, { preferDevUrl, searchParams: forwardedParams });
  }

  /**
   * Trust Ledger egress visibility for an app.
   *
   * `full` — iframe runs on a Shippie-controlled runtime path
   *   (/__shippie-run/<slug>/ or /run/<slug>/), so the CSP + bridge
   *   gate can enforce egress accounting.
   *
   * `bridge-only` — iframe runs on an absolute external URL (custom
   *   domain or app subdomain), so the bridge can only observe what
   *   passes through it. Direct iframe fetches are not enumerable.
   *
   * See spec §9.3 and runtime-src.ts:34.
   */
  function ledgerEgressVisibilityFor(app: ContainerApp): 'full' | 'bridge-only' {
    const url = app.standaloneUrl;
    if (!url) return 'full';
    if (url.startsWith('/run/')) return 'full';
    if (/^https?:\/\//i.test(url)) return 'bridge-only';
    return 'full';
  }

  function focusedRuntimeParams(params: URLSearchParams): URLSearchParams {
    const forwarded = new URLSearchParams();
    params.forEach((value, key) => {
      if (
        key === 'dev_apps' ||
        key === 'focused' ||
        key === 'app' ||
        key === 'shippie_embed' ||
        key === 'join' ||
        key === 'transfer' ||
        key === 'code' ||
        key === 'shippie-restore'
      ) return;
      forwarded.append(key, value);
    });
    return forwarded;
  }

  function currentSpaceContextFor(app: ContainerApp): AppSpaceContext | null {
    const currentUrl = typeof window === 'undefined' ? $page.url : new URL(window.location.href);
    if (!data.focused || data.requestedAppSlug !== app.slug) return null;

    const fromSearch = spaceContextFromParams(currentUrl.searchParams, data.privateJoin ? 'private-join' : 'url');
    if (fromSearch) return fromSearch;

    if (
      data.privateJoin?.appSlug === app.slug &&
      (data.privateJoin.spaceId || data.privateJoin.role || data.privateJoin.joinToken)
    ) {
      return {
        spaceId: data.privateJoin.spaceId ?? `${app.slug}:${data.privateJoin.packageHash}`,
        role: data.privateJoin.role,
        joinToken: data.privateJoin.joinToken,
        source: 'private-join',
      };
    }
    return null;
  }

  function spaceContextFromParams(params: URLSearchParams, source: AppSpaceContext['source']): AppSpaceContext | null {
    const spaceId = params.get('space') ?? params.get('room');
    const role = params.get('role') ?? params.get('space_role');
    const joinToken = params.get('space_join') ?? params.get('join_token');
    if (!spaceId || !/^[A-Za-z0-9_-]{3,80}$/.test(spaceId)) return null;
    return {
      spaceId,
      role: role && /^[a-z][a-z0-9_-]{0,63}$/.test(role) ? role : null,
      joinToken: joinToken && /^[A-Za-z0-9_-]{3,120}$/.test(joinToken) ? joinToken : null,
      source,
    };
  }

</script>

<svelte:head>
  <title>Shippie</title>
  <meta
    name="description"
    content="Open your saved tools, manage local data, and keep Shippie apps ready on this device."
  />
</svelte:head>

<svelte:window onresize={() => (viewportWidth = window.innerWidth)} onkeydown={handleFocusedChromeKeydown} />

<IntentPromptModal
  prompt={pendingIntentBatch}
  onApprove={approveIntentPrompt}
  onDeny={denyIntentPrompt}
  queueIndex={intentQueueIndex}
  queueSize={pendingPromptQueueSize}
/>
<PushOptInToast />
<TransferPromptModal
  prompt={pendingTransferPrompt}
  onApprove={approvePendingTransfer}
  onDeny={declinePendingTransfer}
  queueIndex={transferQueueIndex}
  queueSize={pendingPromptQueueSize}
/>

{#if transferPending.size > 0 && transferPendingLabel}
  <!-- Pending transfer-drop chip — surfaces a "Sending {kind}…" signal
       between the source app firing the drop and the target's ack so
       the drag UI doesn't appear to hang while permissions resolve. -->
  <div class="transfer-pending-chip" role="status" aria-live="polite">
    <span class="transfer-pending-spinner" aria-hidden="true"></span>
    <span>{transferPendingLabel}</span>
  </div>
{/if}

{#if data.focused}
  <!--
    Focused mode — entered directly via /run/<slug>/ or via /container?app=&focused=1.
    Render the requested app full-bleed, no sidebar / topbar / tabs.
    The app-switcher gesture component sits as a fixed overlay; the
    drawer (when open) shows a compact app grid for instant switching.

    Bridge handlers + intent registry + texture engine + everything
    else stay wired exactly as in dashboard mode — they're orchestrated
    by the surrounding script block. Focused mode is a presentation
    branch, not a behaviour branch.
  -->
  <section class="focused-shell">
    <button
      type="button"
      class="focused-chrome-button focused-chrome-tools"
      class:first-run={firstRunHint}
      class:input-region-bottom={activeInputRegion === 'bottom'}
      class:input-region-all={activeInputRegion === 'all'}
      aria-label="Open Shippie tools and data"
      aria-expanded={focusedDrawerOpen}
      onclick={toggleFocusedDrawer}
    >
      <img
        src="/__shippie-pwa/icon.svg"
        alt=""
        width="22"
        height="22"
        aria-hidden="true"
      />
      <span class="focused-mark-letter" aria-hidden="true">S</span>
      <span class="sr-only">Shippie tools</span>
    </button>
    {#if activeApp}
      <button
        type="button"
        class="focused-chrome-button focused-chrome-options"
        class:input-region-all={activeInputRegion === 'all'}
        aria-label={`Share and options for ${activeApp.name}`}
        aria-expanded={focusedToolOptionsOpen}
        onclick={toggleFocusedToolOptions}
      >
        <span aria-hidden="true">↗</span>
        <span class="sr-only">Share and options</span>
      </button>
    {/if}
    <div class="focused-frame">
      {#if notFoundSlug}
        <div class="focused-not-found">
          <EmptyState
            title="We couldn't find that tool."
            body={`No tool found at /${notFoundSlug}. It may have been unpublished, made private, or the link is wrong.`}
            actionLabel="Browse tools"
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
    {#if privateJoinStatus}
      <div class="private-join-toast" data-state={privateJoinState} role="status">
        {privateJoinStatus}
      </div>
    {/if}
    <AppSwitcherGesture
      open={focusedDrawerOpen}
      onOpenChange={(value) => {
        if (!value) {
          closeFocusedDrawer();
          return;
        }
        focusedDrawerOpen = value;
      }}
      edge={focusedDrawerEdge}
      canGoBack={activeFrameCanGoBack}
      onBack={goBackInActiveFrame}
      gestureEnabled={false}
    >
      <div class="focused-drawer">
        <button
          type="button"
          class="focused-drawer-grip"
          data-drawer-drag-handle
          data-drawer-grip
          aria-label="Close Shippie tools"
          onclick={() => {
            closeFocusedDrawer();
          }}
        ></button>
        <header class="focused-drawer-head" data-drawer-drag-handle>
          <a class="focused-home" href="/workspace" aria-label="Shippie tools">
            <span class="focused-brand-copy">
              <strong>Shippie</strong>
              <small>Local tools, one home.</small>
            </span>
          </a>
          <nav class="focused-drawer-actions" aria-label="Drawer actions">
            <button class="focused-action" type="button" onclick={() => exitFocusedMode('home')}>Tools</button>
            <button class="focused-action focused-action-data" type="button" onclick={() => exitFocusedMode('data')}>Data</button>
            <button class="focused-action focused-action-close" type="button" aria-label="Close Shippie tools" onclick={() => {
              closeFocusedDrawer();
            }}>×</button>
          </nav>
        </header>
        {#snippet focusedToolTile(app: ContainerApp)}
          <ToolTile
            app={containerAppToToolTile(app)}
            density="drawer"
            pinned={drawerPinnedSet.has(app.slug)}
            runtimeState={drawerRuntimeStateFor(app)}
            onOpen={() => switchFocusedApp(app)}
            onTogglePin={() => toggleDrawerPin(app)}
          />
        {/snippet}

        {#if drawerSearchActive}
          <label class="focused-search" aria-label="Search tools">
            <span class="focused-search-icon" aria-hidden="true">⌕</span>
            <input
              type="search"
              autocomplete="off"
              spellcheck="false"
              placeholder="Search tools…"
              bind:value={drawerSearchQuery}
            />
            {#if drawerSearchQuery}
              <button
                type="button"
                class="focused-search-clear"
                aria-label="Clear search"
                onclick={() => (drawerSearchQuery = '')}
              >✕</button>
            {/if}
          </label>
        {/if}

        {#if drawerSearchTrim}
          {#if drawerSearchResults.length > 0}
            <div class="focused-section-head focused-search-results-head">
              <h2>Results</h2>
              <span>{drawerSearchResults.length}</span>
            </div>
            <div class="focused-grid focused-search-results">
              {#each drawerSearchResults as app (app.id)}
                {@render focusedToolTile(app)}
              {/each}
            </div>
          {:else}
            <p class="focused-search-empty">
              Nothing matches “{drawerSearchQuery}” yet.
              <button type="button" onclick={() => (drawerSearchQuery = '')}>Clear search</button>
            </p>
          {/if}
        {:else if drawerQuickAppsFiltered.length > 0}
          <div class="focused-section-head">
            <h2>Quick</h2>
            <span>{drawerQuickAppsFiltered.length}</span>
          </div>
          <div class="focused-grid">
            {#each drawerQuickAppsFiltered as app (app.id)}
              {@render focusedToolTile(app)}
            {/each}
          </div>
        {/if}

        {#if !drawerSearchTrim && drawerRemainingAppsFiltered.length > 0}
          <div class="focused-section-head">
            <h2>{drawerPersonalized ? 'Browse' : 'Tools'}</h2>
            <span>{drawerRemainingAppsFiltered.length}</span>
          </div>
          <div class="focused-grid">
            {#each drawerRemainingAppsFiltered as app (app.id)}
              {@render focusedToolTile(app)}
            {/each}
          </div>
        {/if}

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
    {#if focusedToolOptionsOpen && activeApp}
      <button
        type="button"
        class="focused-options-backdrop"
        aria-label="Close tool options"
        onclick={closeFocusedToolOptions}
      ></button>
      <aside class="focused-options-panel" aria-label={`${activeApp.name} sharing and options`}>
        <div class="focused-drawer-grip" aria-hidden="true"></div>
        <header class="focused-options-head">
          <p class="focused-options-kicker">Current tool</p>
          <h2>{activeApp.name}</h2>
          {#if activeApp.description}
            <p>{activeApp.description}</p>
          {/if}
        </header>
        {#if focusedQrMarkup}
          <div class="focused-share-qr" aria-label={`QR code for ${activeApp.name}`}>
            <div class="focused-share-qr-code">{@html focusedQrMarkup}</div>
            <p>Scan to open</p>
          </div>
        {/if}
        <div class="focused-options-list">
          <button type="button" class="focused-option-row primary" onclick={shareActiveTool}>
            <span>Share tool</span>
            <small>{focusedShareFeedback || 'System share sheet'}</small>
          </button>
          <button type="button" class="focused-option-row" onclick={copyActiveToolLink}>
            <span>Copy quicklink</span>
            <small>{focusedShareFeedback || activeToolUrl.replace(/^https?:\/\//, '')}</small>
          </button>
          <button
            type="button"
            class="focused-option-row"
            onclick={() => {
              if (activeAppId) reloadFrame(activeAppId);
              closeFocusedToolOptions();
            }}
          >
            <span>Reload tool</span>
            <small>Fresh frame, same local data</small>
          </button>
        </div>
      </aside>
    {/if}
  </section>
{:else}
<section class="shell">
  <aside class="sidebar">
    <div class="sidebar-intro">
      <p class="eyebrow">Shippie</p>
      <h1>Your tools, ready where you left them.</h1>
      <p class="lede">
        Open tools, keep them available offline, and manage the data they store
        on this device.
      </p>
    </div>

    <div class="status-panel">
      <span class="status" class:ready={bridgeStatus === 'ready'}>{bridgeStatus}</span>
      <p>{installedApps.length} saved tools · {totalRows} local records</p>
      <p>{Object.keys(receiptsByApp).length} saved versions · local data controls ready.</p>
    </div>

    <nav class="tabs" aria-label="Shippie sections">
      <button class:active={section === 'home'} onclick={() => showSection('home')}>Home</button>
      <button class:active={section === 'create'} onclick={() => showSection('create')}>Create</button>
      <button class:active={section === 'data'} onclick={() => showSection('data')}>
        <span class="desktop-label">Your Data</span>
        <span class="mobile-label">Data</span>
      </button>
      <button class:active={section === 'access'} onclick={() => showSection('access')}>Access</button>
    </nav>
  </aside>

  <main class="workspace">
    <div class="topbar" class:section-mode={!activeApp}>
      <button class="home-button" onclick={goHome}>Home</button>
      <div>
        <p class="mini-label">Open in Shippie</p>
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
        <a href={standaloneHref} target="_blank" rel="noopener" class="open-link" data-sveltekit-preload-data="off">Open in new tab</a>
      {/if}
    </div>

    {#if !activeApp}
      <section class="panel">
        {#if section === 'home'}
          <DashboardHome
            insights={agentInsights}
            apps={launchVisibleApps}
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
              <h3>Add tools</h3>
              <p>Load a collection, import a package, or ship something new.</p>
            </div>
            <div class="collection-actions">
              <input
                id="collection-url"
                name="collection-url"
                bind:value={collectionUrl}
                placeholder="/api/collections/official"
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
            <h2>Ship</h2>
            <p>Start from a deploy, a remix, or a builder workflow.</p>
          </div>
          <div class="action-grid">
            <a href="/new">Deploy app</a>
            <button>Remix template</button>
            <button>Connect Claude Code</button>
          </div>
          <div class="backup-box">
            <div>
              <h3>Import package</h3>
              <p>Drop HTML or a portable .shippie archive to keep it on this device.</p>
            </div>
            <label
              class="dropzone"
              class:active={packageDropActive}
              ondragover={(event) => {
                event.preventDefault();
                packageDropActive = true;
              }}
              ondragleave={() => (packageDropActive = false)}
              ondrop={dropImportFile}
            >
              <input type="file" accept=".html,.htm,.shippie,application/json" onchange={importSelectedFiles} />
              <span>Choose or drop HTML / .shippie</span>
            </label>
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
        {:else if section === 'access'}
          <AccessPane
            flows={observationFlows}
            onRevoke={(consumerId, intent) => {
              intentGrants = revokeIntent(intentGrants, consumerId, intent);
            }}
          />
        {:else}
          <YourDataTab
            installedAppsCount={installedApps.length}
            {totalRows}
            triggerAppName={yourDataOpenForApp ? (appById.get(yourDataOpenForApp)?.name ?? null) : null}
            onDismissTrigger={() => yourDataHost.close()}
            onRecoveryAction={(action) => openContainerYourData(action)}
            recoveryStatus={dataRecoveryStatus}
            {installedApps}
            {receiptsByApp}
            {rowsByApp}
            {recoveredReceipts}
            onOpenApp={openApp}
            onClearData={clearAppData}
            onUninstall={uninstallApp}
            onImportPackageForReceipt={importPackageForReceipt}
            onForgetRecoveredReceipt={forgetRecoveredReceipt}
            onExportReceipts={exportReceipts}
            {receiptExport}
            {dataTrustLine}
            bind:backupPassphrase
            {backupError}
            {backupExport}
            onCreateBackup={createEncryptedBackup}
            bind:restorePayload
            bind:restorePassphrase
            {restoreStatus}
            onRestore={restoreEncryptedBackup}
          />
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
  </main>
</section>
{/if}

<style>
  .shell {
    /* dvh cascade — see +layout.svelte for rationale. */
    min-height: calc(100svh - var(--nav-height));
    min-height: calc(100dvh - var(--nav-height));
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
  .section-head p {
    color: var(--text-secondary);
    line-height: 1.55;
  }
  .status-panel,
  .panel {
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
  .mobile-label {
    display: none;
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
    width: var(--touch-min);
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
  .collection-list {
    display: grid;
    gap: 8px;
  }
  .dropzone {
    min-height: 92px;
    border: 1px dashed var(--border);
    background: var(--surface);
    display: grid;
    place-items: center;
    padding: var(--space-md);
    color: var(--text-secondary);
    font-family: var(--font-mono);
    font-size: var(--small-size);
    cursor: pointer;
  }
  .dropzone.active,
  .dropzone:hover {
    border-color: var(--sunset);
    color: var(--text);
  }
  .dropzone input {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    opacity: 0;
    pointer-events: none;
  }
  .collection-list article {
    padding: var(--space-md);
    display: flex;
    align-items: center;
    gap: var(--space-md);
    justify-content: space-between;
    border: 1px solid var(--border-light);
    border-radius: 0;
    background: var(--bg-pure);
  }
  .collection-list article > div {
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
  .export-button {
    padding: 0.55rem 0.75rem;
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
  @media (max-width: 1024px) {
    .shell {
      grid-template-columns: 1fr;
    }
    .sidebar {
      border-right: 0;
      border-bottom: 1px solid var(--border-light);
      padding: var(--space-xl);
    }
    .topbar {
      align-items: flex-start;
      flex-direction: column;
    }
  }

  @media (max-width: 640px) {
    .shell {
      min-height: 100svh;
      min-height: 100dvh;
      display: block;
      border-top: 0;
      padding-bottom: calc(96px + var(--safe-bottom));
    }
    .sidebar {
      position: sticky;
      top: var(--safe-top);
      z-index: 20;
      padding: 8px calc(12px + var(--safe-right)) 8px calc(12px + var(--safe-left));
      border-right: 0;
      border-bottom: 1px solid rgba(237, 228, 211, 0.12);
      background: rgba(20, 18, 15, 0.9);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
    }
    .sidebar-intro,
    .status-panel {
      display: none;
    }
    .tabs {
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 1px;
      border: 1px solid var(--border-light);
      background: var(--border-light);
    }
    .tabs button {
      min-height: var(--touch-min);
      padding: 0 6px;
      display: grid;
      place-items: center;
      overflow: hidden;
      background: var(--bg);
      text-align: center;
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--text-secondary);
      white-space: nowrap;
    }
    .tabs button.active {
      background: var(--text);
      color: var(--bg-pure);
      border-color: var(--text);
    }
    .desktop-label {
      display: none;
    }
    .mobile-label {
      display: inline;
    }
    .workspace {
      padding: var(--space-md) calc(18px + var(--safe-right)) var(--space-md) calc(18px + var(--safe-left));
      gap: var(--space-md);
    }
    .topbar.section-mode {
      display: none;
    }
    .topbar {
      min-height: var(--touch-min);
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
    }
    .topbar .mini-label,
    .home-button {
      display: none;
    }
    .topbar h2 {
      font-size: 1.15rem;
    }
    .open-link,
    .mesh-badge {
      min-height: var(--touch-min);
    }
    .panel {
      padding: 0;
      border: 0;
      background: transparent;
      gap: var(--space-lg);
    }
    .collection-panel,
    .backup-box {
      padding: var(--space-md);
      background: var(--surface);
    }
    .collection-actions {
      grid-template-columns: 1fr;
    }
    .collection-actions input,
    .collection-list button,
    .export-button {
      min-height: var(--touch-min);
      font-size: var(--type-body-mobile);
    }
    .action-grid {
      grid-template-columns: 1fr;
      gap: 8px;
    }
    .action-grid a,
    .action-grid button {
      min-height: var(--touch-min);
      align-content: center;
    }
    .viewport-area {
      min-height: calc(100svh - 156px);
      min-height: calc(100dvh - 156px);
    }
    .inspector {
      display: none;
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
    font-size: var(--type-body-mobile);
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

  /* Unification plan — focused mode. /run/<slug>/ and /container?app=
     &focused=1 land here. Full-bleed app + invisible chrome. The
     AppSwitcherGesture component owns its own overlays; this just
     sets up the iframe stage. */
  .focused-shell {
    position: fixed;
    inset: 0;
    z-index: 1000;
    background: var(--bg-pure, #fff);
  }
  .focused-frame {
    position: fixed;
    inset: 0;
    /* Stop pull-to-refresh inside a running tool from reloading the
       Shippie shell. Containment also prevents iOS rubber-band-bounce
       from exposing the cream drawer behind the running iframe. */
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
  }
  .focused-frame :global(.frame-stage) {
    position: fixed;
    inset: 0;
    overscroll-behavior: contain;
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
  .private-join-toast {
    position: fixed;
    left: 50%;
    bottom: max(18px, env(safe-area-inset-bottom));
    transform: translateX(-50%);
    z-index: 1015;
    max-width: min(520px, calc(100vw - 28px));
    padding: 10px 14px;
    border: 1px solid rgba(20, 18, 15, 0.14);
    background: rgba(255, 253, 247, 0.94);
    color: var(--bg);
    box-shadow: 0 14px 34px rgba(20, 18, 15, 0.16);
    font-size: 13px;
    line-height: 1.35;
    text-align: center;
    overflow-wrap: anywhere;
    backdrop-filter: blur(10px);
  }
  .private-join-toast[data-state='ready'] {
    border-color: rgba(62, 125, 77, 0.32);
  }
  .private-join-toast[data-state='error'] {
    border-color: rgba(178, 58, 43, 0.34);
    color: var(--danger-hover);
  }

  .sr-only {
    position: fixed;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  /* Thin focused-mode chrome. Shippie owns two small marks only:
     tools/data on the left, current-tool share/options on the right.
     No hidden hit-zones are active in focused mode, so app builders
     keep their own headers, nav, inputs, swipes, and edge targets. */
  .focused-chrome-button {
    position: fixed;
    top: 50%;
    z-index: 62;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--touch-min);
    height: 46px;
    padding: 0;
    background: rgba(20, 18, 15, 0.65);
    border: 1px solid rgba(168, 196, 145, 0.35);
    color: var(--text);
    font-family: var(--font-mono);
    font-weight: 700;
    font-size: 18px;
    line-height: 1;
    letter-spacing: 0;
    text-decoration: none;
    cursor: pointer;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    opacity: 0.42;
    transform: translateY(-50%);
    box-shadow: 0 8px 28px rgba(20, 18, 15, 0.16);
    transition:
      opacity 0.18s ease,
      background 0.18s ease,
      border-color 0.18s ease,
      box-shadow 0.18s ease,
      transform 0.18s ease;
  }
  .focused-chrome-tools {
    left: calc(env(safe-area-inset-left, 0px) - 12px);
    border-left: 0;
    border-radius: 0 16px 16px 0;
  }
  .focused-chrome-options {
    right: calc(env(safe-area-inset-right, 0px) - 12px);
    border-right: 0;
    border-radius: 16px 0 0 16px;
  }
  /* Safe-edges contract: when the active app declares it owns the
     bottom or the entire viewport via @shippie/iframe-sdk
     `safeEdges.declareInputRegion()`, compact the chrome buttons so
     their hit area stays at the edge of game controls. Keep them
     visibly identifiable, though: a too-thin sliver reads as "missing"
     in launch games like Snake and prevents people finding share/data.

     'bottom' suppresses just the left tools pill (the one that
     overlaps Stack's leftmost touch button). 'all' shrinks both. */
  .focused-chrome-button.input-region-bottom.focused-chrome-tools,
  .focused-chrome-button.input-region-all {
    width: var(--touch-min);
    opacity: 0.82;
    background: rgba(20, 18, 15, 0.74);
  }
  .focused-chrome-tools.input-region-bottom,
  .focused-chrome-tools.input-region-all {
    left: calc(env(safe-area-inset-left, 0px) - 2px);
  }
  .focused-chrome-options.input-region-all {
    right: calc(env(safe-area-inset-right, 0px) - 2px);
  }
  .focused-chrome-button.input-region-bottom.focused-chrome-tools:hover,
  .focused-chrome-button.input-region-bottom.focused-chrome-tools:focus-visible,
  .focused-chrome-button.input-region-all:hover,
  .focused-chrome-button.input-region-all:focus-visible {
    width: var(--touch-min);
    opacity: 1;
  }

  .focused-chrome-button.first-run {
    animation: shippie-mark-pulse 1.4s cubic-bezier(0.22, 1, 0.36, 1) 0.4s 1 both;
  }
  @keyframes shippie-mark-pulse {
    0%   { box-shadow: 0 0 0 0 rgba(232, 96, 60, 0.55); opacity: 0.42; }
    35%  { box-shadow: 0 0 0 6px rgba(232, 96, 60, 0.30); opacity: 1; }
    70%  { box-shadow: 0 0 0 14px rgba(232, 96, 60, 0); opacity: 1; }
    100% { box-shadow: 0 0 0 0 rgba(232, 96, 60, 0); opacity: 0.42; }
  }
  @media (prefers-reduced-motion: reduce) {
    .focused-chrome-button.first-run { animation: none; }
  }
  /* Keyboard open inside the running tool — hide the chrome so it
     doesn't float over the keyboard area. The :global selector matches
     the data attribute set on <html> by handleToolKeyboardMessage. */
  :global(html[data-keyboard-open="true"]) .focused-chrome-button {
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.18s ease, transform 0.18s ease;
  }
  :global(html[data-keyboard-open="true"]) .focused-chrome-tools {
    transform: translateY(-50%) translateX(-100%);
  }
  :global(html[data-keyboard-open="true"]) .focused-chrome-options {
    transform: translateY(-50%) translateX(100%);
  }
  .focused-chrome-button:hover,
  .focused-chrome-button:focus-visible,
  .focused-chrome-button[aria-expanded='true'] {
    opacity: 1;
    background: rgba(20, 18, 15, 0.85);
    border-color: var(--sage-leaf);
  }
  .focused-chrome-tools:hover,
  .focused-chrome-tools:focus-visible,
  .focused-chrome-tools[aria-expanded='true'] {
    transform: translateY(-50%) translateX(18px);
  }
  .focused-chrome-options:hover,
  .focused-chrome-options:focus-visible,
  .focused-chrome-options[aria-expanded='true'] {
    transform: translateY(-50%) translateX(-18px);
  }
  .focused-chrome-button img {
    display: block;
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    object-fit: contain;
  }
  .focused-mark-letter {
    display: none;
    color: var(--paper-warm);
    font-family: var(--font-heading);
    font-size: 18px;
    font-weight: 700;
    line-height: 1;
  }
  .focused-chrome-tools.input-region-bottom img,
  .focused-chrome-tools.input-region-all img {
    display: none;
  }
  .focused-chrome-tools.input-region-bottom .focused-mark-letter,
  .focused-chrome-tools.input-region-all .focused-mark-letter {
    display: block;
  }
  @media (max-width: 640px) {
    .focused-chrome-button {
      width: var(--touch-min);
      height: 48px;
      background: rgba(20, 18, 15, 0.82);
      box-shadow: 0 6px 18px rgba(20, 18, 15, 0.14);
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
    }
    .focused-chrome-tools {
      left: calc(env(safe-area-inset-left, 0px) - 10px);
      border-radius: 0 18px 18px 0;
    }
    .focused-chrome-options {
      right: calc(env(safe-area-inset-right, 0px) - 10px);
      border-radius: 18px 0 0 18px;
    }
    .focused-chrome-tools.input-region-bottom,
    .focused-chrome-tools.input-region-all {
      left: calc(env(safe-area-inset-left, 0px) - 2px);
    }
    .focused-chrome-options.input-region-all {
      right: calc(env(safe-area-inset-right, 0px) - 2px);
    }
  }

  .focused-options-backdrop {
    position: fixed;
    inset: 0;
    z-index: 58;
    padding: 0;
    border: 0;
    background: rgba(20, 18, 15, 0.28);
    cursor: default;
    animation: focused-fade-in 160ms var(--ease-out);
  }
  .focused-options-panel {
    position: fixed;
    top: 50%;
    right: calc(env(safe-area-inset-right, 0px) + 48px);
    z-index: 64;
    width: min(340px, calc(100vw - 24px));
    max-height: min(80dvh, 620px);
    overflow-y: auto;
    padding: 16px;
    border: 1px solid var(--cream-border, rgba(0, 0, 0, 0.1));
    background: var(--cream-bg, #faf7ef);
    color: var(--cream-text, #14120f);
    box-shadow: 0 18px 54px rgba(20, 18, 15, 0.24);
    transform: translateY(-50%);
    animation: focused-options-in 180ms var(--spring);
  }
  .focused-options-head {
    display: grid;
    gap: 6px;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--cream-border, rgba(0, 0, 0, 0.1));
  }
  .focused-options-kicker,
  .focused-options-head p,
  .focused-option-row small {
    margin: 0;
    color: var(--cream-secondary, rgba(0, 0, 0, 0.55));
  }
  .focused-options-kicker {
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.16em;
    line-height: 1;
    text-transform: uppercase;
  }
  .focused-options-head h2 {
    margin: 0;
    font-family: var(--font-heading);
    font-size: 28px;
    line-height: 1;
  }
  .focused-options-head p {
    font-size: 15px;
    line-height: 1.35;
  }
  .focused-options-list {
    display: grid;
    gap: 8px;
    padding-top: 12px;
  }
  .focused-share-qr {
    display: grid;
    grid-template-columns: 88px minmax(0, 1fr);
    align-items: center;
    gap: 12px;
    padding: 12px 0 0;
  }
  .focused-share-qr-code {
    width: 88px;
    height: 88px;
    padding: 6px;
    border: 1px solid var(--cream-border, rgba(0, 0, 0, 0.1));
    background: var(--paper-warm);
  }
  .focused-share-qr-code :global(svg) {
    display: block;
    width: 100%;
    height: 100%;
  }
  .focused-share-qr p {
    margin: 0;
    color: var(--cream-secondary, rgba(0, 0, 0, 0.55));
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.12em;
    line-height: 1.35;
    text-transform: uppercase;
  }
  .focused-option-row {
    display: grid;
    gap: 4px;
    width: 100%;
    min-width: 0;
    padding: 12px;
    border: 1px solid var(--cream-border, rgba(0, 0, 0, 0.1));
    background: rgba(20, 18, 15, 0.025);
    color: inherit;
    text-align: left;
    cursor: pointer;
    transition: border-color 150ms ease, background 150ms ease, transform 150ms ease;
  }
  .focused-option-row:hover,
  .focused-option-row:focus-visible {
    border-color: var(--sunset, #e8603c);
    background: rgba(232, 96, 60, 0.07);
    transform: translateX(-2px);
  }
  .focused-option-row.primary {
    border-color: rgba(232, 96, 60, 0.34);
    background: rgba(232, 96, 60, 0.09);
  }
  .focused-option-row span {
    font-family: var(--font-heading);
    font-size: 18px;
    line-height: 1.05;
  }
  .focused-option-row small {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.03em;
    line-height: 1.2;
  }
  @media (max-width: 640px) {
    .focused-options-panel {
      top: auto;
      right: 0;
      bottom: max(16px, env(safe-area-inset-bottom, 0px));
      left: 0;
      width: auto;
      max-height: calc(100dvh - max(16px, env(safe-area-inset-bottom, 0px)) - 16px);
      padding: 10px 16px 16px;
      border-right: 0;
      border-left: 0;
      transform: none;
      animation: focused-options-sheet-in 180ms var(--spring);
    }
  }

  .focused-drawer {
    padding: calc(env(safe-area-inset-top, 0px) + 14px) 14px calc(env(safe-area-inset-bottom, 0px) + 14px);
    display: flex;
    flex-direction: column;
    gap: 12px;
    color: var(--cream-text, #14120f);
  }
  .focused-drawer-grip {
    display: none;
    position: relative;
    align-self: center;
    width: 44px;
    height: 24px;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: grab;
  }
  .focused-drawer-grip::before {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    top: 10px;
    height: 3px;
    background: color-mix(in srgb, var(--cream-secondary, rgba(0, 0, 0, 0.45)) 44%, transparent);
  }
  .focused-drawer-head {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 14px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--cream-border, rgba(0, 0, 0, 0.08));
    background: var(--cream-bg, #faf7ef);
  }
  .focused-home {
    display: inline-flex;
    align-items: center;
    min-width: 0;
    gap: 10px;
    color: inherit;
    text-decoration: none;
  }
  .focused-brand-copy {
    display: grid;
    min-width: 0;
    gap: 1px;
  }
  .focused-brand-copy strong {
    font-family: var(--font-heading);
    font-size: 22px;
    line-height: 1;
  }
  .focused-brand-copy small {
    color: var(--cream-secondary, rgba(0, 0, 0, 0.55));
    font-size: 12px;
    line-height: 1.25;
    white-space: nowrap;
  }
  .focused-drawer-actions {
    display: inline-flex;
    flex-shrink: 0;
    border: 1px solid var(--cream-border, rgba(0, 0, 0, 0.1));
  }
  .focused-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 34px;
    padding: 0 11px;
    border: 0;
    background: transparent;
    color: var(--cream-secondary, rgba(0, 0, 0, 0.58));
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.14em;
    line-height: 1;
    text-transform: uppercase;
    text-decoration: none;
    cursor: pointer;
    transition: color 150ms ease, background 150ms ease;
  }
  .focused-action + .focused-action {
    border-left: 1px solid var(--cream-border, rgba(0, 0, 0, 0.1));
  }
  .focused-action:hover,
  .focused-action:focus-visible {
    color: var(--cream-text, #14120f);
    background: rgba(20, 18, 15, 0.04);
  }
  .focused-action-data {
    color: var(--sunset, #e8603c);
  }
  .focused-action-close {
    min-width: 34px;
    padding: 0 10px;
    font-size: 16px;
    letter-spacing: 0;
  }
  .focused-action-close:hover,
  .focused-action-close:focus-visible {
    color: var(--sunset, #e8603c);
  }
  .focused-section-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }
  .focused-section-head h2,
  .focused-drawer h2 {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--cream-secondary, rgba(0, 0, 0, 0.55));
    text-transform: uppercase;
    letter-spacing: 0.14em;
    font-family: var(--font-mono);
  }
  .focused-section-head span {
    color: var(--cream-secondary, rgba(0, 0, 0, 0.45));
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
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
    background: var(--cream-bg, rgba(255, 255, 255, 0.85));
    border: 1px solid var(--cream-border, rgba(0, 0, 0, 0.08));
    border-radius: 12px;
    padding: 12px 14px;
  }
  .focused-insight strong {
    display: block;
    font-size: 14px;
  }
  .focused-insight p {
    margin: 4px 0 0;
    color: var(--cream-secondary, rgba(0, 0, 0, 0.55));
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
    grid-template-columns: 1fr;
    gap: 2px;
    margin-bottom: 6px;
  }
  /* Use the canonical 1025px shell breakpoint (mobile-first floor of
     mobile-audit/audit-static-rules.mjs). The drawer is full-width on
     phone + tablet, two-column only on real laptop widths. */
  @media (min-width: 1025px) {
    .focused-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 4px;
    }
  }
  .focused-search {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    margin: 0 0 12px;
    background: rgba(0, 0, 0, 0.03);
    border: 1px solid var(--cream-border, rgba(0, 0, 0, 0.08));
  }
  .focused-search-results-head {
    margin-top: -4px;
  }
  .focused-search-results {
    padding-bottom: 18px;
  }
  .focused-search:focus-within {
    border-color: var(--sunset, #e8603c);
    background: rgba(232, 96, 60, 0.04);
  }
  .focused-search-icon {
    color: var(--cream-secondary, rgba(0, 0, 0, 0.48));
    font-size: 16px;
    line-height: 1;
  }
  .focused-search input {
    min-width: 0;
    background: transparent;
    border: 0;
    padding: 6px 0;
    color: inherit;
    font: inherit;
    /* Per tokens.css --type-body-mobile: iOS Safari zooms inputs whose
       font-size is under 16px on focus. Keeping it at the floor avoids
       the bounce when the drawer search opens. */
    font-size: var(--type-body-mobile, 16px);
  }
  .focused-search input:focus {
    outline: none;
  }
  .focused-search-clear {
    background: transparent;
    border: 0;
    padding: 4px 6px;
    color: var(--cream-secondary, rgba(0, 0, 0, 0.5));
    font-family: var(--font-mono);
    font-size: 11px;
    cursor: pointer;
    line-height: 1;
  }
  .focused-search-clear:hover { color: var(--sunset, #e8603c); }
  .focused-search-empty {
    margin: 6px 0;
    padding: 12px;
    color: var(--cream-secondary, rgba(0, 0, 0, 0.55));
    font-size: 13px;
    text-align: center;
  }
  .focused-search-empty button {
    margin-left: 6px;
    background: transparent;
    border: 0;
    padding: 0;
    color: var(--sunset, #e8603c);
    cursor: pointer;
    font: inherit;
    text-decoration: underline;
  }

  @keyframes focused-fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes focused-options-in {
    from { opacity: 0; transform: translateY(-50%) translateX(12px); }
    to { opacity: 1; transform: translateY(-50%); }
  }
  @keyframes focused-options-sheet-in {
    from { opacity: 0; transform: translateY(16px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @media (max-width: 640px) {
    .focused-drawer {
      padding: 10px 12px calc(env(safe-area-inset-bottom, 0px) + 14px);
      gap: 10px;
    }
    .focused-drawer-grip {
      display: block;
      touch-action: none;
    }
    .focused-drawer-head {
      gap: 10px;
      padding-bottom: 10px;
      touch-action: none;
    }
    .focused-brand-copy strong {
      font-size: 20px;
    }
    .focused-brand-copy small {
      font-size: 11px;
    }
    .focused-action {
      min-height: 32px;
      padding: 0 9px;
      font-size: 10px;
    }
    .focused-action-close {
      min-width: 32px;
      font-size: 16px;
    }
    .focused-section-head {
      gap: 8px;
    }
    .focused-grid {
      grid-template-columns: 1fr;
      gap: 2px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .focused-options-backdrop,
    .focused-options-panel {
      animation: none;
    }
  }

  /* Transfer-pending chip — small bottom-pinned status surface that
     fires for the duration of an in-flight transfer-drop commit so the
     source app's drag UI has a visible "we heard you" cue while the
     permission prompt and target ack resolve. */
  .transfer-pending-chip {
    position: fixed;
    left: 50%;
    bottom: max(18px, calc(env(safe-area-inset-bottom) + 12px));
    transform: translateX(-50%);
    z-index: 1010;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    border: 1px solid rgba(20, 18, 15, 0.14);
    background: rgba(255, 253, 247, 0.94);
    color: var(--bg);
    box-shadow: 0 12px 28px rgba(20, 18, 15, 0.14);
    font-size: 12.5px;
    line-height: 1.3;
    backdrop-filter: blur(10px);
    pointer-events: none;
  }
  .transfer-pending-spinner {
    width: 12px;
    height: 12px;
    border: 2px solid rgba(20, 18, 15, 0.18);
    border-top-color: rgba(20, 18, 15, 0.6);
    border-radius: 50%;
    animation: transfer-pending-spin 720ms linear infinite;
  }
  @keyframes transfer-pending-spin {
    to { transform: rotate(360deg); }
  }
  @media (prefers-reduced-motion: reduce) {
    .transfer-pending-spinner { animation: none; }
  }
</style>
