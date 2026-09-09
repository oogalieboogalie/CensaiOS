import React from 'react';
import { Handle } from './WindowHandle.jsx';

const DIRECTIONS = ['t', 'r', 'b', 'l', 'br', 'bl', 'tr', 'tl'];

export function WindowResizeHandles({ zoom, startResize, onPointerMove, onPointerUp }) {
  return (
    <>
      {DIRECTIONS.map(dir => (
        <Handle key={dir} dir={dir} zoom={zoom} onPointerDown={(e) => startResize(e, dir)} onPointerMove={onPointerMove} onPointerUp={onPointerUp} />
      ))}
    </>
  );
}
