import React from 'react';
import { GLASS_HOST, glossContainer } from '../../lib/theme/gloss.js';
import { glidePan } from '../../lib/glideView.js';
import { tileIndex } from '../../lib/layout/dock.js';
import { agentCursorPoint } from '../../lib/collaboration/agentPresence.js';
import {
  fromMap, mapLayout, mapWindows, panToCenter, toMap, viewportRect, windowAt, worldBounds,
} from '../../lib/canvas/minimapMath.js';
import { cursorColor } from './CanvasCursors.jsx';
import { useMapTuck } from './useMapTuck.js';

function useScreenSize() {
  const read = () => ({ w: window.innerWidth || 1280, h: window.innerHeight || 800 });
  const [size, setSize] = React.useState(read);
  React.useEffect(() => {
    const onResize = () => setSize(read());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

/**
 * The board map: a small picture of the whole board in the corner, like a
 * game minimap. Every window, group (with its F-key), person and agent is on
 * it, and the bright frame is what's on your screen. Click to jump there,
 * drag to slide the board, click a window to jump to it and select it. It
 * keeps out of the way (useMapTuck): while a window sits under it, it tucks
 * into its small tab (a click still opens it), and new windows open clear of it.
 */
export function CanvasMinimap({ wins = [], canvasGroups = [], activeId, pan, zoom, onPanZoom, onSelect, cursors = {}, agentCursors = {}, groupHotkeySlotById = {}, onClose }) {
  const screen = useScreenSize();
  const [small, setSmall] = useMinimapSmall();
  const hidden = React.useMemo(() => tileIndex(wins, canvasGroups).hidden, [wins, canvasGroups]);
  const shown = React.useMemo(() => mapWindows(wins, hidden), [wins, hidden]);
  const view = viewportRect(pan, zoom, screen);
  const world = worldBounds([...shown, ...canvasGroups], view);
  const { scale, w, h } = mapLayout(world);
  const tuck = useMapTuck({ w, h, screen, shown, pan, zoom, small });
  const drag = React.useRef(null);
  const panRef = React.useRef(pan);
  panRef.current = pan;

  const boardPoint = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    return fromMap(e.clientX - r.left, e.clientY - r.top, world, scale);
  };
  const moveTo = (point, glide) => {
    const next = panToCenter(point, zoom, screen);
    const apply = (p) => onPanZoom({ panX: p.x, panY: p.y, zoom });
    if (glide) glidePan(panRef.current, next, apply, { read: () => panRef.current });
    else apply(next);
  };
  const onPointerDown = (e) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, moved: false, world, scale };
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 3) return;
    d.moved = true;
    const r = e.currentTarget.getBoundingClientRect();
    moveTo(fromMap(e.clientX - r.left, e.clientY - r.top, d.world, d.scale), false);
  };
  const onPointerUp = (e) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved) return;
    const point = boardPoint(e);
    const hit = windowAt(point, shown);
    if (hit) {
      moveTo({ x: hit.x + hit.w / 2, y: hit.y + hit.h / 2 }, true);
      onSelect?.(hit.id);
    } else moveTo(point, true);
  };

  const byId = new Map(wins.map((win) => [win.id, win]));
  const people = Object.values(cursors).filter((c) => Number.isFinite(c?.x) && Number.isFinite(c?.y));
  const agents = Object.values(agentCursors)
    .map((agent) => ({ agent, point: agentCursorPoint(agent, byId.get(agent.at) || byId.get(agent.home)) }))
    .filter((entry) => entry.point);
  const v = toMap(view, world, scale);
  const dot = (p) => ({ cx: (p.x - world.x) * scale, cy: (p.y - world.y) * scale });

  const count = `${shown.length} ${shown.length === 1 ? 'window' : 'windows'}`;
  if (small || tuck.tucked) {
    return (
      <button type="button" data-present-hide data-testid="board-map-tab" data-tucked={!small || undefined} className={`hb-minimap hb-minimap--tab ${GLASS_HOST}`}
        style={glossContainer()} title="Open the board map" aria-label="Open the board map"
        onClick={() => { setSmall(false); tuck.hold(); }}>
        <span className="hb-minimap__tab-icon" aria-hidden="true">▢</span>
        <span>Map</span>
        <span className="hb-minimap__count">{shown.length}</span>
      </button>
    );
  }

  return (
    <div ref={tuck.mapRef} data-present-hide data-testid="board-map" className={`hb-minimap ${GLASS_HOST}`} style={glossContainer()} {...tuck.pointer}>
      <div className="hb-minimap__head">
        <span>Board map</span>
        <span className="hb-minimap__count">{count}</span>
        <button type="button" data-testid="board-map-minimize" className="hb-minimap__close" title="Minimize the board map" aria-label="Minimize the board map" onClick={() => setSmall(true)}>–</button>
        <button type="button" className="hb-minimap__close" title="Hide the board map" aria-label="Hide the board map" onClick={onClose}>×</button>
      </div>
      <svg
        className="hb-minimap__map" width={w} height={h} viewBox={`0 0 ${w} ${h}`}
        role="img" aria-label="Board map. Click to jump, drag to move the board."
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
        onPointerCancel={() => { drag.current = null; }}
      >
        {canvasGroups.filter((g) => [g.x, g.y, g.w, g.h].every(Number.isFinite)).map((g) => {
          const r = toMap(g, world, scale);
          const slot = groupHotkeySlotById[g.id];
          return (
            <g key={g.id} data-testid="board-map-group">
              <rect x={r.x} y={r.y} width={r.w} height={r.h} rx="2" className="hb-minimap__group" style={{ stroke: `hsl(${g.hue ?? 210} 70% 60%)` }} />
              {slot && <text x={r.x + 2} y={r.y - 2} className="hb-minimap__slot">F{slot}</text>}
            </g>
          );
        })}
        {shown.map((win) => {
          const r = toMap(win, world, scale);
          return (
            <rect key={win.id} data-testid="board-map-window" x={r.x} y={r.y} width={Math.max(2, r.w)} height={Math.max(2, r.h)} rx="1.5"
              className={`hb-minimap__win${win.id === activeId ? ' is-active' : ''}`}>
              <title>{win.title || win.kind}</title>
            </rect>
          );
        })}
        <rect data-testid="board-map-view" x={v.x} y={v.y} width={v.w} height={v.h} rx="2" className="hb-minimap__view" />
        {agents.map(({ agent, point }) => (
          <circle key={agent.key} data-testid="board-map-agent" {...dot(point)} r="3" className="hb-minimap__agent" style={{ fill: agent.color }}>
            <title>{agent.name}</title>
          </circle>
        ))}
        {people.map((c) => (
          <circle key={c.clientId} data-testid="board-map-person" {...dot(c)} r="3.5" className="hb-minimap__person" style={{ fill: c.actor?.color || cursorColor(c.clientId) }}>
            <title>{c.actor?.label || 'Someone'}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
}

const OPEN_KEY = 'hb.boardMap.open';
const SMALL_KEY = 'hb.boardMap.minimized';

/** Minimized to a small tab or full size, remembered in this browser. */
function useMinimapSmall() {
  const [small, setSmall] = React.useState(() => {
    try { return window.localStorage.getItem(SMALL_KEY) === 'true'; } catch { return false; }
  });
  React.useEffect(() => {
    try { window.localStorage.setItem(SMALL_KEY, String(small)); } catch { /* private window */ }
  }, [small]);
  return [small, setSmall];
}

/** Open or closed, remembered in this browser. Open by default. */
export function useMinimapOpen() {
  const [open, setOpen] = React.useState(() => {
    try { return window.localStorage.getItem(OPEN_KEY) !== 'false'; } catch { return true; }
  });
  React.useEffect(() => {
    try { window.localStorage.setItem(OPEN_KEY, String(open)); } catch { /* private window */ }
  }, [open]);
  return [open, setOpen];
}
