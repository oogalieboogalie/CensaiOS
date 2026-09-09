import React from 'react';
import { getAgentById } from '../../lib/agentStore.js';
import { distance } from '../../lib/canvasMath.js';

export function CanvasWires({ wins, dockState, pan, zoom }) {
  const [, force] = React.useReducer(x => x + 1, 0);

  React.useEffect(() => {
    let count = 0;
    let raf;
    const step = () => {
      if (count++ < 25) {
        force();
        raf = requestAnimationFrame(step);
      }
    };
    step();
    return () => cancelAnimationFrame(raf);
  }, [JSON.stringify(dockState?.groups || []), dockState?.offset]);

  const paths = wins.flatMap(win => (win.attachedAgents || [])
    .map(aid => buildDockWire(win, aid, pan, zoom))
    .filter(Boolean));

  return (
    <svg style={{ position: 'absolute', left: -10000, top: -10000, width: 100000, height: 100000, pointerEvents: 'none', zIndex: 5, overflow: 'visible' }}>
      {paths.map(path => (
        <g key={path.key}>
          <path d={path.d} fill="none" stroke={`oklch(0.62 0.16 ${path.hue} / 0.85)`} strokeWidth={1.6 / zoom} strokeDasharray={`${6 / zoom} ${5 / zoom}`} strokeLinecap="round" />
          <circle cx={path.start.x} cy={path.start.y} r={3 / zoom} fill={`oklch(0.62 0.16 ${path.hue})`} />
        </g>
      ))}
    </svg>
  );
}

function buildDockWire(win, aid, pan, zoom) {
  const dockEl = document.querySelector(`[data-dock-agent="${aid}"]`);
  if (!dockEl) return null;

  const dRect = dockEl.getBoundingClientRect();
  const canvasEl = document.getElementById('canvas-root');
  const cRect = canvasEl?.getBoundingClientRect() || { left: 0, top: 0 };
  const sx = (dRect.left + dRect.width / 2 - cRect.left - pan.x) / zoom;
  const sy = (dRect.top + dRect.height / 2 - cRect.top - pan.y) / zoom;
  const tx = win.x + win.w + 4;
  const ty = win.y + Math.min(40, win.h * 0.5);
  const bend = Math.min(140, distance(sx, sy, tx, ty) * 0.4);

  return {
    d: `M ${tx} ${ty} C ${tx + bend} ${ty}, ${sx - bend} ${sy}, ${sx} ${sy}`,
    start: { x: tx, y: ty },
    hue: getAgentById(aid)?.hue ?? 145,
    key: `${win.id}-${aid}`,
  };
}
