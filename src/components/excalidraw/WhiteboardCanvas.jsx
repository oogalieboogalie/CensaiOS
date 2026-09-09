import React from 'react';
import { getBoundingBox, getSvgPath } from './helpers.js';

export function WhiteboardCanvas({
  elements,
  selectedId,
  activeMode,
  editingTextId,
  tempTextValue,
  setTempTextValue,
  finalizeTextEdit,
  color,
  handleTextDoubleClick,
  svgRef,
  handlePointerDown,
  handlePointerMove,
  handlePointerUp,
}) {
  const selectedElement = selectedId ? elements.find(el => el.id === selectedId) : null;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative', background: 'var(--surface)' }}>
      {/* Whiteboard Drawing Canvas */}
      <svg
        ref={svgRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{
          flex: 1,
          width: '100%',
          height: '100%',
          outline: 'none',
          cursor: activeMode === 'select' ? 'default' : 'crosshair',
          userSelect: 'none',
        }}
      >
        {/* Background dot pattern */}
        <defs>
          <pattern id="whiteboard-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1" fill="var(--ink)" opacity="0.12" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#whiteboard-grid)" />

        {/* Render Elements */}
        {elements.map((el) => {
          if (el.type === 'pencil') {
            return (
              <path
                key={el.id}
                d={getSvgPath(el.pts)}
                stroke={el.color}
                strokeWidth={el.strokeWidth}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={el.id === selectedId ? 0.8 : 1}
              />
            );
          }

          if (el.type === 'rect') {
            return (
              <rect
                key={el.id}
                x={el.x}
                y={el.y}
                width={el.w}
                height={el.h}
                stroke={el.color}
                strokeWidth={el.strokeWidth}
                fill="none"
                strokeLinejoin="round"
                opacity={el.id === selectedId ? 0.8 : 1}
              />
            );
          }

          if (el.type === 'circle') {
            return (
              <ellipse
                key={el.id}
                cx={el.x + el.w / 2}
                cy={el.y + el.h / 2}
                rx={Math.abs(el.w) / 2}
                ry={Math.abs(el.h) / 2}
                stroke={el.color}
                strokeWidth={el.strokeWidth}
                fill="none"
                opacity={el.id === selectedId ? 0.8 : 1}
              />
            );
          }

          if (el.type === 'arrow') {
            if (!el.pts || el.pts.length < 2) return null;
            const p0 = el.pts[0];
            const p1 = el.pts[el.pts.length - 1];
            const angle = Math.atan2(p1.y - p0.y, p1.x - p0.x);
            const headLen = 12;
            const arrowHeadX1 = p1.x - headLen * Math.cos(angle - Math.PI / 6);
            const arrowHeadY1 = p1.y - headLen * Math.sin(angle - Math.PI / 6);
            const arrowHeadX2 = p1.x - headLen * Math.cos(angle + Math.PI / 6);
            const arrowHeadY2 = p1.y - headLen * Math.sin(angle + Math.PI / 6);

            return (
              <g key={el.id} opacity={el.id === selectedId ? 0.8 : 1}>
                <path d={getSvgPath(el.pts)} stroke={el.color} strokeWidth={el.strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                <polygon
                  points={`${p1.x},${p1.y} ${arrowHeadX1},${arrowHeadY1} ${arrowHeadX2},${arrowHeadY2}`}
                  fill={el.color}
                />
              </g>
            );
          }

          if (el.type === 'text') {
            // If text is being edited, don't draw it as static SVG
            if (el.id === editingTextId) return null;
            return (
              <text
                key={el.id}
                x={el.x}
                y={el.y + 12} // vertical baseline shift
                fill={el.color}
                fontSize={14}
                fontWeight="500"
                fontFamily="var(--font-sans, sans-serif)"
                onDoubleClick={(e) => handleTextDoubleClick(e, el)}
                cursor="text"
              >
                {el.text}
              </text>
            );
          }

          return null;
        })}

        {/* Render Selection Handles and Outline in Select Mode */}
        {activeMode === 'select' && selectedElement && (
          (() => {
            const { x: bx, y: by, w: bw, h: bh } = getBoundingBox(selectedElement);
            const showHandles = selectedElement.type === 'rect' || selectedElement.type === 'circle';
            
            return (
              <g pointerEvents="none">
                {/* Outer Bounding Box Outline */}
                <rect
                  x={bx - 4}
                  y={by - 4}
                  width={bw + 8}
                  height={bh + 8}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
                {/* Resizing Corners */}
                {showHandles && (
                  <>
                    <rect x={bx - 8} y={by - 8} width={8} height={8} fill="var(--surface)" stroke="var(--accent)" strokeWidth="1.5" />
                    <rect x={bx + bw} y={by - 8} width={8} height={8} fill="var(--surface)" stroke="var(--accent)" strokeWidth="1.5" />
                    <rect x={bx - 8} y={by + bh} width={8} height={8} fill="var(--surface)" stroke="var(--accent)" strokeWidth="1.5" />
                    <rect x={bx + bw} y={by + bh} width={8} height={8} fill="var(--surface)" stroke="var(--accent)" strokeWidth="1.5" />
                  </>
                )}
              </g>
            );
          })()
        )}
      </svg>

      {/* Overlay Input for Inline Text Editing */}
      {editingTextId && (() => {
        const el = elements.find(item => item.id === editingTextId);
        if (!el) return null;
        return (
          <div style={{
            position: 'absolute',
            left: el.x,
            top: el.y,
            zIndex: 20,
          }}>
            <input
              autoFocus
              type="text"
              value={tempTextValue}
              onChange={(e) => setTempTextValue(e.target.value)}
              onBlur={finalizeTextEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') finalizeTextEdit();
                if (e.key === 'Escape') {
                  finalizeTextEdit(); // blurred value
                }
              }}
              style={{
                all: 'unset',
                background: 'var(--surface-2)',
                color: color.startsWith('var') ? 'var(--ink)' : color,
                border: '1px solid var(--accent)',
                padding: '2px 4px',
                borderRadius: 4,
                fontSize: 14,
                fontFamily: 'var(--font-sans, sans-serif)',
                fontWeight: '500',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                minWidth: 120,
              }}
            />
          </div>
        );
      })()}
    </div>
  );
}
