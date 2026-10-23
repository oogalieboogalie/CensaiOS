/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { WindowTitle } from './Windows.jsx';
import { Icon } from './Icons.jsx';
import { WindowChromeContext } from './windows/windowChromeContext.js';
import { useWorkspaceStore } from '../lib/store.js';
import { getModuleGrants } from '../lib/modules/moduleGrants.js';
import { versionPatch } from '../lib/modules/moduleWindowState.js';
import { saveModuleToLibrary } from '../lib/modules/moduleApi.js';
import { downloadModuleFile } from '../lib/modules/moduleExport.js';
import { useModuleBuild } from './modules/useModuleBuild.js';
import { useThemeTokens } from './modules/useModuleBridge.js';
import { ModuleBuilding } from './modules/ModuleBuilding.jsx';
import { ModuleRuntime } from './modules/ModuleRuntime.jsx';
import { ModuleEditPanel } from './modules/ModuleEditPanel.jsx';
import { ModulePublishSheet } from './modules/ModulePublishSheet.jsx';
import { ModulePromoteSheet } from './modules/ModulePromoteSheet.jsx';
import { fetchSellerStatus } from '../lib/marketplace/moduleListingsApi.js';
import { browserListingChanged } from '../lib/marketplace/moduleCard.js';

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
  const [saveState, setSaveState] = React.useState(null);
  const [sheet, setSheet] = React.useState(null); // 'publish' | 'promote'
  const [seller, setSeller] = React.useState(null);
  const [listingChanged, setListingChanged] = React.useState(false);

  const ready = win.status === 'ready' && Boolean(win.source);
  const IconGlyph = Icon[win.manifest?.icon] || Icon.Toolbox;
  // The panel grows the window instead of squeezing the module.
  const togglePanel = () => {
    const open = !panelOpen;
    setPanelOpen(open);
    const w = Number(win.w) || 440;
    onUpdate({ w: open ? w + EDIT_PANEL_WIDTH : Math.max(280, w - EDIT_PANEL_WIDTH) });
  };

  // Publishing and promoting are the owner's; others never see the menu items.
  React.useEffect(() => {
    if (!ready) return undefined;
    let cancelled = false;
    fetchSellerStatus().then(s => { if (!cancelled) setSeller(s); }).catch(() => {});
    return () => { cancelled = true; };
  }, [ready]);

  // A listed module that was edited since no longer matches its signed fingerprint.
  React.useEffect(() => {
    if (!win.listingId || !win.listingFingerprint || !ready) { setListingChanged(false); return undefined; }
    let cancelled = false;
    browserListingChanged(win).then(changed => { if (!cancelled) setListingChanged(Boolean(changed)); });
    return () => { cancelled = true; };
  }, [win.listingId, win.listingFingerprint, win.source, win.manifest, ready]);

  const openMarketplace = () => {
    setSheet(null);
    useWorkspaceStore.getState().spawnAt?.('marketplace', { tab: 'module' });
  };

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
        subtitle={ready ? (win.listingId ? (listingChanged ? 'Changed since listing' : 'Listed') : 'Module') : undefined}
        actions={ready ? [
          { id: 'edit', label: 'Edit', icon: <Icon.Edit size={13} />, pressed: panelOpen, onSelect: togglePanel },
        ] : undefined}
        menu={ready ? [
          { id: 'save', label: win.libraryId ? 'Update in My modules' : 'Save to My modules', icon: <Icon.Download size={13} />, onSelect: save },
          { id: 'export', label: 'Export as file', icon: <Icon.Files size={13} />, onSelect: () => downloadModuleFile(win, tokens) },
          seller?.canSell && { id: 'publish', label: win.listingId ? 'Update marketplace listing' : 'Publish to marketplace', icon: <Icon.ShoppingBag size={13} />, onSelect: () => setSheet('publish') },
          seller?.owner && { id: 'promote', label: 'Promote to built-in window', icon: <Icon.NewWindow size={13} />, onSelect: () => setSheet('promote') },
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
              <ModuleRuntime win={win} onUpdate={onUpdate} workspaceId={wsId} tokens={tokens} isActive={isActive} title={win.manifest?.name}>
                {build.editing && <div className="hb-module-progress" data-edge="top" role="progressbar" aria-label="Applying change" />}
              </ModuleRuntime>
              {sheet === 'publish' && <ModulePublishSheet win={win} onUpdate={onUpdate} onClose={() => setSheet(null)} onOpenMarketplace={openMarketplace} />}
              {sheet === 'promote' && <ModulePromoteSheet win={win} onClose={() => setSheet(null)} />}
            </>
          )}
        </div>
        {ready && panelOpen && (
          <ModuleEditPanel win={win} build={build} grants={getModuleGrants(win.id)} onRestore={restore}
            onSave={save} onExport={() => downloadModuleFile(win, tokens)} saveState={saveState} />
        )}
      </div>
    </>
  );
}
