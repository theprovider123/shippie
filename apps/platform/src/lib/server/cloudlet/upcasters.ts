import { createUpcasterRegistry, type UpcasterRegistry } from '@shippie/cloudlet-contract';

/**
 * Canonical server-side upcaster registry (Phase 4).
 *
 * A device offline across an app update can replay events stamped with an OLDER
 * `schemaVersion`. The WorkspaceStore upcasts every event to
 * `WORKSPACE_EVENT_SCHEMA_VERSION` before projecting it, so the projection
 * (read-model) logic always sees the current payload shape — old events still
 * apply without loss. The shape mirrors the client registry in
 * `$lib/uniti/offline/client.ts` so a client that upcasts-before-send and the
 * DO that upcasts-on-receive agree.
 *
 * Register steps here as event payloads evolve, e.g.:
 *   registerWorkspaceUpcaster('feedback.created', 1, (e) => ({
 *     ...e, schemaVersion: 2, payload: { ...e.payload, confidence: 3 } }));
 *
 * Empty at v1 — nothing to upcast yet. The registry is a no-op passthrough for
 * unregistered (type, version) pairs, so events already at the current version
 * are returned untouched.
 */
export const WORKSPACE_EVENT_SCHEMA_VERSION = 1;

export const workspaceUpcasters: UpcasterRegistry = createUpcasterRegistry();

export const registerWorkspaceUpcaster = workspaceUpcasters.registerUpcaster.bind(workspaceUpcasters);
