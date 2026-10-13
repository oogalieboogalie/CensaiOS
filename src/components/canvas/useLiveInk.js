import React from 'react';
import { useBoardEvent } from '../../lib/collaboration/boardEvents.js';
import { liveInkStroke, normalizeInkPreview } from '../../lib/ink/live.js';

const STALE_MS = 3000;
const END_LINGER_MS = 1500;

/**
 * Other people's strokes while they draw (spec 9). A preview goes away once
 * its finished stroke is on the board, or shortly after the pen lifts.
 */
export function useLiveInk(paths) {
  const [byClient, setByClient] = React.useState({});
  const timers = React.useRef(new Map());

  const drop = React.useCallback((clientId) => {
    setByClient((current) => {
      if (!(clientId in current)) return current;
      const next = { ...current };
      delete next[clientId];
      return next;
    });
  }, []);

  useBoardEvent('ink.preview', (message) => {
    const clean = normalizeInkPreview(message);
    if (!clean || !message.clientId) return;
    const key = String(message.clientId);
    clearTimeout(timers.current.get(key));
    timers.current.set(key, setTimeout(() => drop(key), clean.phase === 'end' ? END_LINGER_MS : STALE_MS));
    setByClient((current) => ({ ...current, [key]: { strokeId: clean.strokeId, stroke: liveInkStroke(clean) } }));
  });

  React.useEffect(() => () => { for (const t of timers.current.values()) clearTimeout(t); }, []);

  return React.useMemo(() => {
    const committed = new Set((paths || []).map((p) => p.id));
    return Object.values(byClient).filter((entry) => !committed.has(entry.strokeId)).map((entry) => entry.stroke);
  }, [byClient, paths]);
}
