import React from 'react';
import { glidePan } from '../../lib/glideView.js';
import { panToCenter } from '../../lib/canvas/minimapMath.js';
import { currentSignedInUser, freshPointsFor } from '../../lib/chat/agentPointer.js';

/**
 * When an agent points the signed-in person at a window, slide their view
 * so it sits in the middle of the screen (once per point).
 */
export function usePointedWindowGlide({ ref, wins, pan, zoom, onPanZoom }) {
  const seen = React.useRef(new Set());
  const panRef = React.useRef(pan);
  panRef.current = pan;
  React.useEffect(() => {
    const fresh = freshPointsFor(wins, currentSignedInUser(), seen.current);
    if (!fresh.length || !ref.current || !onPanZoom) return;
    const win = fresh[fresh.length - 1];
    for (const item of fresh) seen.current.add(`${item.id}@${item.pointedAt.at}`);
    const rect = ref.current.getBoundingClientRect();
    const center = { x: (win.x || 0) + (win.w || 400) / 2, y: (win.y || 0) + (win.h || 300) / 2 };
    const next = panToCenter(center, zoom, { w: rect.width, h: rect.height });
    glidePan(panRef.current, next, (p) => onPanZoom({ panX: p.x, panY: p.y, zoom }), { read: () => panRef.current });
  }, [wins, zoom, onPanZoom, ref]);
}
