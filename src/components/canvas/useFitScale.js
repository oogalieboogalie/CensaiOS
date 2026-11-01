import React from 'react';

/**
 * How much `content` must shrink to fit inside `box`: 1 when it fits, less
 * on a window too small for it. Layout sizes are measured, which a transform
 * does not change, and measured again whenever either one changes size.
 */
export function useFitScale(boxRef, contentRef) {
  const [scale, setScale] = React.useState(1);
  React.useLayoutEffect(() => {
    const box = boxRef.current;
    const content = contentRef.current;
    if (!box || !content) return undefined;
    const fit = () => {
      const w = content.offsetWidth;
      const h = content.offsetHeight;
      if (!w || !h || !box.clientWidth || !box.clientHeight) return;
      setScale(Math.floor(100 * Math.min(1, box.clientWidth / w, box.clientHeight / h)) / 100);
    };
    fit();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const watch = new ResizeObserver(fit);
    watch.observe(box);
    watch.observe(content);
    return () => watch.disconnect();
  }, [boxRef, contentRef]);
  return scale;
}
