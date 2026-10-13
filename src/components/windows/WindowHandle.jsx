import React from 'react';

export function Handle({ dir, zoom = 1, onPointerDown, onPointerMove, onPointerUp }) {
  const scale = Math.max(zoom || 1, 0.1);
  const edge = 10 / scale;
  const inset = 14 / scale;
  const corner = 18 / scale;
  const offset = -edge / 2;
  const styles = {
    t: { left: inset, right: inset, top: offset, height: edge, cursor: 'ns-resize' },
    r: { top: inset, bottom: inset, right: offset, width: edge, cursor: 'ew-resize' },
    b: { left: inset, right: inset, bottom: offset, height: edge, cursor: 'ns-resize' },
    l: { top: inset, bottom: inset, left: offset, width: edge, cursor: 'ew-resize' },
    br: { right: offset, bottom: offset, width: corner, height: corner, cursor: 'nwse-resize' },
    bl: { left: offset, bottom: offset, width: corner, height: corner, cursor: 'nesw-resize' },
    tr: { right: offset, top: offset, width: corner, height: corner, cursor: 'nesw-resize' },
    tl: { left: offset, top: offset, width: corner, height: corner, cursor: 'nwse-resize' },
  };
  return <div onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} style={{ position: 'absolute', zIndex: 2, touchAction: 'none', ...styles[dir] }} />;
}

