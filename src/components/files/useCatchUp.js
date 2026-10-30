import React from 'react';

// Files catches up with what changed in its folders outside censaiOS: the
// computer's own file manager, an agent or a terminal adding, deleting or
// putting back files. `tick` moves every few seconds while the app is in
// view, and on `catchUp()` (the project's versions saw a change); `used`
// (and `tick`) moves when the window is used again or the app comes back
// into view. Tree re-lists each open folder on `tick`, and one that could not
// be listed only on `used`, so a folder that is gone is not asked about every
// few seconds.
export const CATCH_UP_MS = 5_000;

export function useCatchUp(watching, isActive) {
  const [live, setLive] = React.useState({ tick: 0, used: 0 });
  const catchUp = React.useCallback(() => setLive((l) => ({ ...l, tick: l.tick + 1 })), []);
  const usedAgain = React.useCallback(() => setLive((l) => ({ tick: l.tick + 1, used: l.used + 1 })), []);

  const wasActive = React.useRef(isActive);
  React.useEffect(() => {
    if (watching && isActive && !wasActive.current) usedAgain();
    wasActive.current = isActive;
  }, [watching, isActive, usedAgain]);

  React.useEffect(() => {
    if (!watching) return undefined;
    const timer = setInterval(() => { if (!document.hidden) catchUp(); }, CATCH_UP_MS);
    const back = () => { if (!document.hidden) usedAgain(); };
    document.addEventListener('visibilitychange', back);
    window.addEventListener('focus', back);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', back);
      window.removeEventListener('focus', back);
    };
  }, [watching, catchUp, usedAgain]);

  return { ...live, catchUp };
}
