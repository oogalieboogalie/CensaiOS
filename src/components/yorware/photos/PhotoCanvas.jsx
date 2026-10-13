/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { drawDeveloped, loadImage } from '../../../lib/yorware/photoRender.js';

/**
 * A photo drawn with its develop settings. `small` uses the grid thumbnail.
 * Redraws at most once a frame, so dragging a slider stays smooth. `onDrawn`
 * gets the finished canvas (Develop reads it for the histogram).
 */
export function PhotoCanvas({ photo, edits, small = false, maxEdge = 1600, skipCrop = false, className, label, onDrawn }) {
  const ref = React.useRef(null);
  const src = small ? photo?.thumb || photo?.src : photo?.src;
  const key = JSON.stringify(edits || {});
  const onDrawnRef = React.useRef(onDrawn);
  onDrawnRef.current = onDrawn;

  React.useEffect(() => {
    if (!src) return undefined;
    let live = true;
    const frame = requestAnimationFrame(async () => {
      try {
        const img = await loadImage(src);
        if (!live || !ref.current) return;
        const out = drawDeveloped(img, edits, { maxEdge: small ? 320 : maxEdge, skipCrop });
        const c = ref.current;
        c.width = out.width;
        c.height = out.height;
        c.getContext('2d').drawImage(out, 0, 0);
        onDrawnRef.current?.(out);
      } catch { /* a broken picture stays blank */ }
    });
    return () => { live = false; cancelAnimationFrame(frame); };
  // `key` stands for `edits`, so a new object with the same settings does not redraw.
  }, [src, key, small, maxEdge, skipCrop]);

  return <canvas ref={ref} className={className} role="img" aria-label={label || photo?.name || 'Photo'} />;
}
