// The zoom that fits a w × h artboard inside an element, kept current as the
// window is resized.
import React from 'react';

export function useFitScale(ref, w, h, pad = 48) {
  const [box, setBox] = React.useState({ w: 640, h: 420 });
  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver !== 'function') return undefined;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return Math.max(0.05, Math.min((box.w - pad) / w, (box.h - pad) / h, 4));
}
