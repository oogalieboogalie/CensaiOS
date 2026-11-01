import React from 'react';
import { presenceIdentity, readAwarenessPresence } from '../../lib/collaboration/awarenessPresence.js';
import { noteSignedInUser } from '../../lib/chat/agentPointer.js';
import { noteSignedInName } from '../../lib/collaboration/signedInName.js';

const SEND_EVERY_MS = 32;
const TYPING_CLEAR_MS = 3000;
const EMPTY = Object.freeze({ participants: [], cursors: {}, typing: {}, previews: {}, selections: {}, agents: {} });
const read = (awareness) => readAwarenessPresence(awareness.getStates(), awareness.clientID);
const others = (presence) => presence.participants.filter((p) => !p.self);

/**
 * Presence for everyone on the board, carried by the shared document's Yjs
 * awareness: cursor, selection, name, colour, the window being dragged and
 * the window being typed in. `awareness` is null until the shared doc
 * connects; everything here is a no-op until then. `onPeople` hears who else
 * is here while `live` (the doc has synced on its current connection,
 * useYjsCanvas.js) and null while it is not, for the "joined" pop-ups
 * (usePresenceNotices.js).
 */
export function useAwarenessPresence({ awareness, live = false, user, selectedIds, onPeople = null }) {
  const [presence, setPresence] = React.useState(EMPTY);
  const lastSent = React.useRef({ cursor: 0, drag: 0 });
  const typingTimer = React.useRef(null);
  const onPeopleRef = React.useRef(onPeople);
  onPeopleRef.current = onPeople;
  const liveRef = React.useRef(live);
  liveRef.current = live;
  const identity = React.useMemo(() => presenceIdentity(user), [user?.id, user?.name, user?.email]);
  React.useEffect(() => { noteSignedInUser(user?.id); }, [user?.id]);
  React.useEffect(() => { noteSignedInName(user ? identity.name : null); }, [user, identity.name]);

  React.useEffect(() => {
    if (!awareness) {
      setPresence(EMPTY);
      return undefined;
    }
    const refresh = (_changes, origin) => {
      const next = read(awareness);
      // When its connection closes the provider drops everyone else (and is
      // no longer synced): that is this tab going offline, not people leaving.
      if (liveRef.current && origin?.synced !== false) onPeopleRef.current?.(others(next));
      setPresence(next);
    };
    awareness.on('change', refresh);
    refresh();
    return () => {
      awareness.off('change', refresh);
      clearTimeout(typingTimer.current);
    };
  }, [awareness]);

  // A full list each time the doc (re)syncs, and null while it is offline.
  React.useEffect(() => {
    onPeopleRef.current?.(awareness && live ? others(read(awareness)) : null);
  }, [awareness, live]);

  React.useEffect(() => {
    awareness?.setLocalStateField('user', identity);
  }, [awareness, identity]);

  React.useEffect(() => {
    awareness?.setLocalStateField('selection', (selectedIds || []).slice(0, 50));
  }, [awareness, selectedIds]);

  const sendCursor = React.useCallback((x, y) => {
    const now = Date.now();
    if (!awareness || now - lastSent.current.cursor < SEND_EVERY_MS) return;
    lastSent.current.cursor = now;
    awareness.setLocalStateField('cursor', { x, y });
  }, [awareness]);

  const sendTyping = React.useCallback((windowId) => {
    if (!awareness || !windowId) return;
    if (awareness.getLocalState()?.typing !== windowId) awareness.setLocalStateField('typing', windowId);
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => awareness.setLocalStateField('typing', null), TYPING_CLEAR_MS);
  }, [awareness]);

  const previewWindowMove = React.useCallback((windowId, position) => {
    if (!awareness) return;
    if (position?.phase === 'end') {
      awareness.setLocalStateField('drag', null);
      return;
    }
    const now = Date.now();
    if (now - lastSent.current.drag < SEND_EVERY_MS) return;
    lastSent.current.drag = now;
    awareness.setLocalStateField('drag', { windowId, x: position.x, y: position.y });
  }, [awareness]);

  return React.useMemo(() => ({
    live: Boolean(awareness), ...presence, identity, sendCursor, sendTyping, previewWindowMove,
  }), [awareness, presence, identity, sendCursor, sendTyping, previewWindowMove]);
}
