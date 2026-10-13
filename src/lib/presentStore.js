import { create } from 'zustand';
import { useWorkspaceStore } from './store.js';
import { loadGroupHotkeys, groupMembers } from './groupHotkeys.js';
import { loadScenes, saveScenes, resolveRun, viewForEntry } from './presentScenes.js';

// Present mode session state (see presentScenes.js). Session-only apart from
// the scene list: a reload always lands on the normal board. The board itself
// is never changed by presenting; only the view moves, and Escape puts the
// view, the active window and the selection back exactly as they were.

function boardRun(scenes, workspaceId) {
  return resolveRun(scenes, loadGroupHotkeys(workspaceId), useWorkspaceStore.getState().canvasGroups);
}

function showEntry(entry) {
  const ws = useWorkspaceStore.getState();
  const view = viewForEntry(entry);
  if (entry.group) {
    ws.enterGroupFocus(entry.group.id, { ...view, slot: entry.scene.key });
    const members = groupMembers(ws.wins, entry.group).map((w) => w.id);
    useWorkspaceStore.setState({
      selectedIds: [],
      activeId: members.includes(ws.activeId) ? ws.activeId : (members[0] ?? ws.activeId),
    });
  } else {
    useWorkspaceStore.setState({ groupFocus: null, pan: view.pan, zoom: view.zoom, selectedIds: [] });
  }
}

function takeSnapshot() {
  const ws = useWorkspaceStore.getState();
  return {
    pan: ws.groupFocus?.prevPan ?? ws.pan,
    zoom: ws.groupFocus?.prevZoom ?? ws.zoom,
    activeId: ws.activeId,
    selectedIds: ws.selectedIds,
  };
}

export const usePresentStore = create((set, get) => ({
  workspaceId: null,
  scenes: loadScenes(null),
  presenting: false,
  sceneId: null,
  snapshot: null,
  startedAt: null,
  emptyNotice: false,
  editorOpen: false,
  notesOpen: false,

  setWorkspace: (workspaceId) => set({ workspaceId, scenes: loadScenes(workspaceId) }),
  setScenes: (scenes) => {
    saveScenes(get().workspaceId, scenes);
    set({ scenes });
  },
  setEditorOpen: (open) => set({ editorOpen: Boolean(open), emptyNotice: false }),
  setNotesOpen: (open) => set({ notesOpen: Boolean(open) }),
  dismissEmpty: () => set({ emptyNotice: false }),

  run: () => boardRun(get().scenes, get().workspaceId),

  /** Start (or jump) to a scene by id; the first scene when none given. */
  start: (sceneId) => {
    const run = get().run();
    if (run.length === 0) { set({ emptyNotice: true }); return false; }
    const entry = run.find((e) => e.scene.id === sceneId) || run[0];
    const fresh = !get().presenting;
    set({
      presenting: true,
      sceneId: entry.scene.id,
      snapshot: fresh ? takeSnapshot() : get().snapshot,
      startedAt: fresh ? Date.now() : get().startedAt,
      emptyNotice: false,
      editorOpen: false,
    });
    showEntry(entry);
    return true;
  },

  /** F<n>: the scene on that key, if it can be shown. */
  startKey: (key) => {
    const entry = get().run().find((e) => e.scene.key === String(key));
    return entry ? get().start(entry.scene.id) : false;
  },

  step: (delta) => {
    if (!get().presenting) return false;
    const run = get().run();
    const at = run.findIndex((e) => e.scene.id === get().sceneId);
    const next = run[Math.max(0, Math.min(run.length - 1, at + delta))];
    if (!next || next.scene.id === get().sceneId) return false;
    return get().start(next.scene.id);
  },

  /** Re-fit the current scene (resize, a group moved or went away). */
  refresh: () => {
    if (!get().presenting) return;
    const run = get().run();
    const entry = run.find((e) => e.scene.id === get().sceneId);
    if (entry) showEntry(entry);
    else if (run.length > 0) get().start(run[0].scene.id);
    else get().stop();
  },

  stop: () => {
    if (!get().presenting) return false;
    const snap = get().snapshot;
    set({ presenting: false, sceneId: null, snapshot: null, startedAt: null });
    if (snap) {
      const live = new Set(useWorkspaceStore.getState().wins.map((w) => w.id));
      useWorkspaceStore.setState({
        groupFocus: null,
        pan: snap.pan,
        zoom: snap.zoom,
        activeId: live.has(snap.activeId) ? snap.activeId : null,
        selectedIds: (snap.selectedIds || []).filter((id) => live.has(id)),
      });
    }
    return true;
  },
}));
