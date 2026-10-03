import React from 'react';
import { useWorkspaceStore } from '../../lib/store.js';
import { computeFitBounds } from '../../lib/canvasMath.js';
import {
  GROUP_HOTKEY_SLOTS,
  loadGroupHotkeys,
  saveGroupHotkeys,
  resolveAssignTarget,
  groupForSlot,
  pruneBindings,
  groupMembers,
} from '../../lib/groupHotkeys.js';

// AoE-style control groups. Ctrl/Alt+1..9 binds the active window's group to
// a slot; F1..F9 jumps the viewport to that group. Bindings persist per
// workspace. Returns { bindings } so the canvas can badge assigned groups.
//
// Note: browsers reserve Ctrl+1..8 for tab switching and won't let pages
// prevent it — Alt+1..9 is the reliable combo in a browser tab; Ctrl works
// in the desktop (Tauri/Electron) shell. Both are bound.
export function useGroupHotkeys({ workspaceId }) {
  const [bindings, setBindings] = React.useState(() => loadGroupHotkeys(workspaceId));

  React.useEffect(() => {
    setBindings(loadGroupHotkeys(workspaceId));
  }, [workspaceId]);

  const bindingsRef = React.useRef(bindings);
  bindingsRef.current = bindings;

  const assignSlot = React.useCallback((slot) => {
    const { wins, activeId, canvasGroups } = useWorkspaceStore.getState();
    const groupId = resolveAssignTarget(wins, activeId);
    if (!groupId) return false;
    if (!canvasGroups.some((g) => g.id === groupId)) return false;
    setBindings((current) => {
      const next = { ...current, [String(slot)]: groupId };
      saveGroupHotkeys(workspaceId, next);
      return next;
    });
    return true;
  }, [workspaceId]);

  const focusSlot = React.useCallback((slot) => {
    const state = useWorkspaceStore.getState();
    const group = groupForSlot(state.canvasGroups, bindingsRef.current, slot);
    if (!group) {
      // Stale binding — drop it so the slot can be reused.
      setBindings((current) => {
        const next = pruneBindings(current, state.canvasGroups);
        saveGroupHotkeys(workspaceId, next);
        return next;
      });
      return false;
    }
    const fit = computeFitBounds({ minX: group.x, minY: group.y, w: group.w, h: group.h });
    state.setPan({ x: fit.x, y: fit.y });
    state.setZoom(fit.zoom);
    const members = groupMembers(state.wins, group).map((w) => w.id);
    if (members.length > 0) {
      state.setSelectedIds(members);
      state.setActiveId(members[0]);
    }
    return true;
  }, [workspaceId]);

  React.useEffect(() => {
    const isEditing = (target) => {
      if (!target) return false;
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
      if (target.isContentEditable) return true;
      if (target.closest) {
        if (target.closest('[contenteditable="true"]')) return true;
        // xterm.js emulator surfaces eat every key — never steal from them.
        if (target.closest('.xterm')) return true;
      }
      return false;
    };
    const onKey = (e) => {
      if (isEditing(e.target)) return;
      const digitMatch = /^Digit([1-9])$/.exec(e.code || '');
      // Only swallow the key when it did something: an unbound F5 must still
      // refresh the page, and Alt+digit with no group stays the browser's.
      if (digitMatch && (e.ctrlKey || e.altKey) && !e.metaKey && !e.shiftKey) {
        if (assignSlot(digitMatch[1])) e.preventDefault();
        return;
      }
      const fnMatch = /^F([1-9])$/.exec(e.key || '');
      if (fnMatch && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        if (focusSlot(fnMatch[1])) e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [assignSlot, focusSlot]);

  return { bindings, assignSlot, focusSlot, slots: GROUP_HOTKEY_SLOTS };
}
