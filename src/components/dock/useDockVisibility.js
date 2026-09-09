/**
 * src/components/dock/useDockVisibility.js
 *
 * Brief B3 — `.team/handoffs/2026-06-23-b3-sidebar-visibility.md`.
 *
 * Hook that reads/writes the dock's visibility state from the workspace.
 * The state lives in `workspace.dock` with the shape:
 *
 *   {
 *     visible: boolean,            // master toggle
 *     groupOverrides: {
 *       [groupId]: { visible: boolean, agentOverrides: { [agentId]: boolean } }
 *     }
 *   }
 *
 * Default visibility follows the rules:
 *   - `visible` defaults to false (the dock starts hidden).
 *   - A group is visible if its `groupOverrides[groupId].visible` is true.
 *     If no override is set, it falls back to whether any agent in the
 *     group is allowed (a group is shown if at least one agent has an
 *     explicit visible:true override).
 *   - An agent is visible only if BOTH the parent group is visible AND
 *     the agent's own override (or default-true) is visible.
 *
 * Persistence is handled by AppContent's existing workspace save (the
 * `dock` field joins `windowAllowList`, `wins`, `canvasGroups`, etc.).
 */

import { useWorkspaceStore } from '../../lib/store.js';

// ---------------------------------------------------------------------------
// Pure helpers (testable without React)
// ---------------------------------------------------------------------------

export const DEFAULT_DOCK_VISIBILITY = Object.freeze({
  visible: false,
  groupOverrides: {},
});

/**
 * Returns the user's effective "visible" for a group given the raw state
 * and the set of allowed agent ids (from B1's windowAllowList).
 */
export function isGroupVisible(dock, groupId, allowedAgentIds) {
  if (!dock) return false;
  if (dock.visible === false) return false;
  const ov = dock.groupOverrides && dock.groupOverrides[groupId];
  if (ov && typeof ov.visible === 'boolean') return ov.visible;
  // Default: visible if any agent in the group is allowed.
  if (Array.isArray(allowedAgentIds)) {
    return allowedAgentIds.length > 0;
  }
  return false;
}

/**
 * Returns whether an individual agent should be visible. An agent is
 * visible only when (a) the parent group is visible, AND (b) the agent
 * itself is allowed (from windowAllowList), AND (c) the agent's own
 * override (if any) is true or undefined (default = visible).
 */
export function isAgentVisible(dock, groupId, agentId, allowedAgentIds) {
  if (!isGroupVisible(dock, groupId, allowedAgentIds)) return false;
  const ov = dock.groupOverrides && dock.groupOverrides[groupId];
  const agentOv = ov && ov.agentOverrides && ov.agentOverrides[agentId];
  if (agentOv === false) return false;
  // No override or explicit true → visible (if allowed by allow-list).
  return Array.isArray(allowedAgentIds) ? allowedAgentIds.includes(agentId) : true;
}

/**
 * Setter helper: returns a new dock state with `visible` flipped.
 */
export function setDockVisible(dock, visible) {
  const base = dock || DEFAULT_DOCK_VISIBILITY;
  return { ...base, visible: Boolean(visible) };
}

/**
 * Setter helper: returns a new dock state with a group's visibility set.
 */
export function setGroupVisible(dock, groupId, visible) {
  const base = dock || DEFAULT_DOCK_VISIBILITY;
  const groupOverrides = { ...(base.groupOverrides || {}) };
  groupOverrides[groupId] = {
    ...(groupOverrides[groupId] || {}),
    visible: Boolean(visible),
  };
  return { ...base, groupOverrides };
}

/**
 * Setter helper: returns a new dock state with an agent's visibility set.
 */
export function setAgentVisible(dock, groupId, agentId, visible) {
  const base = dock || DEFAULT_DOCK_VISIBILITY;
  const groupOverrides = { ...(base.groupOverrides || {}) };
  const group = { ...(groupOverrides[groupId] || {}) };
  const agentOverrides = { ...(group.agentOverrides || {}) };
  agentOverrides[agentId] = Boolean(visible);
  group.agentOverrides = agentOverrides;
  groupOverrides[groupId] = group;
  return { ...base, groupOverrides };
}

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------

/**
 * Hook: returns the current dock visibility state + setters. Persists
 * through the existing workspace save (AppContent's persist useEffect
 * already serializes the workspace, which includes the `dock` field).
 */
export function useDockVisibility() {
  const dock = useWorkspaceStore((s) => s.dock);
  const setDock = useWorkspaceStore((s) => s.setDock);

  return {
    dock: dock || DEFAULT_DOCK_VISIBILITY,
    visible: Boolean((dock || DEFAULT_DOCK_VISIBILITY).visible),
    setVisible: (v) => setDock(setDockVisible(dock, v)),
    setGroupVisible: (groupId, v) => setDock(setGroupVisible(dock, groupId, v)),
    setAgentVisible: (groupId, agentId, v) =>
      setDock(setAgentVisible(dock, groupId, agentId, v)),
  };
}

/**
 * Hook variant for components that just need to know "is the dock visible?".
 * Lighter than the full useDockVisibility (no setters pulled from store).
 */
export function useDockVisible() {
  const dock = useWorkspaceStore((s) => s.dock);
  return Boolean((dock || DEFAULT_DOCK_VISIBILITY).visible);
}
