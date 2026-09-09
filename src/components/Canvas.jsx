import React from 'react';
import { CanvasWires } from './canvas/CanvasWires.jsx';
import { CanvasMarks, EmptyState } from './canvas/CanvasEmptyState.jsx';
import { CanvasDrawingLayer } from './canvas/CanvasDrawingLayer.jsx';
import { CanvasWindows } from './canvas/CanvasWindowLayers.jsx';
import { CanvasGroupsLayer } from './canvas/CanvasGroupsLayer.jsx';
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
import { getWindowBounds } from '../lib/layoutAlgo.js';
import { isPointInRect, screenToCanvas } from '../lib/canvasMath.js';

export function Canvas({ wins, activeId, selectedIds = [], workspaceRevision, onUpdate, onClose, onSelect, onSelection, onDeleteSelected, onSpawn, onRubberBand, onRequestNewAgent, onCreateAgent, onWindowMovePreview, onCursorMove, cursors = {}, dockState, pan, zoom, onPanZoom, onFitView, onJumpNearestCluster, canvasGroups = [], onSpawnGroup, onUpdateGroup, onResizeGroup, onCloseGroup, onMoveGroup, onAutoArrangeGroup, onSaveGroupPreset, onLoadGroupPreset, onDeleteGroupPreset, paths = [], setPaths, links = [], onLinkCreate, onLinkDelete, currentProject = null, activeTool, penColor, penSize, penMode = false, pinnedRailOffset = { top: 24, left: 24 }, suppressEmptyState = false }) {
  const ref = React.useRef(null);
  const themeContext = useTheme();
  const theme = themeContext?.theme || { canvasPanMode: 'both' };
  const [region, setRegion] = React.useState(null);
  const [wireDrag, setWireDrag] = React.useState(null);
  const { spaceHeld, spaceRef } = useCanvasViewport({ ref, pan, zoom, onPanZoom, panMode: theme.canvasPanMode });
  const {
    band,
    setBand,
    currentPath,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    panRef,
    consumeContextMenuSuppression,
  } = useCanvasPointer({
    ref,
    pan,
    zoom,
    onPanZoom,
    onSelect,
    onSpawnGroup,
    wins,
    onSelection,
    activeTool,
    penMode,
    penColor,
    penSize,
    setPaths,
    setRegion,
    onSpawn,
    spaceRef,
    panMode: theme.canvasPanMode,
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
    if (onCursorMove && ref.current) {
      const point = screenToCanvas(event.clientX, event.clientY, pan.x, pan.y, zoom, ref.current.getBoundingClientRect());
      onCursorMove(point.x, point.y);
    }
  }, [onPointerMove, onCursorMove, pan.x, pan.y, zoom]);
  const { zoomIn, zoomOut, resetView } = useCanvasZoomControls({ ref, pan, zoom, onPanZoom, onFitView });
  const {
    handleAssign,
    handleDragEnd,
    handleWireStart,
    handleWireDrag,
    handleWireEnd,
    handleGroupDragEnd,
    getProjectContextForWindow,
  } = useCanvasWorkspaceHandlers({
    ref,
    wins,
    canvasGroups,
    currentProject,
    pan,
    zoom,
    onUpdate,
    onSpawn,
    onAutoArrangeGroup,
    onUpdateGroup,
    onLinkCreate,
    setWireDrag,
  });
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
      isPanning={Boolean(panRef.current)}
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
        />
      </>}
      overlayChildren={<>
        <CanvasCursors cursors={cursors} zoom={zoom} />
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
          zoom={zoom}
          penColor={penColor}
          penSize={penSize}
          onLinkDelete={onLinkDelete}
        />
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
        />
        <CanvasSelectionOutline wins={wins} selectedIds={selectedIds} zoom={zoom} />
        <CanvasWires wins={wins} dockState={dockState} pan={pan} zoom={zoom} />

        {wins.length === 0 && !band && !region && !suppressEmptyState && <EmptyState onSpawn={onSpawn} />}
        <CanvasRubberBand band={band} zoom={zoom} />
    </CanvasShell>

    <ZoomHud zoom={zoom} onZoomIn={zoomIn} onZoomOut={zoomOut} onReset={resetView} onJumpNearestCluster={onJumpNearestCluster} />
  </>);
}
