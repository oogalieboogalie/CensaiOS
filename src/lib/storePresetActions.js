import { api } from './api.js';
import { addAgent, getAgentById } from './agentStore.js';
import { withoutUnsupportedWindows } from './appUtils.js';
import { computeFitView } from './canvasMath.js';
import { applyPreset, fitGroupToLayout, getGroupInnerBounds, cleanLayout } from './layoutAlgo.js';

export const createPresetActions = (set, get) => ({
  saveAsPreset: async (rawName) => {
    const { wins, canvasGroups, paths, links, groups, dockOffset, extraAgents, pan, zoom, presets } = get();
    const name = (rawName || '').trim() || `Preset ${new Date().toLocaleString()}`;
    const preset = {
      id: crypto.randomUUID(),
      name,
      createdAt: new Date().toISOString(),
      wins: withoutUnsupportedWindows(wins),
      canvasGroups,
      paths,
      links,
      groups,
      dockOffset,
      extraAgents,
      pan,
      zoom,
    };
    const next = [preset, ...presets.filter(p => p.id !== preset.id)];
    try {
      await api.savePresets(next);
      set({ presets: next });
    } catch (err) {
      console.error('Failed to save preset', err);
      if (typeof window !== 'undefined') window.alert('Preset was not saved.');
    }
  },

  loadPreset: (presetId) => {
    const { presets, wins, canvasGroups } = get();
    const preset = presets.find(p => p.id === presetId);
    if (!preset) return;
    const safeWins = withoutUnsupportedWindows(preset.wins || []);
    const hasContent = wins.length > 0 || canvasGroups.length > 0;
    if (hasContent && typeof window !== 'undefined' && !window.confirm(`Replace current workspace with "${preset.name}"?`)) return;
    
    (preset.extraAgents || []).forEach(a => { if (!getAgentById(a.id)) addAgent(a); });
    set({
      wins: safeWins,
      canvasGroups: preset.canvasGroups || [],
      paths: preset.paths || [],
      links: preset.links || [],
      activeId: null
    });
    if (preset.groups) set({ groups: preset.groups });
    if (typeof preset.dockOffset === 'number') set({ dockOffset: preset.dockOffset });
    if (preset.extraAgents) set({ extraAgents: preset.extraAgents });
    
    if (preset.pan && typeof preset.zoom === 'number') {
      set({ pan: preset.pan, zoom: preset.zoom });
    } else {
      const fit = computeFitView(safeWins, preset.canvasGroups || []);
      set({ pan: { x: fit.x, y: fit.y }, zoom: fit.zoom });
    }
  },

  deletePreset: async (presetId) => {
    const { presets } = get();
    const preset = presets.find(p => p.id === presetId);
    if (!preset) return;
    if (typeof window !== 'undefined' && !window.confirm(`Delete preset "${preset.name}"?`)) return;
    const next = presets.filter(p => p.id !== presetId);
    try {
      await api.savePresets(next, { allowEmpty: true });
      set({ presets: next });
    } catch (err) {
      console.error('Failed to delete preset', err);
    }
  },

  snapshotGroup: (groupId, name) => {
    const { wins, canvasGroups } = get();
    const g = canvasGroups.find(x => x.id === groupId);
    if (!g) return null;
    const inside = wins.filter(w => {
      const cx = w.x + w.w / 2;
      const cy = w.y + w.h / 2;
      return cx >= g.x && cx <= g.x + g.w && cy >= g.y && cy <= g.y + g.h;
    });
    return {
      id: crypto.randomUUID(),
      name,
      createdAt: new Date().toISOString(),
      groupBox: { x: g.x, y: g.y, w: g.w, h: g.h },
      root: g.root || null,
      presetId: g.presetId || null,
      // Store window rects relative to the group origin so loading the
      // preset later restores the layout where the group currently is
      // instead of teleporting everything back to the absolute position
      // from when the snapshot was taken. Absolute x/y are kept as a
      // fallback for legacy snapshots.
      windows: inside.map(w => ({ id: w.id, dx: w.x - g.x, dy: w.y - g.y, x: w.x, y: w.y, w: w.w, h: w.h })),
    };
  },

  saveGroupPreset: (groupId, rawName) => {
    const { snapshotGroup } = get();
    const name = (rawName || '').trim() || `Layout ${new Date().toLocaleTimeString()}`;
    const snap = snapshotGroup(groupId, name);
    if (!snap) return;
    set(state => ({
      canvasGroups: state.canvasGroups.map(g => g.id === groupId
        ? { ...g, presets: [snap, ...((g.presets || []).filter(p => p.name !== name))] }
        : g
      )
    }));
  },

  loadGroupPreset: (groupId, presetId) => {
    const { canvasGroups } = get();
    const g = canvasGroups.find(x => x.id === groupId);
    if (!g) return;
    const preset = (g.presets || []).find(p => p.id === presetId);
    if (!preset) return;
    // Restore window rects relative to the group's current position so the
    // group doesn't teleport back to where it was when the preset was saved.
    // Only the group's size is restored, never its x/y.
    const sizePatch = preset.groupBox ? { w: preset.groupBox.w, h: preset.groupBox.h } : {};
    set(state => ({
      wins: state.wins.map(w => {
        const saved = (preset.windows || []).find(sw => sw.id === w.id);
        if (!saved) return w;
        const baseX = typeof saved.dx === 'number' ? g.x + saved.dx : saved.x;
        const baseY = typeof saved.dy === 'number' ? g.y + saved.dy : saved.y;
        return { ...w, x: baseX, y: baseY, w: saved.w, h: saved.h, groupId };
      }),
      canvasGroups: state.canvasGroups.map(grp => grp.id === groupId
        ? { ...grp, ...sizePatch, root: preset.root ?? grp.root ?? null, presetId: preset.presetId ?? grp.presetId }
        : grp
      )
    }));
  },

  deleteGroupPreset: (groupId, presetId) => {
    set(state => ({
      canvasGroups: state.canvasGroups.map(g => g.id === groupId
        ? { ...g, presets: (g.presets || []).filter(p => p.id !== presetId) }
        : g
      )
    }));
  },

  autoArrangeGroup: (groupId, presetId = 'SEMANTIC_WORKSPACE') => {
    const { wins, canvasGroups, snapshotGroup } = get();
    const g = canvasGroups.find(x => x.id === groupId);
    if (!g) return;
    const inside = wins.filter(w => {
      const cx = w.x + w.w / 2;
      const cy = w.y + w.h / 2;
      return cx >= g.x && cx <= g.x + g.w && cy >= g.y && cy <= g.y + g.h;
    });
    if (inside.length === 0) return;

    const undoSnap = snapshotGroup(groupId, 'Before auto-arrange');
    const root = applyPreset(presetId, inside);
    if (!root) return;
    const fittedGroup = fitGroupToLayout(g, root);
    const updates = cleanLayout(root, getGroupInnerBounds(fittedGroup));

    set(state => ({
      wins: state.wins.map(w => {
        const up = updates.find(u => u.id === w.id);
        return up ? { ...w, ...up.patch } : w;
      }),
      canvasGroups: state.canvasGroups.map(grp => grp.id === groupId
        ? { ...grp, ...fittedGroup, root, presetId, presets: [undoSnap, ...((grp.presets || []).filter(p => p.name !== 'Before auto-arrange'))] }
        : grp
      )
    }));
  },
});
