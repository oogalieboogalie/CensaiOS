import React from 'react';
import { getSvgPathFromStroke } from './CanvasInteractions.js';

function linkPath(l, wins) {
  const w1 = wins.find(w => w.id === l.fromId);
  const w2 = wins.find(w => w.id === l.toId);
  if (!w1 || !w2) return null;
  const x1 = w1.x + w1.w;
  const y1 = w1.y + w1.h / 2;
  const x2 = w2.x;
  const y2 = Math.abs(y1 - (w2.y + w2.h / 2)) < 1 ? y1 + 1 : w2.y + w2.h / 2;
  const dx = Math.abs(x2 - x1) * 0.5;
  return {
    d: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`,
    isFresh: l.timestamp && (Date.now() - l.timestamp < 4000),
  };
}

export function CanvasDrawingLayer({ wins, links, wireDrag, paths, currentPath, zoom, penColor, penSize, onLinkDelete }) {
  return (
    <>
      <svg style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none', zIndex: 1 }}>
        <defs>
          <filter id="glow-connection" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="grad-connection" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#14b8a6" />
            <stop offset="100%" stopColor="var(--ps-blue)" />
          </linearGradient>
        </defs>
        {links.map(l => {
          const path = linkPath(l, wins);
          if (!path) return null;
          return (
            <g key={l.id}>
              <path
                d={path.d}
                fill="none"
                stroke="transparent"
                strokeWidth={Math.max(14 / zoom, 8)}
                strokeLinecap="round"
                pointerEvents="stroke"
                style={{ pointerEvents: 'stroke', cursor: 'not-allowed' }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onLinkDelete?.(l.id);
                }}
              />
              <path d={path.d} fill="none" stroke="url(#grad-connection)" strokeWidth={3 / zoom} filter="url(#glow-connection)" opacity={0.4} pointerEvents="none" />
              <path d={path.d} fill="none" stroke="#ffffff" strokeWidth={1 / zoom} opacity={0.3} pointerEvents="none" />
              {path.isFresh && <path d={path.d} fill="none" stroke="#ffffff" strokeWidth={4 / zoom} strokeLinecap="round" filter="url(#glow-connection)" className="animate-shoot-packet" pathLength="100" strokeDasharray="15 300" pointerEvents="none" />}
            </g>
          );
        })}
        {wireDrag && <path d={`M ${wireDrag.startX} ${wireDrag.startY} C ${(wireDrag.startX + wireDrag.x) / 2} ${wireDrag.startY}, ${(wireDrag.startX + wireDrag.x) / 2} ${wireDrag.y}, ${wireDrag.x} ${wireDrag.y}`} fill="none" stroke="var(--ps-green)" strokeWidth={4 / zoom} strokeLinecap="round" pointerEvents="none" />}
        {paths.map(p => <path key={p.id} d={getSvgPathFromStroke(p.pts)} fill="none" stroke={p.color || 'oklch(var(--accent-l) calc(var(--accent-c) * 1) var(--accent-h))'} strokeWidth={(p.size || 3) / zoom} strokeLinecap="round" strokeLinejoin="round" />)}
        {currentPath && <path d={getSvgPathFromStroke(currentPath)} fill="none" stroke={penColor || 'oklch(var(--accent-l) calc(var(--accent-c) * 1) var(--accent-h))'} strokeWidth={(penSize || 3) / zoom} strokeLinecap="round" strokeLinejoin="round" />}
      </svg>
      {links.map(l => {
        if (!l.timestamp || Date.now() - l.timestamp >= 4000) return null;
        const targetWin = wins.find(w => w.id === l.toId);
        if (!targetWin) return null;
        return <div key={`glow-${l.id}`} className="animate-connection-glow" style={{ position: 'absolute', pointerEvents: 'none', left: targetWin.x, top: targetWin.y, width: targetWin.w, height: targetWin.h, borderRadius: 'var(--radius-card)', '--glow-color': 'var(--ps-blue)', zIndex: 5 }} />;
      })}
    </>
  );
}
