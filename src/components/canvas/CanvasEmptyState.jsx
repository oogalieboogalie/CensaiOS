/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { LAUNCHER_MANIFESTS } from '../../lib/windowManifest.js';
import { CanvasLaunchpad } from './CanvasLaunchpad.jsx';
import { useFitScale } from './useFitScale.js';

export function CanvasMarks({ zoom, pan }) {
  // Place crosses at fixed large offsets in canvas-space to suggest infinity
  const marks = [
    { x: -600, y: -400 }, { x: 800, y: -300 },
    { x: -500, y: 600 }, { x: 900, y: 500 },
    { x: -1200, y: 0 }, { x: 1400, y: -100 },
    { x: 0, y: -800 }, { x: 0, y: 900 },
  ];
  return <>{marks.map((p, i) => <div key={i} style={{ position: 'absolute', left: p.x, top: p.y, color: 'var(--hairline-strong)', opacity: 0.5, pointerEvents: 'none', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-lg)' }}>+</div>)}</>;
}

// Tools that put something on the board; the welcome steps aside for them.
const DRAWING_TOOLS = ['pen', 'eraser', 'rect', 'text', 'lasso'];

/**
 * Whether the board shows its welcome: only while nothing is on it (no
 * window, group or drawing), nothing is being selected (`busy`) and no
 * drawing tool is picked.
 */
export function showsWelcome({ wins = [], groups = [], paths = [], busy = false, activeTool = 'select', suppress = false }) {
  return !suppress && !busy && !DRAWING_TOOLS.includes(activeTool)
    && wins.length === 0 && groups.length === 0 && paths.length === 0;
}

// Room kept clear at the top for the top bar and the notices that drop below
// it (an unsaved draft offered back, someone joining), and at the bottom for
// the tools (with the tool hint that pops up above them), the zoom buttons
// and the Censai button.
const ROOM = { top: 106, bottom: 96, side: 16 };

// ─── Empty State ───
/**
 * The welcome on an empty board. It sits on the screen, not on the board, so
 * it is always in full view between the top bar and the tools, at its normal
 * size, however far the board has been moved or zoomed; on a window too
 * small for it, it shrinks to fit.
 */
export function EmptyState({ onSpawn, onTour, suggestModules, chipKinds, panMode }) {
  const boxRef = React.useRef(null);
  const padRef = React.useRef(null);
  const scale = useFitScale(boxRef, padRef);
  return (
    <div ref={boxRef} data-testid="empty-board" style={{
      position: 'absolute', top: ROOM.top, bottom: ROOM.bottom, left: ROOM.side, right: ROOM.side,
      display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
    }}>
      <div ref={padRef} style={{ maxWidth: '100%', flexShrink: 0, transform: scale < 1 ? `scale(${scale})` : undefined }}>
        <CanvasLaunchpad
          manifests={LAUNCHER_MANIFESTS}
          onSpawn={onSpawn}
          onTour={onTour}
          suggestModules={suggestModules}
          chipKinds={chipKinds}
          panMode={panMode}
        />
      </div>
    </div>
  );
}
