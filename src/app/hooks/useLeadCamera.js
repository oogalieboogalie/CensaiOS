import React from 'react';

const CAMERA_INTERVAL_MS = 200;

/**
 * Send this browser's view (pan and zoom) over the collaboration socket,
 * at most five times a second, so others can follow it. Used by a class
 * student on their own seat (spec 12); the host of a live show has the same
 * loop in OwnerShareLayer.
 */
export function useLeadCamera({ enabled, send, pan, zoom }) {
  const last = React.useRef(0);
  const timer = React.useRef(null);
  React.useEffect(() => {
    if (!enabled || !send) return undefined;
    const emit = () => {
      last.current = Date.now();
      send({ type: 'camera', x: pan.x, y: pan.y, zoom, width: window.innerWidth, height: window.innerHeight });
    };
    const wait = CAMERA_INTERVAL_MS - (Date.now() - last.current);
    clearTimeout(timer.current);
    if (wait <= 0) emit();
    else timer.current = setTimeout(emit, wait);
    return () => clearTimeout(timer.current);
  }, [enabled, send, pan.x, pan.y, zoom]);
  // Re-send now and then so a tab that opens later picks the view up.
  React.useEffect(() => {
    if (!enabled || !send) return undefined;
    const id = setInterval(() => {
      if (Date.now() - last.current > 2000) {
        last.current = Date.now();
        send({ type: 'camera', x: pan.x, y: pan.y, zoom, width: window.innerWidth, height: window.innerHeight });
      }
    }, 2000);
    return () => clearInterval(id);
  }, [enabled, send, pan.x, pan.y, zoom]);
}
