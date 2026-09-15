import { create } from 'zustand';
import { DEFAULT_GROUPS, reconcileDockGroups } from './dockDefaults.js';
import { addAgent, getAgents } from './agentStore.js';
import { getCanvasObjectType, legacyKindForCanvasType, canvasObjectToLegacyWindow } from './canvasObjectTypes.js';
import { getDefaultWindowSize } from './windowManifest.js';
import { randomDropSpot } from './appUtils.js';
import { createLogger } from './logger.js';
import { createPresetActions } from './storePresetActions.js';
import { createCanvasActions } from './storeCanvasActions.js';
import { createGroupActions } from './storeGroupActions.js';

const log = createLogger('canvas-actions');

export const useWorkspaceStore = create((set, get) => ({
  wins: [],
  setWins: (wins) => set({ wins: typeof wins === 'function' ? wins(get().wins) : wins }),

  canvasGroups: [],
  setCanvasGroups: (groups) => set({ canvasGroups: typeof groups === 'function' ? groups(get().canvasGroups) : groups }),

  paths: [],
  setPaths: (paths) => set({ paths: typeof paths === 'function' ? paths(get().paths) : paths }),

  links: [],
  setLinks: (links) => set({ links: typeof links === 'function' ? links(get().links) : links }),

  activeTool: 'select',
  setActiveTool: (tool) => set({ activeTool: tool }),

  penColor: '#60A5FA',
  setPenColor: (color) => set({ penColor: color }),

  penSize: 4,
  setPenSize: (size) => set({ penSize: size }),

  penMode: false,
  setPenMode: (mode) => set({ penMode: typeof mode === 'function' ? mode(get().penMode) : mode }),

  activeId: null,
  setActiveId: (id) => set({ activeId: id }),

  selectedIds: [],
  setSelectedIds: (ids) => set({ selectedIds: typeof ids === 'function' ? ids(get().selectedIds) : ids }),

  dockOffset: 0,
  setDockOffset: (offset) => set({ dockOffset: typeof offset === 'function' ? offset(get().dockOffset) : offset }),

  groups: DEFAULT_GROUPS,
  groupsPhoenixSeated: false,
  // Every write prunes dead agent ids; Phoenix is seated on the Core Team
  // once per session (bootstrap) and never forced back after that.
  setGroups: (groups) => set((state) => {
    const next = typeof groups === 'function' ? groups(state.groups) : groups;
    const knownIds = getAgents().map((agent) => agent.id);
    return {
      groups: reconcileDockGroups(next, knownIds, { seatPhoenix: !state.groupsPhoenixSeated }),
      groupsPhoenixSeated: true,
    };
  }),

  focusMode: false,
  setFocusMode: (mode) => set({ focusMode: typeof mode === 'function' ? mode(get().focusMode) : mode }),

  extraAgents: [],
  setExtraAgents: (agents) => set({ extraAgents: typeof agents === 'function' ? agents(get().extraAgents) : agents }),

  currentProject: null,
  setCurrentProject: (project) => set({ currentProject: project }),

  workspaceId: null,
  setWorkspaceId: (workspaceId) => set({ workspaceId }),

  pan: { x: 0, y: 0 },
  setPan: (pan) => set({ pan: typeof pan === 'function' ? pan(get().pan) : pan }),

  zoom: 1,
  setZoom: (zoom) => set({ zoom: typeof zoom === 'function' ? zoom(get().zoom) : zoom }),

  presets: [],
  setPresets: (presets) => set({ presets: typeof presets === 'function' ? presets(get().presets) : presets }),

  sidebarFavorites: [],
  setSidebarFavorites: (favorites) => set({ sidebarFavorites: typeof favorites === 'function' ? favorites(get().sidebarFavorites) : favorites }),

  // Brief B1 — window allow-list. The state shape that lets new users land
  // on an empty canvas (windows off by default) and choose which to enable
  // from the marketplace (B2). The migration runs in useAppBootstrap on
  // workspace load; this slot just stores the result.
  windowAllowList: {},
  setWindowAllowList: (allowList) => set({
    windowAllowList: typeof allowList === 'function' ? allowList(get().windowAllowList) : allowList,
  }),
  // Convenience action: set a single kind's flag without rebuilding the map.
  setWindowAllowed: (kind, allowed) => set((state) => ({
    windowAllowList: { ...(state.windowAllowList || {}), [kind]: Boolean(allowed) },
  })),

  // Brief B3 — dock visibility state. Default hidden (visible: false).
  // Shape: { visible: boolean, groupOverrides: { [groupId]: { visible, agentOverrides } } }.
  // See src/components/dock/useDockVisibility.js for setters / derivation.
  dock: { visible: false, groupOverrides: {} },
  setDock: (dock) => set({
    dock: typeof dock === 'function' ? dock(get().dock) : dock,
  }),

  // Named Actions for Canvas and Windows (Step 1 Multiplayer Canvas Roadmap)
  spawnAt: (kind, props = {}, pos = null, size = null) => {
    const id = crypto.randomUUID();
    const type = getCanvasObjectType({ type: kind });
    const legacyKind = legacyKindForCanvasType(type);
    const sz = size || getDefaultWindowSize(legacyKind || type);
    const p = pos || randomDropSpot(sz, get().pan, get().zoom);
    const now = new Date().toISOString();
    
    const defaultStylesByKind = {
      terminal: { opacity: 0.85 },
      code_editor: { opacity: 0.85 },
      githubConsole: { opacity: 0.90 }
    };
    const targetKind = legacyKind || type;
    const defaultStyles = defaultStylesByKind[targetKind] || {};

    const win = canvasObjectToLegacyWindow({
      id,
      type,
      kind: legacyKind,
      title: props.title || '',
      x: p.x,
      y: p.y,
      width: sz.w,
      height: sz.h,
      w: sz.w,
      h: sz.h,
      zIndex: null,
      state: {},
      metadata: {},
      createdBy: null,
      lockedBy: null,
      createdAt: now,
      updatedAt: now,
      ...defaultStyles,
      ...props,
    });

    set(state => {
      let nextWins = state.wins;
      if (props.kind === 'calendar' || kind === 'calendar') {
        const existing = state.wins.find(w => w.kind === 'calendar');
        if (existing) {
          nextWins = state.wins.map(w => w.id === existing.id ? { ...w, ...props, data: { ...w.data, ...props.data } } : w);
        } else {
          nextWins = [...state.wins, win];
        }
      } else {
        nextWins = [...state.wins, win];
      }
      return { wins: nextWins };
    });

    const finalId = (kind === 'calendar' || props.kind === 'calendar')
      ? (get().wins.find(w => w.kind === 'calendar')?.id || id)
      : id;
    set({ activeId: finalId });
    log.info('window spawned', { kind: legacyKind || type, type, id: finalId });
    return finalId;
  },

  onUpdate: (id, patch) => {
    set(state => ({
      wins: state.wins.map(w => {
        if (w.id !== id) return w;
        return canvasObjectToLegacyWindow({
          ...w,
          ...patch,
          width: Number.isFinite(patch.width) ? patch.width : (Number.isFinite(patch.w) ? patch.w : w.width),
          height: Number.isFinite(patch.height) ? patch.height : (Number.isFinite(patch.h) ? patch.h : w.height),
          updatedAt: new Date().toISOString(),
        });
      })
    }));
  },

  onClose: (id) => {
    set(state => ({
      wins: state.wins.filter(w => w.id !== id),
      links: state.links.filter(l => l.fromId !== id && l.toId !== id),
      activeId: state.activeId === id ? null : state.activeId,
      selectedIds: state.selectedIds.filter(selectedId => selectedId !== id)
    }));
  },

  createAgent: (agent, options = {}) => {
    addAgent(agent);
    set(state => ({
      extraAgents: state.extraAgents.some(existing => existing.id === agent.id)
        ? state.extraAgents.map(existing => existing.id === agent.id ? { ...existing, ...agent } : existing)
        : [...state.extraAgents, agent]
    }));
    if (options.groupIds?.length) {
      set(state => ({
        groups: state.groups.map(group => (
          options.groupIds.includes(group.id)
            ? { ...group, agentIds: [...new Set([...(group.agentIds || []), agent.id])] }
            : group
        ))
      }));
    }
    get().spawnAt('agent', { agentId: agent.id });
  },

  groupDragCache: null,

  ...createGroupActions(set, get),
  ...createCanvasActions(set, get),
  ...createPresetActions(set, get),
}));
