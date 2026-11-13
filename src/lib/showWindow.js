import { useWorkspaceStore } from './store.js';
import { panToShow } from './freeSpot.js';
import { glidePan } from './glideView.js';
import { tileIndex } from './layout/dockZones.js';
import { filterForGroupFocus } from './groupHotkeys.js';

/**
 * Glide the board just far enough that a window sits fully in view. A pinned
 * or full-screen window is on screen wherever the board is, so the board
 * stays put for those.
 */
export function glideToWindow(win) {
  if (!win || win.pinned || win.maximized || typeof window === 'undefined') return;
  const store = useWorkspaceStore.getState();
  const rect = { x: win.x, y: win.y, w: win.w || win.width || 400, h: win.h || win.height || 300 };
  const next = panToShow(rect, { pan: store.pan, zoom: store.zoom, width: window.innerWidth, height: window.innerHeight });
  if (next) glidePan(store.pan, next, (pan) => store.setPan(pan), { read: () => useWorkspaceStore.getState().pan });
}

/**
 * Bring a window someone asked for into sight: end the full-screen group that
 * hides it (as opening a new window does), put it in front of the tabs that
 * share its slot, and glide the board over to it.
 */
export function revealWindow(win) {
  if (!win) return;
  const store = useWorkspaceStore.getState();
  if (store.groupFocus && filterForGroupFocus(store.wins, store.canvasGroups, store.groupFocus).hiddenOutside.includes(win.id)) {
    store.exitGroupFocus();
  }
  const tiles = tileIndex(store.wins, store.canvasGroups);
  if (tiles.hidden.has(win.id)) store.showGroupTab(tiles.index.get(win.id).groupId, win.id);
  glideToWindow(win);
}
