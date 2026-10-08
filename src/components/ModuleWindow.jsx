/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { WindowTitle } from './Windows.jsx';
import { Icon } from './Icons.jsx';
import { WindowChromeContext } from './windows/windowChromeContext.js';
import { useWorkspaceStore } from '../lib/store.js';
import { getModuleGrants, pendingPermissions, setModuleGrant } from '../lib/modules/moduleGrants.js';
import { versionPatch } from '../lib/modules/moduleWindowState.js';
import { saveModuleToLibrary } from '../lib/modules/moduleApi.js';
import { downloadModuleFile } from '../lib/modules/moduleExport.js';
import { useModuleBuild } from './modules/useModuleBuild.js';
import { useThemeTokens } from './modules/useModuleBridge.js';
import { ModuleBuilding } from './modules/ModuleBuilding.jsx';
import { ModuleFrame } from './modules/ModuleFrame.jsx';
import { ModuleEditPanel } from './modules/ModuleEditPanel.jsx';
import { ModulePermissionBar } from './modules/ModulePermissionBar.jsx';

/**
 * Spec 6: a module someone asked for in plain language. It runs in a
 * sandboxed iframe, matches the theme, keeps its data on the canvas (so
 * everyone sees the same thing), and changes in place from the Edit panel.
 */
const EDIT_PANEL_WIDTH = 280;

export function ModuleWindow({ win, onUpdate, workspaceId }) {
  const chrome = React.useContext(WindowChromeContext);
  const isActive = chrome?.isActive ?? true;
  const activeWorkspaceId = useWorkspaceStore(state => state.workspaceId);
  const wsId = workspaceId ?? activeWorkspaceId;
  const build = useModuleBuild({ win, onUpdate, workspaceId: wsId });
  const tokens = useThemeTokens();
  const [panelOpen, setPanelOpen] = React.useState(false);
  const [grants, setGrants] = React.useState(() => getModuleGrants(win.id));
  const [asking, setAsking] = React.useState(null); // permission waiting on the person
  const [toasts, setToasts] = React.useState([]);
  const [scriptError, setScriptError] = React.useState(null);
  const [saveState, setSaveState] = React.useState(null);

  const ready = win.status === 'ready' && Boolean(win.source);
  const IconGlyph = Icon[win.manifest?.icon] || Icon.Toolbox;
  // The panel grows the window instead of squeezing the module.
  const togglePanel = () => {
    const open = !panelOpen;
    setPanelOpen(open);
    const w = Number(win.w) || 440;
    onUpdate({ w: open ? w + EDIT_PANEL_WIDTH : Math.max(280, w - EDIT_PANEL_WIDTH) });
  };

  React.useEffect(() => { setScriptError(null); }, [win.source]);

  const pendingAsk = React.useRef(null);
  const decide = React.useCallback((permission, allow) => {
    setGrants(setModuleGrant(win.id, permission, allow));
    if (pendingAsk.current?.permission === permission) {
      pendingAsk.current.resolve(allow);
      pendingAsk.current = null;
    }
    setAsking(null);
  }, [win.id]);

  const requestPermission = React.useCallback((permission) => new Promise((resolve) => {
    pendingAsk.current?.resolve(false);
    pendingAsk.current = { permission, resolve };
    setAsking(permission);
  }), []);

  // Network is part of the sandbox's CSP, so it is asked up front.
  const upfront = ready ? pendingPermissions(win.manifest, grants).filter(p => p === 'network') : [];
  const askingFor = asking || upfront[0] || null;

  const onToast = React.useCallback((message) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(list => [...list.slice(-2), { id, message }]);
    setTimeout(() => setToasts(list => list.filter(t => t.id !== id)), 2600);
  }, []);

  const save = async () => {
    setSaveState('saving');
    try {
      const saved = await saveModuleToLibrary({ id: win.libraryId, request: win.request, manifest: win.manifest, source: win.source });
      if (saved?.id && saved.id !== win.libraryId) onUpdate({ libraryId: saved.id });
      setSaveState('saved');
      setTimeout(() => setSaveState(s => (s === 'saved' ? null : s)), 2000);
    } catch (error) {
      setSaveState(error.message || 'Could not save.');
    }
  };

  const restore = (index) => {
    const patch = versionPatch(win, index);
    if (patch) onUpdate(patch);
  };

  return (
    <>
      <WindowTitle
        icon={<IconGlyph size={14} />}
        label={ready ? (win.manifest?.name || win.title) : (win.title || 'Building module')}
        subtitle={ready ? 'Module' : undefined}
        actions={ready ? [
          { id: 'edit', label: 'Edit', icon: <Icon.Edit size={13} />, pressed: panelOpen, onSelect: togglePanel },
        ] : undefined}
        menu={ready ? [
          { id: 'save', label: win.libraryId ? 'Update in My modules' : 'Save to My modules', icon: <Icon.Download size={13} />, onSelect: save },
          { id: 'export', label: 'Export as file', icon: <Icon.Files size={13} />, onSelect: () => downloadModuleFile(win, tokens) },
          { id: 'rebuild', label: 'Rebuild from request', icon: <Icon.Refresh size={13} />, onSelect: build.retry },
        ] : undefined}
      />
      <div className="hb-module" data-module-window data-module-status={win.status || 'building'}>
        <div className="hb-module-stage">
          {!ready ? (
            <ModuleBuilding win={win} preview={build.preview} stalled={build.stalled} onRetry={build.retry}
              onCancel={build.ownsBuild ? build.cancel : undefined} />
          ) : (
            <>
              <ModulePermissionBar permission={askingFor} onDecide={decide} />
              {build.editing && <div className="hb-module-progress" data-edge="top" role="progressbar" aria-label="Applying change" />}
              <ModuleFrame
                win={win}
                onUpdate={onUpdate}
                workspaceId={wsId}
                tokens={tokens}
                grants={grants}
                requestPermission={requestPermission}
                onToast={onToast}
                onScriptError={setScriptError}
                title={win.manifest?.name}
              />
              {/* Unselected, the iframe would swallow the click that selects the window. */}
              {!isActive && <div className="hb-module-shield" data-module-shield aria-hidden="true" />}
              {scriptError && <div className="hb-module-script-error" role="status">Script error: {scriptError}</div>}
              <div className="hb-module-toasts" aria-live="polite">
                {toasts.map(t => <div key={t.id} className="hb-module-toast" data-module-toast>{t.message}</div>)}
              </div>
            </>
          )}
        </div>
        {ready && panelOpen && (
          <ModuleEditPanel win={win} build={build} grants={grants} onRestore={restore}
            onSave={save} onExport={() => downloadModuleFile(win, tokens)} saveState={saveState} />
        )}
      </div>
    </>
  );
}
