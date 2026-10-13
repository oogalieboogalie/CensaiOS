import React from 'react';
import { WindowFrame } from '../windows/WindowFrame.jsx';
import { WindowSuspenseFallback } from '../windows/WindowSuspenseFallback.jsx';
import { stackLevels } from '../../lib/windowStacking.js';
import { tileIndex } from '../../lib/layout/dock.js';

const CanvasObjectRenderer = React.lazy(() => import('./CanvasRenderer.jsx').then((mod) => ({
  default: mod.CanvasObjectRenderer,
})));

const RenderedWindow = React.memo(({
  win,
  stackLevel = 0,
  workspaceRevision,
  activeId,
  selectedIds = [],
  zoom,
  pan = { x: 0, y: 0 },
  allWins,
  canvasGroups,
  groups,
  getProjectContext,
  onUpdate,
  onClose,
  onSelect,
  onSpawn,
  onCreateAgent,
  onAssign,
  onDragEnd,
  onWindowMovePreview,
  onWireStart,
  onWireDrag,
  onWireEnd,
  tileGroupId = null,
  tileCorners = '',
  groupDrag = null,
}) => {
  return (
    <WindowFrame
      tileGroupId={tileGroupId}
      tileCorners={tileCorners}
      groupDrag={groupDrag}
      win={win}
      stackLevel={stackLevel}
      isActive={activeId === win.id}
      isSelected={selectedIds.includes(win.id)}
      zoom={zoom}
      pan={pan}
      allWins={allWins}
      onUpdate={(patch) => onUpdate(win.id, patch)}
      onClose={() => onClose(win.id)}
      onDragEnd={onDragEnd}
      onMovePreview={onWindowMovePreview}
      onWireStart={onWireStart}
      onWireDrag={onWireDrag}
      onWireEnd={onWireEnd}
      onSelect={(e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        onSelect(win.id, e);
      }}
    >
      <React.Suspense fallback={<WindowSuspenseFallback />}>
        <CanvasObjectRenderer
          canvasObject={win}
          workspaceRevision={workspaceRevision}
          isActive={activeId === win.id}
          pan={pan}
          zoom={zoom}
          wins={allWins}
          allWins={allWins}
          canvasGroups={canvasGroups}
          currentProject={getProjectContext(win)}
          groups={groups}
          onUpdate={(patch) => onUpdate(win.id, patch)}
          onSpawn={onSpawn}
          onSelect={onSelect}
          onCreateAgent={onCreateAgent}
          onAssign={win.kind === 'doc' ? onAssign : undefined}
        />
      </React.Suspense>
    </WindowFrame>
  );
});

// ONE keyed list for floating, pinned, AND maximized windows. Pinning or
// maximizing must only change wrapper/frame styles — never move the window to
// a different component subtree, or React remounts it and its state resets
// (issue #118). Floating windows counter-apply pan/zoom in their own
// transform, so this whole layer lives in screen space.
// Floating windows use 10 + stack level, so pinned and maximized sit above any
// realistic window count.
const PINNED_LAYER = 100000;
const MAXIMIZED_LAYER = 200000;

export function CanvasWindows(props) {
  const { wins, canvasGroups = [], offset = { top: 24, left: 24 } } = props;
  // Which windows are tiles in a group (and which corners stay rounded), and
  // which are tabs hidden behind another tab in their slot.
  const tiles = React.useMemo(() => tileIndex(wins, canvasGroups), [wins, canvasGroups]);
  // Snapshot of positions/sizes for edge-snapping: keeps the memoized frames
  // from re-rendering on unrelated window-state changes (PR #119).
  const snapWins = React.useMemo(() => wins.map(w => ({ id: w.id, x: w.x, y: w.y, w: w.w, h: w.h, hidden: tiles.hidden.has(w.id) })), [wins, tiles]);
  // Shared stacking order (window zIndex field, synced for everyone).
  const levels = React.useMemo(() => stackLevels(wins), [wins]);

  let pinnedCount = 0;
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {wins.map(w => {
        let style = { pointerEvents: 'auto' };
        const tile = tiles.index.get(w.id);
        let winProps = { ...props, win: w, allWins: snapWins, stackLevel: levels.get(w.id) || 0, tileGroupId: tile?.groupId || null, tileCorners: tile?.corners || '' };
        // Hidden tabs stay mounted (their state survives) but don't draw.
        if (tiles.hidden.has(w.id)) style = { ...style, display: 'none' };

        if (w.maximized) {
          style = { ...style, position: 'fixed', inset: 0, zIndex: MAXIMIZED_LAYER, pointerEvents: 'none' };
          winProps = { ...winProps, zoom: 1, pan: { x: 0, y: 0 }, onDragEnd: undefined, onWireStart: undefined, onWireDrag: undefined, onWireEnd: undefined };
        } else if (w.pinned) {
          const top = offset.top + pinnedCount;
          style = { ...style, position: 'absolute', top, left: offset.left, zIndex: PINNED_LAYER };
          winProps = { ...winProps, zoom: 1, pan: { x: 0, y: 0 }, groups: props.groups, onDragEnd: undefined, onWireStart: undefined, onWireDrag: undefined, onWireEnd: undefined, onCreateAgent: undefined };
          pinnedCount += (w.h * 0.75 + 16);
        }

        return (
          <div key={w.id} style={style}>
            <div style={{ pointerEvents: 'auto' }}>
              <RenderedWindow {...winProps} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
