import React from 'react';
import { diffPresenceNotices } from '../../lib/collaboration/liveText.js';
import { presenceIdentity, readAwarenessPresence } from '../../lib/collaboration/awarenessPresence.js';
import { noteSignedInUser } from '../../lib/chat/agentPointer.js';

const SEND_EVERY_MS = 32;
const TYPING_CLEAR_MS = 3000;
const EMPTY = Object.freeze({ participants: [], cursors: {}, typing: {}, previews: {}, selections: {}, agents: {} });

/**
 * Presence for everyone on the board, carried by the shared document's Yjs
 * awareness: cursor, selection, name, colour, the window being dragged and
 * the window being typed in. `awareness` is null until the shared doc
 * connects; everything here is a no-op until then.
 */
export function useAwarenessPresence({ awareness, user, selectedIds }) {
  const [presence, setPresence] = React.useState(EMPTY);
  const [notices, setNotices] = React.useState([]);
  const lastSent = React.useRef({ cursor: 0, drag: 0 });
  const typingTimer = React.useRef(null);
  const baseline = React.useRef(null);
  const identity = React.useMemo(() => presenceIdentity(user), [user?.id, user?.name, user?.email]);
  const selfIdRef = React.useRef(identity.id);
  selfIdRef.current = identity.id;
  React.useEffect(() => { noteSignedInUser(user?.id); }, [user?.id]);

  React.useEffect(() => {
    if (!awareness) {
      setPresence(EMPTY);
      baseline.current = null;
      return undefined;
    }
    const refresh = () => {
      const next = readAwarenessPresence(awareness.getStates(), awareness.clientID);
      const others = next.participants.filter((p) => !p.self);
      if (baseline.current) {
        const joinedOrLeft = diffPresenceNotices(baseline.current, others, { selfId: selfIdRef.current });
        if (joinedOrLeft.length) setNotices((current) => [...current, ...joinedOrLeft].slice(-5));
      }
      baseline.current = others;
      setPresence(next);
    };
    awareness.on('change', refresh);
    refresh();
    return () => {
      awareness.off('change', refresh);
      clearTimeout(typingTimer.current);
    };
  }, [awareness]);

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
    live: Boolean(awareness), ...presence, notices, identity, sendCursor, sendTyping, previewWindowMove,
  }), [awareness, presence, notices, identity, sendCursor, sendTyping, previewWindowMove]);
}
