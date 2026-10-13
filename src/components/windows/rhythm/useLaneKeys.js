import React from 'react';

const KEYS = { KeyD: 0, KeyF: 1, KeyJ: 2, KeyK: 3 };
export const KEY_LABELS = ['D', 'F', 'J', 'K'];

/**
 * While `active`, D F J K on the window play the four lanes and Escape quits.
 * Keys stop at the window so canvas shortcuts don't fire mid-song, and
 * leaving the tab quits the run.
 */
export function useLaneKeys(containerRef, active, { onLane, onQuit }) {
  const handlers = React.useRef({ onLane, onQuit });
  handlers.current = { onLane, onQuit };
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el || !active) return undefined;
    const onDown = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); handlers.current.onQuit(); return; }
      if (e.key === 'Tab') return;
      e.stopPropagation();
      const lane = KEYS[e.code];
      if (lane === undefined) return;
      e.preventDefault();
      if (!e.repeat) handlers.current.onLane(lane, true);
    };
    const onUp = (e) => {
      e.stopPropagation();
      const lane = KEYS[e.code];
      if (lane !== undefined) handlers.current.onLane(lane, false);
    };
    const onHidden = () => { if (document.visibilityState === 'hidden') handlers.current.onQuit(); };
    el.addEventListener('keydown', onDown);
    el.addEventListener('keyup', onUp);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      el.removeEventListener('keydown', onDown);
      el.removeEventListener('keyup', onUp);
      document.removeEventListener('visibilitychange', onHidden);
    };
  }, [containerRef, active]);
}
