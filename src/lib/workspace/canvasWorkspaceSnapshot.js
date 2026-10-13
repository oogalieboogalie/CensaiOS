import { withoutUnsupportedWindows } from '../appUtils.js';

const EMPTY_ARRAY = Object.freeze([]);

export function canvasWorkspaceSnapshot(state = {}) {
  return {
    workspaceId: state.workspaceId || null,
    currentProject: state.currentProject || null,
    wins: withoutUnsupportedWindows(state.wins || EMPTY_ARRAY),
    canvasGroups: state.canvasGroups || EMPTY_ARRAY,
    dockOffset: state.dockOffset || 0,
    dock: state.dock || { visible: false, groupOverrides: {} },
    groups: state.groups || EMPTY_ARRAY,
    focusMode: Boolean(state.focusMode),
    paths: state.paths || EMPTY_ARRAY,
    links: state.links || EMPTY_ARRAY,
    extraAgents: state.extraAgents || EMPTY_ARRAY,
    penColor: state.penColor,
    penSize: state.penSize,
    penMode: Boolean(state.penMode),
    sidebarFavorites: state.sidebarFavorites || EMPTY_ARRAY,
    windowAllowList: state.windowAllowList || {},
  };
}

export function applyCanvasWorkspaceSnapshot(store, value) {
  const snapshot = canvasWorkspaceSnapshot(value);
  store.setState(snapshot);
  return snapshot;
}
