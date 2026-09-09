/**
 * src/lib/workspace/allowList.js
 *
 * Brief B1 — `.team/handoffs/2026-06-23-b1-window-allow-list.md`.
 *
 * Window allow-list: the state shape that lets new users land on an empty
 * canvas (windows off by default) and choose which windows to enable from
 * the marketplace (B2). Existing users with saved workspaces get the
 * back-compat all-true migration so they don't lose their layouts.
 *
 * Storage key: `homebase.workspace.v1` (unchanged). The new field is
 * `windowAllowList: { [kind]: boolean }` keyed by the window's `kind`
 * (the canonical key from `WINDOW_MANIFEST_BY_KIND`).
 *
 * Pure JS, no new deps. Both `useAppBootstrap.js` and `src/app/AppContent.jsx`
 * import from here so the migration runs at boot and the rendering gates
 * on the resulting allow-list.
 */

import { WINDOW_MANIFEST_BY_KIND } from '../windowManifest.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Tag emitted once per session when a legacy workspace is migrated. The
 * Bootstrap layer logs this; the test asserts it was set in the migrated
 * workspace so consumers can branch on "did this workspace come from a
 * pre-B1 save?".
 */
export const MIGRATION_FLAG_KEY = '__allowListMigratedFromLegacy';

/**
 * Reserved sentinel value: every kind in WINDOW_MANIFESTS set to true.
 * Used by the back-compat migration path so an existing user's canvas
 * doesn't silently empty out on the first reload after B1 ships.
 */
export const ALL_TRUE = '__allTrue';

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/**
 * Every kind in WINDOW_MANIFEST_BY_KIND set to false. The whole point of
 * the brief: new users land on an empty canvas.
 *
 * @returns {Record<string, false>}
 */
export function getDefaultAllowList() {
  const out = {};
  for (const kind of Object.keys(WINDOW_MANIFEST_BY_KIND)) {
    out[kind] = false;
  }
  return out;
}

/**
 * Inverse of the default: every kind set to true. Used by the migration
 * path to give existing users their existing layout.
 *
 * @returns {Record<string, true>}
 */
export function getAllTrueAllowList() {
  const out = {};
  for (const kind of Object.keys(WINDOW_MANIFEST_BY_KIND)) {
    out[kind] = true;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

/**
 * Take an existing `homebase.workspace.v1` payload and return a new
 * payload with `windowAllowList` populated. The migration rules:
 *
 *   - If `windowAllowList` is present and any key is true OR has been
 *     customized: keep the user's choices. Set the migration flag so
 *     consumers know the workspace was already on B1+.
 *   - If `windowAllowList` is absent: set it to the ALL_TRUE sentinel
 *     (every kind true) for ONE release, so existing users don't see
 *     their canvas wiped. Mark the workspace with the migration flag so
 *     the UI can prompt the user to opt-in explicitly later.
 *   - If `windowAllowList` is present but empty `{}`: that's a fresh
 *     post-B1 save with no enabled windows yet. Keep it as-is. No
 *     migration flag.
 *
 * The function is PURE — does not mutate the input.
 *
 * @param {object} workspace — current `homebase.workspace.v1` shape
 * @returns {object} new workspace with `windowAllowList` populated
 */
export function migrateWorkspace(workspace) {
  const input = workspace || {};
  const next = { ...input };

  if (input.windowAllowList && typeof input.windowAllowList === 'object') {
    // Window allow-list is already present.
    if (Object.keys(input.windowAllowList).length === 0) {
      // Empty object — fresh post-B1 save with no enabled windows. Keep it.
      return next;
    }
    // User has made choices (even all-false). Preserve them.
    next.windowAllowList = { ...input.windowAllowList };
    next[MIGRATION_FLAG_KEY] = true;
    return next;
  }

  // No windowAllowList at all — this is a legacy pre-B1 workspace.
  // Back-compat: enable everything so the user's canvas is preserved.
  next.windowAllowList = getAllTrueAllowList();
  next[MIGRATION_FLAG_KEY] = true;
  return next;
}

// ---------------------------------------------------------------------------
// Lookup / mutation helpers
// ---------------------------------------------------------------------------

/**
 * Return whether the given `kind` is currently allowed in the workspace.
 * Resolves missing kinds against the default (false) so a malformed
 * allow-list doesn't accidentally expose a window.
 *
 * @param {object} workspace
 * @param {string} kind
 * @returns {boolean}
 */
export function isWindowAllowed(workspace, kind) {
  if (!workspace || !workspace.windowAllowList) return false;
  const v = workspace.windowAllowList[kind];
  // Any truthy value counts as allowed; only explicit false blocks.
  return v === true || v === ALL_TRUE;
}

/**
 * Return a NEW workspace with the allow-list flag for `kind` set to
 * `allowed`. Other state is preserved untouched.
 *
 * @param {object} workspace
 * @param {string} kind
 * @param {boolean} allowed
 * @returns {object} new workspace
 */
export function setWindowAllowed(workspace, kind, allowed) {
  const base = workspace || {};
  const allowList = { ...(base.windowAllowList || {}) };
  allowList[kind] = Boolean(allowed);
  return { ...base, windowAllowList: allowList };
}

/**
 * Strip the `windowAllowList` from the workspace state when it equals
 * the default (every kind false). Keeps it when the user has customized.
 * Used to keep the persisted workspace lean — saves that haven't moved
 * off the default don't need to carry the field.
 *
 * @param {object} workspace
 * @returns {object} new workspace, possibly without `windowAllowList`
 */
export function withAllowList(workspace) {
  if (!workspace || !workspace.windowAllowList) return workspace || {};
  const defaults = getDefaultAllowList();
  const isDefault = Object.keys(workspace.windowAllowList).every((kind) => {
    return workspace.windowAllowList[kind] === (defaults[kind] ?? false);
  });
  if (isDefault) {
    const { windowAllowList: _ignored, ...rest } = workspace;
    return rest;
  }
  return workspace;
}

// ---------------------------------------------------------------------------
// Filter helpers for rendering (consumed by AppContent.jsx)
// ---------------------------------------------------------------------------

/**
 * Filter a list of windows against the workspace's allow-list. Windows
 * whose kind is blocked (or unknown) are dropped. Windows whose kind is
 * missing from the allow-list default to "blocked" (the brief's default-
 * false rule).
 *
 * @param {Array} wins — list of windows, each carrying a `kind` field
 * @param {object} workspace
 * @returns {Array} filtered list preserving input order
 */
export function filterAllowedWindows(wins, workspace) {
  if (!Array.isArray(wins)) return [];
  return wins.filter((win) => {
    if (!win || !win.kind) return false;
    return isWindowAllowed(workspace, win.kind);
  });
}

/**
 * Apply the migrated window allow-list to the workspace's `wins` array.
 * Single-call helper for AppContent's bootstrap useEffect — accepts the
 * raw `initial` payload from `useAppBootstrap` (already passed through
 * `migrateWorkspace`) and returns the wins filtered by the allow-list,
 * plus the allow-list itself (so the consumer can persist it).
 *
 * The returned `windowAllowList` is always an object (never null/undefined)
 * so AppContent can spread it into the store without nullish coalescing.
 *
 * @param {object} initial — raw `initial` payload (post-migrate)
 * @param {object} fallbackAllowList — store's current windowAllowList
 * @returns {{ wins: Array, windowAllowList: object }}
 */
export function applyAllowListToInitial(initial, fallbackAllowList) {
  const safeInitial = initial || {};
  const allowList = safeInitial.windowAllowList || fallbackAllowList || {};
  const wins = filterAllowedWindows(safeInitial.wins || [], {
    ...safeInitial,
    windowAllowList: allowList,
  });
  return { wins, windowAllowList: allowList };
}