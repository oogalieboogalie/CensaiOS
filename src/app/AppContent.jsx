import React from 'react';
import { useWorkspaceStore } from '../lib/store.js';
import { Canvas } from '../components/Canvas.jsx';
import { Chrome } from '../components/Chrome.jsx';
import { MultiGroupDock, DEFAULT_GROUPS } from '../components/Dock.jsx';
import { Icon } from '../components/Icons.jsx';
import { inferLayout, cleanLayout, fitGroupToLayout, getGroupInnerBounds, makeGroupBoundsForWindows } from '../lib/layoutAlgo.js';
import { MIN_ZOOM, computeFitView, clusterWindows, boundsForItems, computeFitBounds } from '../lib/canvasMath.js';
import { getCanvasObjectType, legacyKindForCanvasType } from '../lib/canvasObjectTypes.js';
import { DEFAULT_WINDOW_SIZES, getDefaultWindowSize } from '../lib/windowManifest.js';
import { withoutUnsupportedWindows, randomDropSpot, DEFAULT_HTML_PREVIEW } from '../lib/appUtils.js';
import { applyAllowListToInitial } from '../lib/workspace/allowList.js';
import {
  getChromeWindowControlState,
  runChromeCloseAction,
  runChromeMaximizeAction,
  runChromeMinimizeAction,
} from './chromeWindowControls.js';
import { Toolbar } from './Toolbar.jsx';
import { Hud } from './Hud.jsx';
import { AgentRunToasts } from '../components/AgentRunToasts.jsx';
import { AgentMailToasts } from '../components/AgentMailToasts.jsx';
import { AgentMessenger } from '../components/messenger/AgentMessenger.jsx';
import SystemStatusWidget from '../components/status/SystemStatusWidget.jsx';
import { useAppActions } from './hooks/useAppActions.js';
import { useAppBootstrap } from './hooks/useAppBootstrap.js';
import { useAppCollaboration } from './hooks/useAppCollaboration.js';
import { useAppPresets } from './hooks/useAppPresets.js';
import { usePresetBootstrap } from './hooks/usePresetBootstrap.js';
import { useWorkspaceHistory } from './hooks/useWorkspaceHistory.js';
import { useWorkspaceDraft } from './hooks/useWorkspaceDraft.js';
import { useAppKeyboard } from './hooks/useAppKeyboard.js';
import { useSettingsWindow } from './hooks/useSettingsWindow.js';
import { Login } from '../components/Login.jsx';
import { SovereignAccessGate } from '../components/SovereignAccessGate.jsx';
import { shouldShowSovereignAccessGate } from '../lib/sovereignAccess.js';
import { WorkspaceRecovery, PersistencePill, DraftRestoreBar } from '../components/WorkspaceRecovery.jsx';

export function AppContent() {
  const {
    initial, dataLoading, isInitialized, setIsInitialized, session, sessionChecking,
    sessionLoad, workspaceLoad, workspaceRevision, setWorkspaceRevision, retryWorkspaceLoad,
  } = useAppBootstrap();
  const [sovereignUnlocked, setSovereignUnlocked] = React.useState(false);
  const unlockSovereignAccess = React.useCallback(() => setSovereignUnlocked(true), []);

  const {
    wins, setWins,
    canvasGroups, setCanvasGroups,
    paths, setPaths,
    links, setLinks,
    activeTool, setActiveTool,
    penColor, setPenColor,
    penSize, setPenSize,
    penMode, setPenMode,
    activeId, setActiveId,
    selectedIds, setSelectedIds,
    dockOffset, setDockOffset, setDock,
    groups, setGroups,
    focusMode, setFocusMode,
    extraAgents, setExtraAgents,
    currentProject, setCurrentProject,
    workspaceId, setWorkspaceId,
    pan, setPan,
    zoom, setZoom,
    presets, setPresets,
    sidebarFavorites, setSidebarFavorites,
    windowAllowList, setWindowAllowList,
    // Store named actions
    createLink, deleteLink,
    fitView, jumpToNearestCluster,
    onDragAgent,
    onNewAgent, onNewTerminal, onNewHtmlPreview, onNewWindow, onNewWorkflow, onSpawnRook, onNewMailcow, onNewVex,
    openLocalProject, moveGroup
  } = useWorkspaceStore();

  const { spawnAt, spawnGroup, onUpdate, onUpdateGroup, resizeGroup, deleteWindows, onCloseGroup, onClose, createAgent } = useAppActions();
  const { saveAsPreset, loadPreset, deletePreset, saveGroupPreset, loadGroupPreset, deleteGroupPreset, autoArrangeGroup } = useAppPresets();
  const { undo, redo } = useWorkspaceHistory(isInitialized);
  const openSettings = useSettingsWindow({ wins, spawnAt, setActiveId, onUpdate });
  const openSharing = React.useCallback(() => openSettings('sharing'), [openSettings]);
  // Multitool dock AI button: focus the existing Censai chat or spawn one.
  const openAiAgent = React.useCallback(() => {
    const existing = wins.find((w) => w.kind === 'chat' || w.type === 'chat');
    if (existing) { setActiveId(existing.id); return; }
    spawnAt('chat', { agentId: 'censai', title: 'Censai' });
  }, [wins, spawnAt, setActiveId]);

  const { pendingDraft, restoreDraft, discardDraft, downloadDraft } = useWorkspaceDraft({
    workspaceLoad, windowAllowList, setWindowAllowList, setWins, setCanvasGroups,
    setPaths, setLinks, setPenColor, setPenSize, setPenMode, setDockOffset, setDock,
    setGroups, setFocusMode, setExtraAgents, setSidebarFavorites,
  });
  React.useEffect(() => {
    if (initial && !dataLoading && !isInitialized) {
      // Brief B1 — apply migrated window allow-list (single helper).
      const { wins: gatedWins, windowAllowList: appliedAllowList } = applyAllowListToInitial(initial, windowAllowList);
      setWindowAllowList(appliedAllowList);
      const safeWins = withoutUnsupportedWindows(gatedWins);
      setWins(safeWins);
      setCanvasGroups(initial.canvasGroups || []);
      setPaths(initial.paths || []);
      setLinks(initial.links || []);
      if (initial.penColor) setPenColor(initial.penColor);
      if (initial.penSize) setPenSize(initial.penSize); setWorkspaceId(initial.workspaceId || workspaceLoad.workspaceId || crypto.randomUUID());
      setPenMode(Boolean(initial.penMode));
      setDockOffset(initial.dockOffset || 0); setDock(initial.dock || { visible: false, groupOverrides: {} });
      setGroups(initial.groups || DEFAULT_GROUPS);
      setFocusMode(initial.focusMode || false);
      setExtraAgents(initial.extraAgents || []); setSidebarFavorites(initial.sidebarFavorites || []);

      const fit = computeFitView(safeWins, initial.canvasGroups || []);
      setPan({ x: fit.x, y: fit.y });
      setZoom(fit.zoom);
      // Brief B2 — auto-launch the marketplace when the user has zero enabled windows (the marketplace itself is always allowed, so this only fires for fully-empty workspaces).
      if (appliedAllowList && !Object.values(appliedAllowList).some(Boolean)) setTimeout(() => spawnAt('marketplace'), 0);
      const id = requestAnimationFrame(() => setIsInitialized(true));
      return () => cancelAnimationFrame(id);
    }
  }, [initial, dataLoading, isInitialized, spawnAt]);

  const onPanZoom = React.useCallback(({ panX, panY, zoom: z }) => {
    setPan({ x: panX, y: panY });
    setZoom(z);
  }, []);

  const windowControlState = React.useMemo(
    () => getChromeWindowControlState({ wins, activeId, focusMode }),
    [wins, activeId, focusMode]
  );
  const handleWindowSelect = React.useCallback((id, event) => {
    if (!id) {
      setActiveId(null);
      setSelectedIds([]);
      return;
    }
    const toggle = Boolean(event?.metaKey || event?.ctrlKey || event?.shiftKey);
    setActiveId(id);
    setSelectedIds((current) => {
      if (!toggle) return [id];
      return current.includes(id)
        ? current.filter((selectedId) => selectedId !== id)
        : [...current, id];
    });
  }, [setActiveId, setSelectedIds]);
  const handleSelection = React.useCallback((ids) => {
    setSelectedIds(ids);
    setActiveId(ids.at(-1) || null);
  }, [setActiveId, setSelectedIds]);

  const { persistence, collaboration } = useAppCollaboration({
    enabled: isInitialized && (workspaceLoad.status === 'ready' || workspaceLoad.status === 'draft_required'), workspaceId, wins,
    revision: workspaceRevision, onRevision: setWorkspaceRevision, activeId,
  });
  usePresetBootstrap(session.authenticated, setPresets);

  useAppKeyboard({ onNewAgent, onNewWindow, redo, undo, setFocusMode, spawnAt });

  if (sessionChecking) {
    return <div style={{ position: 'fixed', inset: 0, background: 'var(--canvas)', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Authenticating...</div>;
  }

  if (sessionLoad.status === 'unavailable') return <WorkspaceRecovery load={sessionLoad} onRetry={retryWorkspaceLoad} />;
  if (!session.authenticated) {
    return <Login oauthConfigured={session.oauthConfigured} onLoginSuccess={() => window.location.reload()} />;
  }

  if (shouldShowSovereignAccessGate(session, sovereignUnlocked)) {
    return <SovereignAccessGate onConfigured={unlockSovereignAccess} />;
  }

  if (dataLoading) {
    return <div style={{ position: 'fixed', inset: 0, background: 'var(--canvas)', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Loading...</div>;
  }

  if (workspaceLoad.status !== 'ready' && workspaceLoad.status !== 'draft_required') {
    return <WorkspaceRecovery load={workspaceLoad} onRetry={retryWorkspaceLoad} />;
  }

  return (
    <>
      <div id="canvas-root" style={{ position: 'fixed', inset: 0 }}>
        <Canvas
          wins={collaboration.displayWins} activeId={activeId} selectedIds={selectedIds}
          workspaceRevision={workspaceRevision}
          pan={pan} zoom={zoom} onPanZoom={onPanZoom} onFitView={fitView}
          onJumpNearestCluster={jumpToNearestCluster}
          onUpdate={onUpdate} onClose={onClose} onSelect={handleWindowSelect}
          onSelection={handleSelection} onDeleteSelected={deleteWindows}
          onSpawn={spawnAt} dockState={{ groups, offset: dockOffset }}
          canvasGroups={canvasGroups}
          paths={paths} setPaths={setPaths}
          links={links} onLinkCreate={createLink}
          onLinkDelete={deleteLink}
          currentProject={currentProject}
          onSpawnGroup={spawnGroup}
          onUpdateGroup={onUpdateGroup}
          onResizeGroup={resizeGroup}
          onCloseGroup={onCloseGroup}
          onAutoArrangeGroup={autoArrangeGroup}
          onSaveGroupPreset={saveGroupPreset}
          onLoadGroupPreset={loadGroupPreset}
          onDeleteGroupPreset={deleteGroupPreset}
          onMoveGroup={moveGroup}
          onRubberBand={(rect) => { const size = getDefaultWindowSize('todos');
            spawnAt('todos', { title: 'Plan', subtitle: 'rubber-banded region', items: [] },
              { x: rect.x, y: rect.y }, { w: Math.max(size.w, rect.w), h: Math.max(size.h, rect.h) });
          }}
          activeTool={activeTool} penColor={penColor} penSize={penSize} penMode={penMode}
          onRequestNewAgent={onNewAgent}
          onCreateAgent={createAgent} onWindowMovePreview={collaboration.previewWindowMove}
          onCursorMove={collaboration.sendCursor} cursors={collaboration.cursors}
        />
      </div>
      <Chrome
        projectName={currentProject?.name || "No project open"}
        currentProject={currentProject}
        onOpenLocalProject={openLocalProject}
        onNewAgent={onNewAgent} onNewWindow={onNewWindow} onNewWorkflow={onNewWorkflow}
        onNewTerminal={onNewTerminal}
        onNewHtmlPreview={onNewHtmlPreview} onSpawnRook={onSpawnRook} onNewMailcow={onNewMailcow} onNewVex={onNewVex}
        onSpawn={spawnAt}
        onToggleFocus={() => setFocusMode(f => !f)} focusMode={focusMode}
        penMode={penMode}
        onTogglePenMode={() => setPenMode(p => !p)}
        onOpenSettings={openSettings}
        presets={presets}
        onSaveAsPreset={saveAsPreset}
        onLoadPreset={loadPreset}
        onDeletePreset={deletePreset}
        windowControlState={windowControlState}
        onMin={() => runChromeMinimizeAction({ wins, activeId, onUpdate })}
        onMax={() => runChromeMaximizeAction({
          wins,
          activeId,
          onUpdate,
          onToggleFocus: () => setFocusMode((f) => !f),
        })}
        onClose={() => runChromeCloseAction({ activeId, onClose })}
      />
      <MultiGroupDock
        groups={groups} onGroupsChange={setGroups} focusMode={focusMode}
        onDragAgent={onDragAgent} dockOffset={dockOffset} onMoveDock={setDockOffset}
      />

      <Hud focusMode={focusMode} collaboration={collaboration} onShare={openSharing} />
      <AgentRunToasts collaboration={collaboration} onOpenWindow={(id) => setActiveId(id)} />
      <AgentMailToasts workspaceId={workspaceId} />
      <AgentMessenger />
      <SystemStatusWidget focusMode={focusMode} />
      <Toolbar
        activeTool={activeTool} onSelectTool={setActiveTool}
        penColor={penColor} setPenColor={setPenColor}
        penSize={penSize} setPenSize={setPenSize}
        focusMode={focusMode} onAiAgent={openAiAgent}
      />
      <PersistencePill persistence={persistence} />
      {pendingDraft?.value && (
        <DraftRestoreBar
          savedAt={pendingDraft.savedAt ? new Date(pendingDraft.savedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}
          onRestore={restoreDraft}
          onDownload={downloadDraft}
          onDiscard={discardDraft}
        />
      )}
    </>
  );
}
