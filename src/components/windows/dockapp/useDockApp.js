import React from 'react';
import { getCollaborationClientId } from '../../../lib/collaboration/clientIdentity.js';
import { sendDockCast } from '../../../lib/collaboration/liveText.js';
import { useBoardEvent } from '../../../lib/collaboration/boardEvents.js';
import { getSelf } from '../../../lib/modules/presenceRoster.js';
import { encodeCastFrame } from '../../../lib/dock/castFrame.js';
import { hasNativeDock, listDockableWindows, useNativeDock } from '../../../lib/dock/nativeDock.js';
import { CAST_STALE_MS, appName, dockSlotId, normalizeCast } from '../../../lib/dock/wire.js';

/**
 * What a dock app window shows and does. The lasting part, who docked which
 * app, rides the shared window record as `win.dock`:
 *   { target, hostClientId, hostName, app, title, process, cast }
 * `target` is a native window handle on the host's machine only; everyone
 * else gets pictures (`dock.cast`).
 */
export function useDockApp({ win, onUpdate, areaRef }) {
  const desktop = hasNativeDock();
  const selfId = React.useMemo(() => getCollaborationClientId(), []);
  const dock = win.dock || null;
  const active = Boolean(dock?.target);
  const hosting = desktop && active && dock.hostClientId === selfId;
  const casting = hosting && dock.cast !== false;
  const updateRef = React.useRef(onUpdate);
  updateRef.current = onUpdate;

  const onGone = React.useCallback(() => {
    updateRef.current?.({ dock: { ...dock, target: null } });
  }, [dock]);

  const [picking, setPicking] = React.useState(false);
  // While choosing another app, the current one goes back where it was.
  const native = useNativeDock({
    windowId: win.id, areaRef, target: hosting && !picking ? dock.target : null, cast: casting,
    send: sendDockCast, encode: encodeCastFrame, onGone,
  });

  // Pictures from whoever is hosting.
  const slot = dockSlotId(win.id);
  const [picture, setPicture] = React.useState(null);
  const [now, setNow] = React.useState(() => Date.now());
  useBoardEvent('dock.cast', (message) => {
    const cast = normalizeCast(message);
    if (!cast || cast.windowId !== slot || hosting) return;
    setPicture(cast.frame ? { ...cast, at: Date.now() } : null);
  });
  React.useEffect(() => {
    if (hosting || !active) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [hosting, active]);
  React.useEffect(() => { if (!active) setPicture(null); }, [active]);
  const stale = !picture || now - picture.at > CAST_STALE_MS;

  // Picker.
  const [candidates, setCandidates] = React.useState(null);
  const [listError, setListError] = React.useState(null);
  const refresh = React.useCallback(() => {
    if (!desktop) return;
    setListError(null);
    listDockableWindows()
      .then((list) => setCandidates(Array.isArray(list) ? list : []))
      .catch((error) => setListError(String(error?.message || error)));
  }, [desktop]);
  const showPicker = desktop && (!active || picking);
  React.useEffect(() => { if (showPicker) refresh(); }, [showPicker, refresh]);

  const pick = React.useCallback((candidate) => {
    setPicking(false);
    updateRef.current?.({
      dock: {
        target: candidate.id,
        hostClientId: selfId,
        hostName: getSelf().label || 'Someone',
        app: appName(candidate),
        title: String(candidate.title || '').slice(0, 200),
        process: String(candidate.process || '').slice(0, 120),
        cast: dock?.cast !== false,
      },
    });
  }, [selfId, dock]);

  const undock = React.useCallback(() => {
    setPicking(false);
    if (dock) updateRef.current?.({ dock: { ...dock, target: null } });
  }, [dock]);

  const setCast = React.useCallback((on) => {
    if (dock) updateRef.current?.({ dock: { ...dock, cast: Boolean(on) } });
  }, [dock]);

  // The same person on a fresh start of the desktop app gets their app back.
  const takeOver = React.useCallback(() => {
    if (dock) updateRef.current?.({ dock: { ...dock, hostClientId: selfId, hostName: getSelf().label || dock.hostName } });
  }, [dock, selfId]);

  return {
    desktop, dock, active, hosting, casting, native,
    picture: stale ? null : picture, lastPicture: picture, stale,
    picker: { open: showPicker, rows: candidates, error: listError, refresh, pick, cancel: active ? () => setPicking(false) : null },
    changeApp: () => setPicking(true), undock, setCast, takeOver,
    canTakeOver: desktop && active && !hosting && Boolean(getSelf().label) && getSelf().label === dock?.hostName,
  };
}
