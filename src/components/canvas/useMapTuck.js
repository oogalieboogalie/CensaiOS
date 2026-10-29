import React from 'react';
import { mapScreenBox, underBox } from '../../lib/canvas/minimapMath.js';
import { setScreenFurniture } from '../../lib/screenFurniture.js';

/** True while `on`, and for `ms` after it turns off, so the map does not flicker as windows slide past. */
function useLingering(on, ms) {
  const [late, setLate] = React.useState(on);
  React.useEffect(() => {
    if (on) { setLate(true); return undefined; }
    const timer = setTimeout(() => setLate(false), ms);
    return () => clearTimeout(timer);
  }, [on, ms]);
  return on || late;
}

/**
 * Keeps the Board map out of the way. While a board window sits under the
 * full map, and the pointer is not on it, the map tucks into its small tab; a
 * click on the tab holds it open until nothing is under it any more. Its spot
 * is marked as taken, so new windows open clear of it when there is room.
 */
export function useMapTuck({ w, h, screen, shown, pan, zoom, small }) {
  const mapRef = React.useRef(null);
  // The head ("Board map, 3 windows") can make the map wider than its picture,
  // so the full map's real width is measured while it shows.
  const [shownW, setShownW] = React.useState(0);
  const box = mapScreenBox(w, h, screen, shownW);
  const covered = useLingering(underBox(box, shown, pan, zoom), 400);
  const [held, setHeld] = React.useState(false);
  // While the pointer is on the map (aiming a click, or dragging to slide the
  // board) it stays open, even when a window slides under it.
  const [inUse, setInUse] = React.useState(false);
  React.useEffect(() => { if (!covered) setHeld(false); }, [covered]);
  React.useEffect(() => { if (small) setInUse(false); }, [small]);
  const tucked = covered && !held && !inUse;
  const full = !small && !tucked;
  React.useLayoutEffect(() => {
    const el = mapRef.current;
    if (!full || !el) return undefined;
    const measure = () => {
      const width = Math.round(el.getBoundingClientRect().width);
      if (width) setShownW(width);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    return () => watch.disconnect();
  }, [full]);
  React.useEffect(() => {
    setScreenFurniture('board-map', small ? null : box);
    return () => setScreenFurniture('board-map', null);
  }, [small, box.x, box.y, box.w, box.h]);
  return {
    tucked,
    mapRef,
    hold: () => { if (covered) setHeld(true); },
    pointer: { onPointerEnter: () => setInUse(true), onPointerLeave: () => setInUse(false) },
  };
}
