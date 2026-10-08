import React from 'react';
import { getSvgPathFromStroke } from './CanvasInteractions.js';
import { cachedInkPath, inkPath, isInkStroke } from '../../lib/ink/stroke.js';
import { DEFAULT_INK } from '../../lib/ink/rasterize.js';
import { SketchLinks } from './SketchLinks.jsx';

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

// Ink strokes (spec 9) are filled outlines in canvas units; strokes saved
// before pressure ink stay plain lines that keep their on-screen width.
function Stroke({ p, zoom, selected }) {
  if (isInkStroke(p)) {
    const d = cachedInkPath(p);
    return (
      <>
        {selected && <path d={d} fill="none" stroke="var(--accent)" strokeWidth={4 / zoom} strokeLinejoin="round" opacity={0.25} />}
        <path d={d} fill={p.color || DEFAULT_INK} data-ink-stroke={p.id} />
      </>
    );
  }
  return <path d={getSvgPathFromStroke(p.pts)} fill="none" stroke={p.color || DEFAULT_INK} strokeWidth={(p.size || 3) / zoom} strokeLinecap="round" strokeLinejoin="round" opacity={selected ? 0.6 : 1} />;
}

export function CanvasDrawingLayer({ wins, links, wireDrag, paths, currentPath, currentStroke = null, liveInk = [], lasso = null, selectedInk = [], zoom, penColor, penSize, onLinkDelete }) {
  const selected = new Set(selectedInk);
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
            <stop offset="0%" stopColor="var(--accent)" />
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
              <path d={path.d} fill="none" stroke="var(--on-fill)" strokeWidth={1 / zoom} opacity={0.3} pointerEvents="none" />
              {path.isFresh && <path d={path.d} fill="none" stroke="var(--on-fill)" strokeWidth={4 / zoom} strokeLinecap="round" filter="url(#glow-connection)" className="animate-shoot-packet" pathLength="100" strokeDasharray="15 300" pointerEvents="none" />}
            </g>
          );
        })}
        {wireDrag && <path d={`M ${wireDrag.startX} ${wireDrag.startY} C ${(wireDrag.startX + wireDrag.x) / 2} ${wireDrag.startY}, ${(wireDrag.startX + wireDrag.x) / 2} ${wireDrag.y}, ${wireDrag.x} ${wireDrag.y}`} fill="none" stroke="var(--ps-green)" strokeWidth={4 / zoom} strokeLinecap="round" pointerEvents="none" />}
        <SketchLinks wins={wins} paths={paths} zoom={zoom} />
        {paths.map(p => <Stroke key={p.id} p={p} zoom={zoom} selected={selected.has(p.id)} />)}
        {liveInk.map(s => <path key={s.id} d={inkPath(s, { last: false })} fill={s.color || DEFAULT_INK} opacity={0.85} data-live-ink />)}
        {currentStroke
          ? <path d={inkPath(currentStroke, { last: false })} fill={currentStroke.color || DEFAULT_INK} data-current-ink />
          : currentPath && <path d={getSvgPathFromStroke(currentPath)} fill="none" stroke={penColor || DEFAULT_INK} strokeWidth={(penSize || 3) / zoom} strokeLinecap="round" strokeLinejoin="round" />}
        {lasso && lasso.length > 1 && <path d={`${getSvgPathFromStroke(lasso)} Z`} fill="var(--accent-soft)" fillOpacity={0.35} stroke="var(--accent)" strokeWidth={1.5 / zoom} strokeDasharray={`${4 / zoom} ${4 / zoom}`} data-lasso />}
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
