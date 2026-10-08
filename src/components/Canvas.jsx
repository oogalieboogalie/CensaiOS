import React from 'react';
import { CanvasWires } from './canvas/CanvasWires.jsx';
import { CanvasMarks, EmptyState } from './canvas/CanvasEmptyState.jsx';
import { CanvasDrawingLayer } from './canvas/CanvasDrawingLayer.jsx';
import { CanvasWindows } from './canvas/CanvasWindowLayers.jsx';
import { CanvasGroupsLayer, CanvasGroupCards } from './canvas/CanvasGroupsLayer.jsx';
import { CanvasDockOverlay } from './canvas/CanvasDockOverlay.jsx';
import { useCanvasGroupChrome } from './canvas/useCanvasGroupChrome.js';
import { CanvasRegionActions } from './canvas/CanvasRegionActions.jsx';
import { CanvasRubberBand } from './canvas/CanvasRubberBand.jsx';
import { CanvasShell } from './canvas/CanvasShell.jsx';
import { useCanvasCapture } from './canvas/useCanvasCapture.js';
import { useCanvasPointer } from './canvas/useCanvasPointer.js';
import { useCanvasViewport } from './canvas/useCanvasViewport.js';
import { useCanvasWorkspaceHandlers } from './canvas/useCanvasWorkspaceHandlers.js';
import { useCanvasZoomControls } from './canvas/useCanvasZoomControls.js';
import { ZoomHud } from './canvas/CanvasZoomHud.jsx';
import { CanvasCursors } from './canvas/CanvasCursors.jsx';
import { useTheme } from './Theme.jsx';
import { CanvasSelectionOutline } from './canvas/CanvasSelectionOutline.jsx';
import { CanvasInkActions } from './canvas/CanvasInkActions.jsx';
import { useLiveInk } from './canvas/useLiveInk.js';
import { getWindowBounds } from '../lib/layoutAlgo.js';
import { isPointInRect, screenToCanvas } from '../lib/canvasMath.js';

export function Canvas({ wins, activeId, selectedIds = [], workspaceRevision, onUpdate, onClose, onSelect, onSelection, onDeleteSelected, onSpawn, onRubberBand, onRequestNewAgent, onCreateAgent, onWindowMovePreview, onCursorMove, cursors = {}, dockState, pan, zoom, onPanZoom, onFitView, onJumpNearestCluster, canvasGroups = [], onSpawnGroup, onUpdateGroup, onResizeGroup, onCloseGroup, onMoveGroup, onAutoArrangeGroup, onDockWindow, onUndockWindow, onSetGroupSeam, onShowGroupTab, onSaveGroupPreset, onLoadGroupPreset, onDeleteGroupPreset, onSetDefaultGroupPreset, paths = [], setPaths, links = [], onLinkCreate, onLinkDelete, currentProject = null, activeTool, penColor, penSize, penMode = false, groupHotkeySlotById = {}, inkActions = true, pinnedRailOffset = { top: 24,
left: 24 }, suppressEmptyState = false, onLaunchpadTour, launchpadSuggestModules, launchpadChipKinds, worldOverlay = null }) {
  const ref = React.useRef(null);
  const themeContext = useTheme();
  const theme = themeContext?.theme || { canvasPanMode: 'both' };
  const [region, setRegion] = React.useState(null);
  const [wireDrag, setWireDrag] = React.useState(null);
  const { spaceHeld, spaceRef } = useCanvasViewport({ ref, pan, zoom, onPanZoom, panMode: theme.canvasPanMode });
  const liveInk = useLiveInk(paths);
  const {
    band,
    setBand,
    ink,
    currentPath,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    isPanning,
    consumeContextMenuSuppression,
  } = useCanvasPointer({
    ref, pan, zoom, onPanZoom, onSelect, onSpawnGroup, wins, onSelection, activeTool, penMode, penColor, penSize,
    paths, setPaths, setRegion, onSpawn, spaceRef, panMode: theme.canvasPanMode,
  });
  const handleCanvasContextMenu = React.useCallback((event) => {    if (consumeContextMenuSuppression()) return;
    const isSelectionSurface = event.target.dataset?.canvasBg || event.target.dataset?.canvasContextSurface;
    if (!isSelectionSurface || selectedIds.length < 2 || !ref.current) return;
    const selectedBounds = getWindowBounds(wins.filter((win) => selectedIds.includes(win.id)));
    if (!selectedBounds) return;
    const point = screenToCanvas(event.clientX, event.clientY, pan.x, pan.y, zoom, ref.current.getBoundingClientRect());
    if (isPointInRect(point.x, point.y, selectedBounds.x, selectedBounds.y, selectedBounds.w, selectedBounds.h)) {
      setRegion(null);
      onDeleteSelected?.(selectedIds);
    }
  }, [consumeContextMenuSuppression, onDeleteSelected, pan.x, pan.y, selectedIds, wins, zoom]);
  const handleCapture = useCanvasCapture({ ref, region, setRegion, pan, zoom });
  const handlePointerMove = React.useCallback((event) => {
    onPointerMove(event);
    if (!ref.current) return;
    const point = screenToCanvas(event.clientX, event.clientY, pan.x, pan.y, zoom, ref.current.getBoundingClientRect());
    if (onCursorMove) onCursorMove(point.x, point.y);
    trackGroupHover.current?.(point);
  }, [onPointerMove, onCursorMove, pan.x, pan.y, zoom]);
  const trackGroupHover = React.useRef(null);
  const { zoomIn, zoomOut, resetView } = useCanvasZoomControls({ ref, pan, zoom, onPanZoom, onFitView });
  const {
    handleAssign, handleDragEnd, handleWireStart, handleWireDrag, handleWireEnd, handleGroupDragEnd, getProjectContextForWindow,
  } = useCanvasWorkspaceHandlers({
    ref, wins, canvasGroups, currentProject, pan, zoom, onUpdate, onSpawn, onAutoArrangeGroup, onUpdateGroup, onLinkCreate, setWireDrag,
    onDockWindow, onUndockWindow, dockingEnabled: theme.groupSnapping !== false && !!onDockWindow,
  });
  const { trackHover, visibleGroupIds, groupDrag, handleUndockTab } = useCanvasGroupChrome({
    wins, canvasGroups, activeId, selectedIds, zoom, onMoveGroup, handleGroupDragEnd, onUndockWindow, onUpdate,
  });
  trackGroupHover.current = trackHover;
  return (<>
    <CanvasShell
      ref={ref}
      spaceHeld={spaceHeld}
      onPointerDown={onPointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={onPointerUp}
      onCanvasContextMenu={handleCanvasContextMenu}
      pan={pan}
      zoom={zoom}
      activeTool={activeTool}
      penMode={penMode}
      isPanning={isPanning}
      fixedChildren={<>
        <CanvasWindows
          wins={wins}
          workspaceRevision={workspaceRevision}
          activeId={activeId}
          selectedIds={selectedIds}
          zoom={zoom}
          pan={pan}
          offset={pinnedRailOffset}
          canvasGroups={canvasGroups}
          groups={dockState?.groups || []}
          getProjectContext={getProjectContextForWindow}
          onUpdate={onUpdate}
          onClose={onClose}
          onSelect={onSelect}
          onSpawn={onSpawn}
          onCreateAgent={onCreateAgent}
          onAssign={handleAssign}
          onDragEnd={handleDragEnd}
          onWindowMovePreview={onWindowMovePreview}
          onWireStart={handleWireStart}
          onWireDrag={handleWireDrag}
          onWireEnd={handleWireEnd}
          groupDrag={groupDrag}
        />
      </>}
      overlayChildren={<>
        <CanvasGroupsLayer
          groups={canvasGroups}
          wins={wins}
          zoom={zoom}
          onUpdate={onUpdate}
          onUpdateGroup={onUpdateGroup}
          onResizeGroup={onResizeGroup}
          onCloseGroup={onCloseGroup}
          onMoveGroup={onMoveGroup}
          onGroupDragEnd={handleGroupDragEnd}
          onAutoArrangeGroup={onAutoArrangeGroup}
          onSaveGroupPreset={onSaveGroupPreset}
          onLoadGroupPreset={onLoadGroupPreset}
          onDeleteGroupPreset={onDeleteGroupPreset}
          onSetDefaultGroupPreset={onSetDefaultGroupPreset}
          onSetGroupSeam={onSetGroupSeam}
          onShowGroupTab={onShowGroupTab}
          onUndockTab={handleUndockTab}
          visibleGroupIds={visibleGroupIds}
          groupHotkeySlotById={groupHotkeySlotById}
        />
        <CanvasDockOverlay wins={wins} canvasGroups={canvasGroups} zoom={zoom} enabled={theme.groupSnapping !== false && !!onDockWindow} />
        <CanvasCursors cursors={cursors} zoom={zoom} />
        {inkActions && <CanvasInkActions selection={ink.inkSelection} paths={paths} setPaths={setPaths} setSelection={ink.setInkSelection} zoom={zoom} />}
        {worldOverlay}
        <CanvasRegionActions
          region={region}
          zoom={zoom}
          wins={wins}
          setRegion={setRegion}
          onRubberBand={onRubberBand}
          onSpawn={onSpawn}
          onSpawnGroup={onSpawnGroup}
          onRequestNewAgent={onRequestNewAgent}
          onCapture={handleCapture}
        />
      </>}
    >
        <CanvasMarks zoom={zoom} pan={pan} />

        <CanvasDrawingLayer
          wins={wins}
          links={links}
          wireDrag={wireDrag}
          paths={paths}
          currentPath={currentPath}
          currentStroke={ink.currentStroke}
          liveInk={liveInk}
          lasso={ink.lasso}
          selectedInk={ink.inkSelection}
          zoom={zoom}
          penColor={penColor}
          penSize={penSize}
          onLinkDelete={onLinkDelete}
        />
        <CanvasGroupCards groups={canvasGroups} wins={wins} />
        <CanvasSelectionOutline wins={wins} selectedIds={selectedIds} zoom={zoom} />
        <CanvasWires wins={wins} dockState={dockState} pan={pan} zoom={zoom} />

        {wins.length === 0 && !band && !region && !suppressEmptyState && <EmptyState
onSpawn={onSpawn} onTour={onLaunchpadTour} suggestModules={launchpadSuggestModules} chipKinds={launchpadChipKinds} />}
        <CanvasRubberBand band={band} zoom={zoom} />
    </CanvasShell>

    <ZoomHud zoom={zoom} onZoomIn={zoomIn} onZoomOut={zoomOut} onReset={resetView} onJumpNearestCluster={onJumpNearestCluster} />
  </>);
}
