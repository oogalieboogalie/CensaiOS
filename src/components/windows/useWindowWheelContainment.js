import React from 'react';

export function useWindowWheelContainment(ref) {
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const canScroll = (node, deltaX, deltaY) => {
      let current = node;
      while (current && current !== el) {
        if (current.nodeType !== Node.ELEMENT_NODE) {
          current = current.parentNode;
          continue;
        }
        const style = window.getComputedStyle(current);
        const canScrollY = ['auto', 'scroll'].includes(style.overflowY)
          && current.scrollHeight > current.clientHeight
          && ((deltaY < 0 && current.scrollTop > 0)
            || (deltaY > 0 && current.scrollTop + current.clientHeight < current.scrollHeight - 1));
        const canScrollX = ['auto', 'scroll'].includes(style.overflowX)
          && current.scrollWidth > current.clientWidth
          && ((deltaX < 0 && current.scrollLeft > 0)
            || (deltaX > 0 && current.scrollLeft + current.clientWidth < current.scrollWidth - 1));
        if (canScrollY || canScrollX) return true;
        current = current.parentNode;
      }
      return false;
    };
    const containWheel = (e) => {
      e.stopPropagation();
      if (!canScroll(e.target, e.deltaX, e.deltaY)) e.preventDefault();
    };
    el.addEventListener('wheel', containWheel, { passive: false });
    return () => el.removeEventListener('wheel', containWheel);
  }, [ref]);
}
