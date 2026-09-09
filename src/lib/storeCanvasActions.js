import { api } from './api.js';
import { computeFitView, clusterWindows, boundsForItems, computeFitBounds } from './canvasMath.js';
import { DEFAULT_WINDOW_SIZES } from './windowManifest.js';

const DEFAULT_HTML_PREVIEW = `<!DOCTYPE html><html><head><style>body{font-family:sans-serif;background:#0d1117;color:#c9d1d9;padding:2rem;display:grid;place-items:center;min-height:50vh;}</style></head><body><h1>Hello Genesis</h1></body></html>`;

let groupDragCache = null;

export const createCanvasActions = (set, get) => ({
  createLink: (fromId, toId) => {
    set(state => ({
      links: [...state.links.filter(l => !(l.fromId === fromId && l.toId === toId)), { id: crypto.randomUUID(), fromId, toId, timestamp: Date.now() }]
    }));
  },

  deleteLink: (id) => {
    set(state => ({
      links: state.links.filter(l => l.id !== id)
    }));
  },

  fitView: () => {
    const fit = computeFitView(get().wins, get().canvasGroups);
    set({ pan: { x: fit.x, y: fit.y }, zoom: fit.zoom });
  },

  jumpToNearestCluster: () => {
    const { wins, pan, zoom } = get();
    const clusters = clusterWindows(wins);
    if (!clusters.length) return;

    const viewCenter = {
      x: (window.innerWidth / 2 - pan.x) / zoom,
      y: (window.innerHeight / 2 - pan.y) / zoom,
    };
    const nearest = clusters
      .map((cluster) => {
        const bounds = boundsForItems(cluster);
        const cx = bounds.minX + bounds.w / 2;
        const cy = bounds.minY + bounds.h / 2;
        return { cluster, bounds, distance: Math.hypot(cx - viewCenter.x, cy - viewCenter.y) };
      })
      .sort((a, b) => a.distance - b.distance)[0];

    const fit = computeFitBounds(nearest.bounds);
    set({ pan: { x: fit.x, y: fit.y }, zoom: fit.zoom });
  },

  onDragAgent: (agent, screenPt) => {
    const { wins, canvasGroups, pan, zoom, onUpdate, spawnAt, setActiveId } = get();
    const els = document.elementsFromPoint(screenPt.x, screenPt.y);
    const winEl = els.find(el => el.dataset?.winId);
    const groupEl = els.find(el => el.dataset?.groupId);

    if (winEl) {
      const winId = winEl.dataset.winId;
      const w = wins.find(x => x.id === winId);
      if (w && w.kind !== 'agent') {
        const attached = w.attachedAgents || [];
        if (!attached.includes(agent.id)) onUpdate(winId, { attachedAgents: [...attached, agent.id] });
        setActiveId(winId);
        return;
      }
      if (w && w.kind === 'agent') { setActiveId(winId); return; }
    } else if (groupEl) {
      const groupId = groupEl.dataset.groupId;
      const g = canvasGroups.find(x => x.id === groupId);
      if (g) {
        const attached = g.attachedAgents || [];
        if (!attached.includes(agent.id)) {
          set(state => ({
            canvasGroups: state.canvasGroups.map(grp => grp.id === groupId
              ? { ...grp, attachedAgents: [...attached, agent.id] }
              : grp
            )
          }));
        }
        return;
      }
    }
    const canvas = document.getElementById('canvas-root');
    const rect = canvas?.getBoundingClientRect();
    const x = (screenPt.x - (rect?.left || 0) - pan.x) / zoom - 160;
    const y = (screenPt.y - (rect?.top || 0) - pan.y) / zoom - 80;
    const existing = wins.find(w => w.kind === 'agent' && w.agentId === agent.id);
    if (existing) { setActiveId(existing.id); onUpdate(existing.id, { x, y }); return; }
    spawnAt('agent', { agentId: agent.id }, { x, y });
  },

  onNewAgent: () => get().spawnAt('agentDesigner'),
  
  onNewTerminal: () => get().spawnAt('terminal', { title: 'Terminal', cwd: get().currentProject?.path || '' }),
  
  onNewHtmlPreview: () => get().spawnAt('htmlPreview', { title: 'Shared Preview', fileName: 'preview.html', html: DEFAULT_HTML_PREVIEW }),
  
  onNewWindow: () => {
    const { wins, groups, onNewTerminal, spawnAt } = get();
    const order = ['terminal', 'operationsBoard', 'chat', 'todos', 'workflow', 'files', 'group', 'calendar'];
    const counts = order.map(k => wins.filter(w => w.kind === k).length);
    const min = Math.min(...counts);
    const next = order[counts.indexOf(min)];
    if (next === 'chat') spawnAt('chat', { agentId: 'censai' });
    else if (next === 'group') spawnAt('group', { groupName: groups[0]?.name || 'Core Team', groupHue: groups[0]?.hue || 5, memberIds: groups[0]?.agentIds || ['architect','censai','atlas','genesis','nexus','foundation','echo','phoenix'] });
    else if (next === 'terminal') onNewTerminal();
    else spawnAt(next);
  },

  onNewWorkflow: () => get().spawnAt('workflow'),
  
  onSpawnRook: () => get().spawnAt('rook', { title: 'Rook Agent Control' }),
  
  onNewMailcow: () => get().spawnAt('mailcow', { title: 'Mailcow' }),
  
  onNewVex: () => get().spawnAt('vex', { title: 'Vex Orchestrator' }),

  openLocalProject: async ({ path, name }) => {
    const project = await api.setCurrentProject({ path, name });
    set({ currentProject: project });
    // Multi-project canvas: opening a project sets the global default but
    // never re-roots existing trees. Park the project in an unrooted files
    // window if there is one, otherwise spawn a fresh tree for it — so two
    // projects mean two file trees side by side.
    set(state => {
      const unrooted = state.wins.find(w => w.kind === 'files' && !w.dirPath && !w.githubRepo);
      if (unrooted) {
        return {
          wins: state.wins.map(w => w.id === unrooted.id
            ? { ...w, mode: 'local', dirPath: project.path }
            : w
          )
        };
      }
      return {
        wins: [
          ...state.wins,
          {
            id: crypto.randomUUID(),
            kind: 'files',
            x: -180,
            y: -120,
            w: DEFAULT_WINDOW_SIZES.files.w,
            h: DEFAULT_WINDOW_SIZES.files.h,
            mode: 'local',
            dirPath: project.path,
          },
        ]
      };
    });
    return project;
  },

  moveGroup: (id, dx, dy, isFirstMove) => {
    const { wins, canvasGroups } = get();
    const g = canvasGroups.find(x => x.id === id);
    if (!g) return;

    if (isFirstMove) {
      // Sticky: a window counts as enclosed when it is explicitly assigned
      // (groupId) OR its center is visually inside the group rect. That way
      // windows dropped into a group travel with it even if the assignment
      // hasn't synced yet, and group drags never leave members behind.
      const isEnclosed = (w) => {
        if (w.groupId === id) return true;
        if (w.pinned) return false;
        const cx = w.x + w.w / 2;
        const cy = w.y + w.h / 2;
        return cx >= g.x && cx <= g.x + g.w && cy >= g.y && cy <= g.y + g.h;
      };
      const enclosedWins = wins.filter(isEnclosed).map(w => ({ id: w.id, ox: w.x, oy: w.y }));
      const enclosedGroups = canvasGroups.filter(otherG => otherG.groupId === id).map(otherG => ({ id: otherG.id, ox: otherG.x, oy: otherG.y }));
      groupDragCache = { id, ox: g.x, oy: g.y, enclosedWins, enclosedGroups };
    }

    if (!groupDragCache || groupDragCache.id !== id) return;

    set(state => {
      const enclosedIds = new Set(groupDragCache.enclosedWins.map(item => item.id));
      return {
      canvasGroups: state.canvasGroups.map(grp => grp.id === id
        ? { ...grp, x: groupDragCache.ox + dx, y: groupDragCache.oy + dy }
        : grp.groupId === id
          ? { ...grp, x: (groupDragCache.enclosedGroups.find(item => item.id === grp.id)?.ox ?? grp.x) + dx, y: (groupDragCache.enclosedGroups.find(item => item.id === grp.id)?.oy ?? grp.y) + dy }
          : grp
      ),
      wins: state.wins.map(w => enclosedIds.has(w.id)
        ? { ...w, x: (groupDragCache.enclosedWins.find(item => item.id === w.id)?.ox ?? w.x) + dx, y: (groupDragCache.enclosedWins.find(item => item.id === w.id)?.oy ?? w.y) + dy, groupId: w.groupId || id }
        : w
      )
      };
    });
  },
});
