import React from 'react';

export const CanvasShell = React.forwardRef(function CanvasShell({
  spaceHeld,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  pan,
  zoom,
  activeTool,
  penMode,
  isPanning,
  children,
  fixedChildren,
  overlayChildren,
  onCanvasContextMenu,
}, ref) {
  const dotSize = 24 * zoom;
  const dotRadius = Math.max(0.6, Math.min(1.4, 1 * zoom));
  const cursor = activeTool === 'pen' || penMode
    ? 'crosshair'
    : (activeTool === 'rect' ? 'crosshair'
      : (activeTool === 'text' ? 'text'
        : (activeTool === 'eraser' ? 'cell'
          : (activeTool === 'pan' ? (isPanning ? 'grabbing' : 'grab')
            : (spaceHeld ? 'grab' : (isPanning ? 'grabbing' : 'default'))))));

  return (
    <div
      ref={ref}
      data-canvas-bg
      className={spaceHeld ? 'space-held' : ''}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onContextMenu={(e) => {
        e.preventDefault();
        onCanvasContextMenu?.(e);
      }}
      style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: `radial-gradient(circle at center, var(--hairline) ${dotRadius}px, transparent ${dotRadius + 0.4}px)`,
        backgroundSize: `${dotSize}px ${dotSize}px`,
        backgroundColor: 'color-mix(in oklch, var(--canvas) 70%, var(--bg))',
        backgroundPosition: `${pan.x % dotSize}px ${pan.y % dotSize}px`,
        overflow: 'clip',
        cursor,
        touchAction: 'none',
        userSelect: 'none',
      }}
    >
      {spaceHeld && <style>{`.space-held iframe { pointer-events: none !important; }`}</style>}
      <div
        data-canvas-bg
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          transformOrigin: '0 0',
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          width: 0,
          height: 0,
          overflow: 'visible',
        }}
      >
        {children}
      </div>
      {fixedChildren}
      {overlayChildren && (
        <div
          data-canvas-overlay
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            transformOrigin: '0 0',
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            width: 0,
            height: 0,
            overflow: 'visible',
            zIndex: 120,
          }}
        >
          {overlayChildren}
        </div>
      )}
    </div>
  );
});
