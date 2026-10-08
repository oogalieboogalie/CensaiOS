/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../Icons.jsx';
import { CommandPalette } from '../CommandPalette.jsx';
import { MODULE_MENU_MANIFESTS } from '../../lib/windowManifest.js';
import { buildAddSections, PROPS_BY_KIND } from '../../lib/modules/addPaletteItems.js';
import { fetchModuleTemplates, fetchSavedModule, fetchSavedModules } from '../../lib/modules/moduleApi.js';
import { clampModuleSize } from '../../lib/modules/moduleFormat.js';
import { moduleWindowFromSaved, newModuleWindowProps } from '../../lib/modules/moduleWindowState.js';
import { getCollaborationClientId } from '../../lib/collaboration/clientIdentity.js';
import { useWorkspaceStore } from '../../lib/store.js';

const RECENT_KEY = 'homebase.addPalette.recent.v1';

function readRecent() {
  try { return JSON.parse(window.localStorage.getItem(RECENT_KEY) || '[]').filter(x => typeof x === 'string'); } catch { return []; }
}

function rememberRecent(id) {
  const next = [id, ...readRecent().filter(x => x !== id)].slice(0, 8);
  try { window.localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* fine */ }
}

/**
 * Spec 6 Add palette: every module in one searchable list, plus "Make a new
 * module" when nothing fits. Opens from the toolbar button or Ctrl+K.
 */
export function AddPalette({ open, onClose, onSpawn }) {
  const spawnAt = useWorkspaceStore(state => state.spawnAt);
  const setActiveId = useWorkspaceStore(state => state.setActiveId);
  const [query, setQuery] = React.useState('');
  const [mode, setMode] = React.useState('search');
  const [saved, setSaved] = React.useState([]);
  const [templates, setTemplates] = React.useState([]);
  const [recent, setRecent] = React.useState(readRecent);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    if (!open) return undefined;
    setQuery('');
    setMode('search');
    setError(null);
    setRecent(readRecent());
    let cancelled = false;
    fetchSavedModules().then(list => { if (!cancelled) setSaved(list); }).catch(() => {});
    fetchModuleTemplates().then(list => { if (!cancelled) setTemplates(list); }).catch(() => {});
    return () => { cancelled = true; };
  }, [open]);

  const openModule = (props, size) => {
    const id = spawnAt?.('module', props, null, size);
    if (id) setActiveId?.(id);
    return id;
  };

  const runAction = async (item) => {
    const action = item.action || {};
    if (action.type === 'describe') { setMode('describe'); setQuery(''); return; }
    if (action.type === 'noop') return;
    rememberRecent(item.id);
    if (action.type === 'spawn') onSpawn?.(action.kind, PROPS_BY_KIND[action.kind] || {});
    if (action.type === 'make') openModule(newModuleWindowProps(action.request, getCollaborationClientId()), { w: 440, h: 520 });
    if (action.type === 'template') {
      const t = templates.find(x => x.id === action.id);
      if (t) openModule(moduleWindowFromSaved({ name: t.manifest.name, request: t.request, manifest: t.manifest, source: t.source }), clampModuleSize(t.manifest.size));
    }
    if (action.type === 'saved') {
      try {
        const m = await fetchSavedModule(action.id);
        openModule(moduleWindowFromSaved({ name: m.name, request: m.request, manifest: m.manifest, source: m.source, libraryId: m.id }), clampModuleSize(m.manifest?.size));
      } catch (err) {
        setError(err.message);
      }
    }
  };

  const sections = React.useMemo(() => buildAddSections({
    query, mode, recent, saved, templates, manifests: MODULE_MENU_MANIFESTS,
  }).map(section => ({
    ...section,
    items: section.items.map(item => {
      const Glyph = Icon[item.icon] || Icon.NewWindow;
      return { ...item, icon: <Glyph size={14} />, onSelect: () => runAction(item) };
    }),
  })), [query, mode, recent, saved, templates]);

  return (
    <CommandPalette
      open={open}
      onClose={onClose}
      query={query}
      onQueryChange={setQuery}
      sections={sections}
      placeholder={mode === 'describe' ? 'Describe the module: a board that tracks my listings by stage…' : 'Add a module, or describe a new one'}
      footer={error ? <span style={{ color: 'var(--danger)' }}>{error}</span> : (
        <>
          <span><span className="hb-kbd">Enter</span> add</span>
          <span><span className="hb-kbd">Up</span> <span className="hb-kbd">Down</span> move</span>
          <span><span className="hb-kbd">Esc</span> close</span>
          <span style={{ marginLeft: 'auto' }}>Modules on/off: Settings</span>
        </>
      )}
    />
  );
}
