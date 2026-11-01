import React from 'react';
import { useGroupTileReconcile } from './hooks/useGroupTileReconcile.js';
import { useApplyInitialWorkspace } from './hooks/useApplyInitialWorkspace.js';
import { useWindowSelection } from './hooks/useWindowSelection.js';
import { useWorkspaceStore } from '../lib/store.js';
import { Canvas } from '../components/Canvas.jsx';
import { Chrome } from '../components/Chrome.jsx';
import { MultiGroupDock } from '../components/Dock.jsx';
import { getDefaultWindowSize } from '../lib/windowManifest.js';
import { MyTodosBadge } from '../components/todos/MyTodosBadge.jsx';
import {
  getChromeWindowControlState,
  runChromeCloseAction,
  runChromeMaximizeAction,
  runChromeMinimizeAction,
} from './chromeWindowControls.js';
import { Toolbar } from './Toolbar.jsx';
import { Hud } from './Hud.jsx';
import { AgentRunToasts } from '../components/AgentRunToasts.jsx';
import { SelfFixNotice } from '../components/SelfFixNotice.jsx';
import { AppUpdateNotice, TrayUpdatePanel } from '../components/AppUpdateNotice.jsx';
import { AgentMailToasts } from '../components/AgentMailToasts.jsx'; import { AuctionMatchToasts } from '../components/AuctionMatchToasts.jsx'; import { CensaiPinnedChat } from '../components/censai/CensaiPinnedChat.jsx';
import SystemStatusWidget from '../components/status/SystemStatusWidget.jsx';
import { useAppActions } from './hooks/useAppActions.js';
import { useAppBootstrap } from './hooks/useAppBootstrap.js';
import { useAppCollaboration } from './hooks/useAppCollaboration.js';
import { useAppPresets } from './hooks/useAppPresets.js';
import { usePresetBootstrap } from './hooks/usePresetBootstrap.js';
import { useWorkspaceHistory } from './hooks/useWorkspaceHistory.js';
import { useWorkspaceDraft } from './hooks/useWorkspaceDraft.js';
import { useAppKeyboard } from './hooks/useAppKeyboard.js';
import { useGroupHotkeys } from './hooks/useGroupHotkeys.js';
import { GroupFocusBar, useGroupFocusView } from './GroupFocusBar.jsx'; import { PresentMode } from './present/PresentMode.jsx';
import { useTemplateAgents } from './hooks/useTemplateAgents.js';
import { invertBindings } from '../lib/groupHotkeys.js';
import { useSettingsWindow } from './hooks/useSettingsWindow.js';
import { Login } from '../components/Login.jsx';
import { SovereignAccessGate } from '../components/SovereignAccessGate.jsx';
import { useKeyGate } from './hooks/useKeyGate.js';
import { WorkspaceRecovery, PersistencePill, DraftRestoreBar } from '../components/WorkspaceRecovery.jsx';
import { CommentPins } from '../components/comments/CommentPins.jsx';
import { OwnerShareLayer } from '../components/guest/OwnerShareLayer.jsx';
import { BoardHistoryPanel } from '../components/history/BoardHistoryPanel.jsx';

export function AppContent() {
  const {
    initial, dataLoading, isInitialized, setIsInitialized, session, sessionChecking,
    sessionLoad, workspaceLoad, workspaceRevision, setWorkspaceRevision, retryWorkspaceLoad,
  } = useAppBootstrap();
  const keyGate = useKeyGate(session);

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
    selectedIds,
    dockOffset, setDockOffset, setDock,
    groups, setGroups,
    focusMode, setFocusMode,
    extraAgents, setExtraAgents,
    currentProject, setCurrentProject,
    workspaceId,
    pan,
    zoom,
    presets, setPresets,
    sidebarFavorites, setSidebarFavorites,
    windowAllowList, setWindowAllowList,
    // Store named actions
    createLink, deleteLink,
    fitView, jumpToNearestCluster,
    onDragAgent,
    onNewAgent, onNewTerminal, onNewHtmlPreview, onNewWindow, onNewWorkflow, onSpawnRook, onNewMailcow, onNewVex,
    openLocalProject, moveGroup, dockWindow, undockWindow, setGroupSeam, showGroupTab,
  } = useWorkspaceStore();

  const { spawnAt, spawnGroup, onUpdate, onUpdateGroup, resizeGroup, deleteWindows, onCloseGroup, onClose, createAgent } = useAppActions();
  const { saveAsPreset, loadPreset, deletePreset, saveGroupPreset, loadGroupPreset, deleteGroupPreset, setGroupDefaultPreset, autoArrangeGroup } = useAppPresets();
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
  const onPanZoom = useApplyInitialWorkspace({ initial, dataLoading, isInitialized, setIsInitialized, workspaceLoad, workspaceId, pan, zoom, spawnAt });
  useGroupTileReconcile(isInitialized);

  const windowControlState = React.useMemo(
    () => getChromeWindowControlState({ wins, activeId, focusMode }),
    [wins, activeId, focusMode]
  );
  const { onSelect: handleWindowSelect, onSelection: handleSelection } = useWindowSelection();

  const { persistence, collaboration } = useAppCollaboration({
    enabled: isInitialized && (workspaceLoad.status === 'ready' || workspaceLoad.status === 'draft_required'), workspaceId, wins,
    revision: workspaceRevision, onRevision: setWorkspaceRevision, activeId, user: session.user, selectedIds,
    holdDraft: Boolean(pendingDraft?.value),
  });
  usePresetBootstrap(session.authenticated, setPresets);

  useAppKeyboard({ onNewAgent, onNewWindow, redo, undo, setFocusMode, spawnAt });
  const { bindings: groupHotkeyBindings } = useGroupHotkeys({ workspaceId });
  useTemplateAgents();
  const groupHotkeySlotById = React.useMemo(
    () => invertBindings(groupHotkeyBindings),
    [groupHotkeyBindings]
  );
  const focusView = useGroupFocusView(collaboration.displayWins, canvasGroups);
  const chromeHidden = focusMode || focusView.active;

  if (sessionChecking) {
    return <div style={{ position: 'fixed', inset: 0, background: 'var(--canvas)', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-label)', fontSize: 'var(--text-xs)', letterSpacing: 'var(--label-tracking)', textTransform: 'var(--label-case)', color: 'var(--ink-faint)' }}>Authenticating...</div>;
  }

  if (sessionLoad.status === 'unavailable') return <WorkspaceRecovery load={sessionLoad} onRetry={retryWorkspaceLoad} />;
  if (!session.authenticated) {
    return <Login oauthConfigured={session.oauthConfigured} localSignIn={Boolean(session.localSignIn)} fromAnotherComputer={Boolean(session.fromAnotherComputer)} onLoginSuccess={() => window.location.reload()} />;
  }

  if (keyGate) return <SovereignAccessGate {...keyGate} />;

  if (dataLoading) {
    return <div style={{ position: 'fixed', inset: 0, background: 'var(--canvas)', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-label)', fontSize: 'var(--text-xs)', letterSpacing: 'var(--label-tracking)', textTransform: 'var(--label-case)', color: 'var(--ink-faint)' }}>Loading...</div>;
  }

  if (workspaceLoad.status !== 'ready' && workspaceLoad.status !== 'draft_required') {
    return <WorkspaceRecovery load={workspaceLoad} onRetry={retryWorkspaceLoad} />;
  }

  return (
    <>
      <div id="canvas-root" style={{ position: 'fixed', inset: 0 }}>
        <Canvas
          wins={focusView.wins} mountedWins={focusView.mountedWins} activeId={activeId} selectedIds={selectedIds}
          workspaceRevision={workspaceRevision}
          pan={pan} zoom={zoom} onPanZoom={onPanZoom} onFitView={fitView}
          onJumpNearestCluster={jumpToNearestCluster}
          onUpdate={onUpdate} onClose={onClose} onSelect={handleWindowSelect}
          onSelection={handleSelection} onDeleteSelected={deleteWindows}
          onSpawn={spawnAt} dockState={{ groups, offset: dockOffset }}
          canvasGroups={focusView.canvasGroups}
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
          onSetDefaultGroupPreset={setGroupDefaultPreset}
          groupHotkeySlotById={groupHotkeySlotById}
          onMoveGroup={moveGroup}
          onDockWindow={dockWindow} onUndockWindow={undockWindow}
          onSetGroupSeam={setGroupSeam} onShowGroupTab={showGroupTab}
          onRubberBand={(rect) => { const size = getDefaultWindowSize('todos');
            spawnAt('todos', { title: 'Plan', subtitle: 'rubber-banded region', items: [] },
              { x: rect.x, y: rect.y }, { w: Math.max(size.w, rect.w), h: Math.max(size.h, rect.h) });
          }}
          activeTool={activeTool} penColor={penColor} penSize={penSize} penMode={penMode}
          onRequestNewAgent={onNewAgent}
          onCreateAgent={createAgent} onWindowMovePreview={collaboration.previewWindowMove}
          onCursorMove={collaboration.sendCursor} cursors={collaboration.cursors} agentCursors={collaboration.agents}
          worldOverlay={<CommentPins zoom={zoom} />} minimapHidden={chromeHidden}
        />
      </div>
      <Chrome workspaceId={workspaceId} onOpenSharing={openSharing}
        projectName={currentProject?.name || "No project open"}
        currentProject={currentProject}
        onOpenLocalProject={openLocalProject}
        onNewAgent={onNewAgent} onNewWindow={onNewWindow} onNewWorkflow={onNewWorkflow}
        onNewTerminal={onNewTerminal}
        onNewHtmlPreview={onNewHtmlPreview} onSpawnRook={onSpawnRook} onNewMailcow={onNewMailcow} onNewVex={onNewVex}
        onSpawn={spawnAt}
        onToggleFocus={() => setFocusMode(f => !f)} focusMode={chromeHidden}
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
        groups={groups} onGroupsChange={setGroups} focusMode={chromeHidden}
        onDragAgent={onDragAgent} dockOffset={dockOffset} onMoveDock={setDockOffset}
      />

      <Hud focusMode={chromeHidden} collaboration={collaboration} />
      <AgentRunToasts collaboration={collaboration} onOpenWindow={(id) => setActiveId(id)} />
      <AgentMailToasts workspaceId={workspaceId} /><AuctionMatchToasts /><SelfFixNotice /><AppUpdateNotice /><TrayUpdatePanel /><CensaiPinnedChat workspaceId={workspaceId} />
      <SystemStatusWidget focusMode={chromeHidden} />
      <GroupFocusBar /><PresentMode workspaceId={workspaceId} /><MyTodosBadge focusMode={chromeHidden} />
      <Toolbar
        activeTool={activeTool} onSelectTool={setActiveTool}
        penColor={penColor} setPenColor={setPenColor}
        penSize={penSize} setPenSize={setPenSize}
        focusMode={chromeHidden} onAiAgent={openAiAgent}
        collaboration={collaboration} onShare={openSharing} workspaceId={workspaceId}
      />
      <OwnerShareLayer collaboration={collaboration} workspaceId={workspaceId} wins={wins} pan={pan} zoom={zoom} hidden={chromeHidden} />
      {!chromeHidden && <BoardHistoryPanel workspaceId={workspaceId} wins={wins} />}
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
