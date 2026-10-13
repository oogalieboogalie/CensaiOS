import React from 'react';
import { keyboardClaimed } from '../../lib/keyboardClaim.js';
import { useWorkspaceStore } from '../../lib/store.js';
import { makeGroupBoundsForWindows } from '../../lib/layoutAlgo.js';
import {
  GROUP_HOTKEY_SLOTS,
  loadGroupHotkeys,
  saveGroupHotkeys,
  resolveAssignAction,
  computeGroupFocusView,
  groupForSlot,
  pruneBindings,
  groupMembers,
} from '../../lib/groupHotkeys.js';

// AoE-style control groups. Ctrl/Alt+1..9 binds the active window's group to
// a slot (or turns the selected loose windows into a group first); F1..F9
// opens that group full screen with everything else hidden; Escape, or the
// same F-key again, goes back to the canvas as it was (Shift+Escape works
// even while a window holds the keyboard). Bindings persist per workspace. Returns { bindings } so the canvas can badge assigned groups.
//
// Note: browsers reserve Ctrl+1..8 for tab switching and won't let pages
// prevent it — Alt+1..9 is the reliable combo in a browser tab; Ctrl works
// in the desktop (Tauri/Electron) shell. Both are bound.
export function useGroupHotkeys({ workspaceId }) {
  const [bindings, setBindings] = React.useState(() => loadGroupHotkeys(workspaceId));

  React.useEffect(() => {
    setBindings(loadGroupHotkeys(workspaceId));
    // Something else (the podcast board builder) saved new bindings.
    const reload = () => setBindings(loadGroupHotkeys(workspaceId));
    window.addEventListener('censai:group-hotkeys-changed', reload);
    return () => window.removeEventListener('censai:group-hotkeys-changed', reload);
  }, [workspaceId]);

  const bindingsRef = React.useRef(bindings);
  bindingsRef.current = bindings;

  const assignSlot = React.useCallback((slot) => {
    const state = useWorkspaceStore.getState();
    const action = resolveAssignAction(state.wins, state.activeId, state.selectedIds);
    if (!action) return false;
    let groupId = action.groupId;
    if (action.createFrom) {
      const rect = makeGroupBoundsForWindows(action.createFrom);
      if (!rect) return false;
      groupId = state.spawnGroup({ x: rect.x, y: rect.y }, { w: rect.w, h: rect.h });
    }
    if (!useWorkspaceStore.getState().canvasGroups.some((g) => g.id === groupId)) return false;
    setBindings((current) => {
      // One slot per group, so the badge on the group is never ambiguous.
      const next = { [String(slot)]: groupId };
      for (const [key, id] of Object.entries(current)) {
        if (key !== String(slot) && id !== groupId) next[key] = id;
      }
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
    if (state.groupFocus?.groupId === group.id) {
      state.exitGroupFocus();
      return true;
    }
    state.enterGroupFocus(group.id, { ...computeGroupFocusView(group), slot: String(slot) });
    // Keyboard goes to the group (its active window if it had one) without
    // drawing a selection box over the full-screen view.
    const members = groupMembers(state.wins, group).map((w) => w.id);
    if (members.length > 0) {
      state.setSelectedIds([]);
      state.setActiveId(members.includes(state.activeId) ? state.activeId : members[0]);
    }
    return true;
  }, [workspaceId]);

  React.useEffect(() => {
    const isEditing = (target) => {
      if (!target) return false;
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
      if (target.isContentEditable) return true;
      return Boolean(target.closest?.('[contenteditable="true"]'));
    };
    // xterm.js emulators eat every key (F-keys included): never steal from them.
    const inTerminal = (target) => Boolean(target?.closest?.('.xterm'));
    const onKey = (e) => {
      const store = useWorkspaceStore.getState;
      // Shift+Esc always leaves the full-screen group, even while a chat box,
      // editor or game holds the keyboard and keeps plain Esc for itself.
      if (e.key === 'Escape' && e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (store().exitGroupFocus()) e.preventDefault();
        return;
      }
      if (inTerminal(e.target) || keyboardClaimed()) return;
      // F1..F9 type nothing, so they work from inside a text box too: jump
      // between groups without clicking out of the chat first.
      const fnMatch = /^F([1-9])$/.exec(e.key || '');
      if (fnMatch && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        if (focusSlot(fnMatch[1])) e.preventDefault();
        return;
      }
      if (isEditing(e.target)) return;
      if (e.key === 'Escape' && !e.defaultPrevented) {
        if (store().exitGroupFocus()) e.preventDefault();
        return;
      }
      const digitMatch = /^Digit([1-9])$/.exec(e.code || '');
      // Only swallow the key when it did something: an unbound F5 must still
      // refresh the page, and Alt+digit with no group stays the browser's.
      if (digitMatch && (e.ctrlKey || e.altKey) && !e.metaKey && !e.shiftKey) {
        if (assignSlot(digitMatch[1])) e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [assignSlot, focusSlot]);

  // Keep the focused group filling the screen when the window is resized.
  React.useEffect(() => {
    const onResize = () => {
      const state = useWorkspaceStore.getState();
      const group = state.groupFocus && state.canvasGroups.find((g) => g.id === state.groupFocus.groupId);
      if (group) state.enterGroupFocus(group.id, { ...computeGroupFocusView(group), slot: state.groupFocus.slot });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // The focused group was deleted (here or by a collaborator): leave focus.
  const focusedGone = useWorkspaceStore((state) => Boolean(
    state.groupFocus && !state.canvasGroups.some((g) => g.id === state.groupFocus.groupId)
  ));
  React.useEffect(() => {
    if (focusedGone) useWorkspaceStore.getState().exitGroupFocus();
  }, [focusedGone]);

  return { bindings, assignSlot, focusSlot, slots: GROUP_HOTKEY_SLOTS };
}
