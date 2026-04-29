/**
 * Container bridge — handler factory.
 *
 * Builds the per-app `handlers` map passed to `ContainerBridgeHost`. The
 * factory accepts mutators (insertRow, queryRows, storageUsage) so the
 * Svelte component can keep its `$state` reactive while the handler
 * shapes live in pure code.
 *
 * Phase A1 keeps the existing capability surface: app.info, db.insert,
 * db.query, storage.getUsage, feedback.open, analytics.track. Future
 * phases attach more capabilities here without touching the .svelte file:
 *   A2  → intent.provide / intent.consume   ✅ landed
 *   A5  → data.openPanel                    ✅ landed
 *   B4  → feel.texture                      ✅ landed
 *   B1  → ai.run                            ✅ landed
 */

import type { BridgeHandler } from '@shippie/container-bridge';
import { readPayloadTable, type ContainerApp, type LocalRow } from './state';
import type { IntentRegistration } from './intent-registry';
import type { AiRunRequest, AiRunResult, AiTask } from './ai-worker-client';
import type { Insight } from '@shippie/agent';

/**
 * Public surface of `apps.list` — the subset of ContainerApp visible
 * to a calling iframe. Slug + name + intents + label only; never the
 * package hash, the maker id, or other identity-leaking fields.
 */
export interface AppsListEntry {
  slug: string;
  name: string;
  shortName: string;
  description: string;
  labelKind: ContainerApp['labelKind'];
  provides: readonly string[];
  consumes: readonly string[];
}

export interface IntentRequestResult {
  /** Where the data came from. Empty when no provider matched or permission denied. */
  provider: { appId: string; appSlug: string; appName: string } | null;
  /** Rows the provider exposes for this intent. */
  rows: LocalRow[];
  /** Set when no provider matched, permission denied, or grant pending. */
  reason?: 'no_provider' | 'permission_denied' | 'permission_not_yet_granted';
}

/**
 * Public surface of a `data.transferDrop` acceptor — what a source
 * iframe sees when the container responds to `transferDrop.starting`.
 * Only what's needed to render a drop overlay; never internal app ids.
 */
export interface TransferAcceptor {
  slug: string;
  name: string;
  kinds: readonly string[];
}

/**
 * Result of starting a transfer. Source iframe uses `acceptors` to
 * decide whether to show a drop indicator; if empty there's nowhere
 * eligible to drop.
 */
export interface TransferStartResult {
  kind: string;
  acceptors: TransferAcceptor[];
}

/**
 * Result of committing a transfer to a specific target. Mirrors the
 * intent-grant flow: when the user hasn't yet granted source→target
 * delivery, the container queues a prompt and returns
 * `permission_not_yet_granted` so the source iframe can show a "Pending
 * confirmation" hint.
 */
export interface TransferCommitResult {
  delivered: boolean;
  target: { slug: string; name: string } | null;
  reason?:
    | 'no_target'
    | 'kind_not_accepted'
    | 'permission_not_yet_granted'
    | 'permission_denied';
}

export interface AppHandlerContext {
  appId: string;
  app: ContainerApp;
  /**
   * Insert a row into the app's local namespace. Returns the row that
   * was written (with id + createdAt). The Svelte component supplies
   * this; the factory stays pure.
   */
  insertRow: (appId: string, payload: unknown) => LocalRow;
  /**
   * Read the app's namespace, optionally filtered by `payload.table`.
   */
  queryRows: (appId: string, payload: unknown) => { rows: LocalRow[] };
  /**
   * Coarse storage-usage reporter for the Your Data panel.
   */
  storageUsage: (appId: string) => { rows: number; bytes: number };
  /**
   * Resolve a cross-app intent request. The Svelte component supplies
   * this so it can wrap the registry + permission grant flow + data
   * fetch in reactive runes.
   */
  consumeIntent: (
    consumerAppId: string,
    intent: string,
  ) => Promise<IntentRequestResult>;
  /**
   * Return the apps that consume an intent the current app provides.
   */
  consumersFor: (intent: string) => IntentRegistration[];
  /**
   * Open the container's Your Data overlay scoped to this app. The
   * overlay shows storage usage, backup/restore, transfer, and
   * delete-app-data — the same surface as the wrapper-level panel, but
   * hosted by the container so iframe apps reach it through the bridge.
   */
  dataOpenPanel: (appId: string) => { opened: true };
  /**
   * Fire a built-in sensory texture by name on the container's engine.
   * The router validates the name and returns whether the fire was
   * accepted; iframe apps never get a custom-texture registration path.
   */
  fireTexture: (name: string) =>
    | { fired: true; name: string }
    | { fired: false; reason: 'unknown_texture' };
  /**
   * Route an `ai.run` request to the container's AI Web Worker. The
   * worker owns model loading, backend selection, and edge fallback;
   * iframe apps just call `shippie.ai.run({ task, input })`.
   */
  runAi: (req: AiRunRequest) => Promise<AiRunResult>;
  /**
   * Forward the rows the provider published for an intent to all
   * granted consumer iframes. Called by the `intent.provide` handler
   * once the provider's broadcast payload is validated.
   */
  broadcastIntent: (
    providerAppId: string,
    intent: string,
    rows: readonly unknown[],
  ) => { delivered: number };
  /**
   * Resolve `apps.list` for the calling app. Container scopes the
   * result to apps whose intents overlap the caller's declared
   * provides/consumes. Apps with no overlap are excluded — the list
   * never returns the user's full installed-app set, so it can't be
   * used as a cross-iframe fingerprint.
   */
  listOverlappingApps: (callerAppId: string) => AppsListEntry[];
  /**
   * Resolve `agent.insights` for the calling app. Container enforces
   * the source-data invariant: an insight is only returned if every
   * input row in its provenance belongs to a namespace the caller
   * has read access to (its own slug or a granted intent).
   */
  insightsForApp: (callerAppId: string) => readonly Insight[];
  /**
   * Start a transfer drop. Container looks up acceptors whose declared
   * `acceptsTransfer.kinds` includes the source's announced kind,
   * forwards the preview to those iframes so they can light up drop
   * zones, and returns the eligible-acceptor list so the source can
   * decide whether to bother showing a drag indicator.
   */
  startTransferDrop: (
    sourceAppId: string,
    kind: string,
    preview: unknown,
  ) => TransferStartResult;
  /**
   * Commit a transfer drop. The source iframe specifies which target
   * (`targetSlug`) it picked; the container delivers the payload to
   * that target if the kind is accepted AND the user has granted the
   * source→target pair. First-time deliveries enqueue a permission
   * prompt and resolve once the user accepts (delivered) or declines
   * (`permission_denied`). Synchronous resolution is allowed when the
   * grant already exists or the kind isn't accepted at all.
   */
  commitTransferDrop: (
    sourceAppId: string,
    targetSlug: string,
    kind: string,
    payload: unknown,
  ) => TransferCommitResult | Promise<TransferCommitResult>;
}

export type AppHandlers = Record<string, BridgeHandler>;

export function createAppHandlers(ctx: AppHandlerContext): AppHandlers {
  const { appId, app } = ctx;
  return {
    'app.info': () => ({
      appId,
      slug: app.slug,
      name: app.name,
      mode: 'container' as const,
      standaloneUrl: app.standaloneUrl,
    }),
    'db.insert': ({ payload }) => ctx.insertRow(appId, payload),
    'db.query': ({ payload }) => ctx.queryRows(appId, payload),
    'storage.getUsage': () => ctx.storageUsage(appId),
    'feedback.open': ({ payload }) => ({
      opened: true,
      appId,
      received: payload,
    }),
    'analytics.track': ({ payload }) => ({
      accepted: true,
      mode: 'aggregate-only' as const,
      event: payload,
    }),
    // Phase A2 — cross-app intents.
    //
    // intent.consume — caller asks "give me data for intent X". The
    // contract has already verified the caller declared `consumes: [X]`
    // (assertCapabilityAllowed in the bridge runs first). The container
    // looks up providers, prompts the user the first time, and returns
    // the provider's rows.
    'intent.consume': async ({ payload }) => {
      const intent = readPayloadIntent(payload);
      if (!intent) {
        return {
          provider: null,
          rows: [],
          reason: 'no_provider' as const,
        } satisfies IntentRequestResult;
      }
      return ctx.consumeIntent(appId, intent);
    },
    // intent.provide — caller declares it'll produce data for intent X.
    // The contract has verified the caller declared `provides: [X]`. The
    // payload may include `rows` — when it does, we broadcast them to
    // every granted consumer iframe so cross-app flows fire in real time.
    'intent.provide': ({ payload }) => {
      const intent = readPayloadIntent(payload);
      const consumers = intent ? ctx.consumersFor(intent) : [];
      const rows = readPayloadRows(payload);
      let delivered = 0;
      if (intent && rows.length > 0) {
        delivered = ctx.broadcastIntent(appId, intent, rows).delivered;
      }
      return {
        intent: intent ?? null,
        registered: Boolean(intent),
        consumerCount: consumers.length,
        rowsBroadcast: rows.length,
        delivered,
      };
    },
    // Phase A5 — open the container's Your Data overlay for this app.
    // The contract permits this for every iframe app (no permission
    // gate); the container decides how to render. The handler returns
    // an acknowledgement so the iframe knows the overlay was triggered.
    'data.openPanel': () => ctx.dataOpenPanel(appId),
    // Phase B4 — fire one of the 9 built-in sensory textures. The
    // router validates the name and silently no-ops if the name is
    // unknown so a misspelled preset doesn't crash the iframe app.
    'feel.texture': ({ payload }) => {
      const name = readPayloadName(payload);
      if (!name) return { fired: false, reason: 'missing_name' as const };
      return ctx.fireTexture(name);
    },
    // Phase B1 — run a local AI task through the container's worker.
    // The contract gates this on the app declaring localAi.tasks; the
    // bridge already enforces the gate before this handler runs. The
    // worker handles backend selection (WebNN→WebGPU→WASM), model
    // loading, and edge fallback for non-local tasks.
    'ai.run': async ({ payload }) => {
      const req = readAiRunPayload(payload);
      if (!req) {
        throw new Error('ai.run requires payload { task, input }');
      }
      return ctx.runAi(req);
    },
    // Phase P1A.1 — apps.list. Universal capability, but the result
    // is scoped to overlapping apps in the host. See container's
    // listOverlappingApps for the filter logic.
    'apps.list': () => ({ apps: ctx.listOverlappingApps(appId) }),
    // Phase P1A.2 — agent.insights. Universal at the contract; the
    // host filters insights by source-data provenance.
    'agent.insights': () => ({ insights: ctx.insightsForApp(appId) }),
    // Phase P1A.3 — data.transferDrop. Universal at the contract; the
    // host enforces kind-match (registry) and per-source-target grant
    // (the user prompt mirrors the intent-grant flow).
    //
    // Two methods on this single capability:
    //   `transferDrop.starting` — broadcast preview to acceptors of the
    //   announced kind. Source uses the returned acceptor list to
    //   decide whether to show a drop indicator.
    //   `transferDrop.commit`   — actually deliver payload to a single
    //   target the source picked. Container queues a permission prompt
    //   on first delivery from this source→target pair.
    'data.transferDrop': async ({ payload, method }) => {
      const kind = readPayloadKind(payload);
      if (!kind) {
        return {
          delivered: false,
          target: null,
          reason: 'no_target' as const,
        } satisfies TransferCommitResult;
      }
      if (method === 'commit') {
        const targetSlug = readPayloadTargetSlug(payload);
        if (!targetSlug) {
          return {
            delivered: false,
            target: null,
            reason: 'no_target' as const,
          } satisfies TransferCommitResult;
        }
        const dropPayload = (payload as Record<string, unknown> | null)?.payload;
        return ctx.commitTransferDrop(appId, targetSlug, kind, dropPayload);
      }
      // Default method: starting (preview broadcast). The bridge wraps
      // the iframe message at `method` — we accept both the literal
      // 'starting' and any non-commit method as a "broadcast" signal so
      // the SDK doesn't have to special-case the verb.
      const preview = (payload as Record<string, unknown> | null)?.preview ?? null;
      return ctx.startTransferDrop(appId, kind, preview);
    },
  };
}

function readPayloadKind(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const value = (payload as Record<string, unknown>).kind;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readPayloadTargetSlug(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const value = (payload as Record<string, unknown>).targetSlug;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

const VALID_AI_TASKS = new Set<AiTask>([
  'classify',
  'embed',
  'sentiment',
  'moderate',
  'vision',
  'summarise',
  'generate',
  'translate',
]);

function readAiRunPayload(payload: unknown): AiRunRequest | null {
  if (!payload || typeof payload !== 'object') return null;
  const obj = payload as Record<string, unknown>;
  const task = typeof obj.task === 'string' ? obj.task : '';
  if (!VALID_AI_TASKS.has(task as AiTask)) return null;
  return {
    task: task as AiTask,
    input: obj.input,
    options: typeof obj.options === 'object' && obj.options !== null
      ? (obj.options as Record<string, unknown>)
      : undefined,
  };
}

function readPayloadName(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const value = (payload as Record<string, unknown>).name;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readPayloadIntent(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const value = (payload as Record<string, unknown>).intent;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readPayloadRows(payload: unknown): unknown[] {
  if (!payload || typeof payload !== 'object') return [];
  const rows = (payload as Record<string, unknown>).rows;
  return Array.isArray(rows) ? rows : [];
}

// ---------------------------------------------------------------------------
// Pure mutators that the Svelte component wraps with reactive state.
//
// The Svelte component calls these from inside its `$state` closures so
// the reactive store updates correctly. The factory above takes the
// reactive-aware versions; tests can call these directly with plain objects.
// ---------------------------------------------------------------------------

export function buildLocalRow(
  appId: string,
  appSlug: string,
  payload: unknown,
  existingRowCount: number,
): LocalRow {
  return {
    id: `${appSlug || 'app'}_${existingRowCount + 1}`,
    table: readPayloadTable(payload),
    payload,
    createdAt: new Date().toISOString(),
  };
}

export function filterRowsByTable(rows: LocalRow[], payload: unknown): LocalRow[] {
  const table = readPayloadTable(payload);
  return rows.filter((row) => row.table === table);
}

export function computeStorageUsage(rows: LocalRow[]): { rows: number; bytes: number } {
  return {
    rows: rows.length,
    bytes: JSON.stringify(rows).length,
  };
}
