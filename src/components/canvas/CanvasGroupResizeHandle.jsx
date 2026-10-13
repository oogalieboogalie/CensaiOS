import React from 'react';
import { createLogger } from '../../lib/logger.js';
import { captureGroupResize, resizeGroupContents } from '../../lib/layout/groupResize.js';

const log = createLogger('group:resize');

export function CanvasGroupResizeHandle({ group, allWins, allGroups, zoom, borderColor, dragRef, onResize }) {
  const releaseResize = (e) => {
    if (!dragRef.current || dragRef.current.id !== e.pointerId) return;
    e.stopPropagation();
    e.target.releasePointerCapture(e.pointerId);
    log.debug('resize release', { group: group.id, didResize: !!dragRef.current.isResizing });
    dragRef.current = null;
  };

  return (
    <div
      onPointerDown={(e) => {
        e.stopPropagation();
        e.target.setPointerCapture(e.pointerId);
        dragRef.current = {
          id: e.pointerId,
          isResizing: true,
          startX: e.clientX,
          startY: e.clientY,
          snapshot: captureGroupResize(group, allWins, allGroups),
        };
        log.debug('resize start', { group: group.id, button: e.button, startW: group.w, startH: group.h });
      }}
      onPointerMove={(e) => {
        if (!dragRef.current || !dragRef.current.isResizing || dragRef.current.id !== e.pointerId) return;
        e.stopPropagation();
        const dw = (e.clientX - dragRef.current.startX) / zoom;
        const dh = (e.clientY - dragRef.current.startY) / zoom;
        const start = dragRef.current.snapshot.group;
        onResize(resizeGroupContents(
          dragRef.current.snapshot,
          start.w + dw,
          start.h + dh,
        ));
      }}
      onPointerUp={releaseResize}
      onPointerCancel={releaseResize}
      style={{ position: 'absolute', bottom: 0, right: 0, width: 24, height: 24, cursor: 'nwse-resize', pointerEvents: 'auto', display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', padding: 6, color: borderColor }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="21 15 21 21 15 21"></polyline><line x1="21" y1="21" x2="15" y2="15"></line></svg>
    </div>
  );
}
