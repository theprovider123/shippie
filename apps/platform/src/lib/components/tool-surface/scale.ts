/**
 * scale.ts — locked display caps so every surface interprets "manageable
 * at scale" identically (spec §9). Rendering every item is forbidden;
 * surfaces show these counts and reveal the rest via search / manage.
 */

/** Drawer: rows shown per section before "search to reveal the rest". */
export const DRAWER_PER_SECTION = 8;

/** Dock home: rows shown per section before a Manage / search affordance. */
export const DOCK_RUNNING_CAP = 5;
export const DOCK_RECENT_CAP = 8;
export const DOCK_SAVED_CAP = 8;

/** Tools: virtualized browse page size (matches the existing grid pull). */
export const TOOLS_PAGE_SIZE = 48;
