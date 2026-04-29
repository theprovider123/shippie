/**
 * @shippie/core — shared logic for the Shippie maker toolchain.
 *
 * Both @shippie/mcp (Claude Code / Cursor) and the future @shippie/cli
 * consume this package. The contract: the SAME code path runs against
 * https://shippie.app and against http://hub.local — the only difference
 * is the `apiUrl` config option.
 *
 * Public surface (Phase 1B minimal cut):
 *   - createClient({ apiUrl?, token? }) → Client
 *   - client.auth.getToken()
 *   - client.deploy({ directory, slug?, trial? })
 *   - client.status(deployId)
 *   - client.appsList()
 *
 * Phase 7 (master plan) expands this to: logs, config, classify, localize,
 * workspaces, templates.
 */
export * from './client.ts';
export * from './deploy.ts';
export * from './status.ts';
export * from './apps.ts';
export * from './auth.ts';
export * from './stream.ts';
export * from './classify.ts';
export * from './install.ts';
