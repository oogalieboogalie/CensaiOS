import React from 'react';
import { setLivePresenceSenders } from '../../lib/collaboration/liveText.js';
import { applyAwarenessPresence, mergeGuestPresence, presenceIdentity } from '../../lib/collaboration/awarenessPresence.js';
import { useAwarenessPresence } from './useAwarenessPresence.js';
import { useCanvasWorkspacePersistence } from './useCanvasWorkspacePersistence.js';
import { usePresenceNotices } from './usePresenceNotices.js';
import { useWorkspaceCollaboration } from './useWorkspaceCollaboration.js';
import { useYjsCanvas } from './useYjsCanvas.js';
import { emitBoardEvent } from '../../lib/collaboration/boardEvents.js';
import { DEMO } from '../../lib/demo/demoMode.js';

export function useAppCollaboration({ enabled: wanted, workspaceId, wins, revision, onRevision, activeId, user, selectedIds, holdDraft }) {
  // The try-it board has no server to share with, so it stays local.
  const enabled = wanted && !DEMO;
  // The shared Yjs doc is the only source of truth for windows, groups, ink,
  // links and dock. The snapshot save only carries the settings beside them
  // (it merges server-side, so it never conflicts), and while the doc is not
  // connected the canvas waits in a local draft instead of racing it.
  const yjs = useYjsCanvas({ enabled, workspaceId });
  const crdtLive = yjs.status === 'live';
  const persistence = useCanvasWorkspacePersistence({
    enabled, revision, onRevision, canvasSource: 'yjs', canvasLive: crdtLive, boardSaves: yjs.boardSaves, holdDraft,
  });
  // Commits from other writers reach the canvas through the shared doc (the
  // server mirrors whole-snapshot writes into it), so only the revision is
  // recorded; adopting the snapshot could rewind newer merged edits.
  const onAuthoritativeCommit = React.useCallback((_value, nextRevision) => {
    persistence.acknowledgeRevision(nextRevision);
    return true;
  }, [persistence.acknowledgeRevision]);
  // Both the shared doc and the socket say who is here; the pop-ups count
  // each person once across the two.
  const people = usePresenceNotices(presenceIdentity(user).id);
  const presence = useAwarenessPresence({
    awareness: yjs.awareness, live: yjs.presenceLive, user, selectedIds, onPeople: people.seeDoc,
  });
  const socket = useWorkspaceCollaboration({
    enabled, workspaceId, wins, revision, onAuthoritativeCommit, activeId, crdt: crdtLive,
    onEvent: emitBoardEvent, onPeople: people.seeSocket,
  });
  // Members' presence comes from awareness; guests and spectators (who may
  // not hold the shared doc) still arrive over the collaboration socket, so
  // local presence goes out on both and the socket keeps only guests.
  const merged = React.useMemo(
    () => (presence.live ? mergeGuestPresence(presence, socket) : null),
    [presence, socket],
  );
  const displayWins = React.useMemo(
    () => (merged ? applyAwarenessPresence(wins, merged, activeId) : socket.displayWins),
    [merged, wins, activeId, socket.displayWins],
  );
  const { sendCursor: socketCursor, sendTyping: socketTyping, previewWindowMove: socketMove } = socket;
  const sendCursor = React.useCallback((x, y) => { presence.sendCursor(x, y); socketCursor(x, y); }, [presence.sendCursor, socketCursor]);
  const sendTyping = React.useCallback((id) => { presence.sendTyping(id); socketTyping(id); }, [presence.sendTyping, socketTyping]);
  const previewWindowMove = React.useCallback((id, position) => {
    presence.previewWindowMove(id, position);
    socketMove(id, position);
  }, [presence.previewWindowMove, socketMove]);
  // Oldest first, so the pop-ups show the newest whichever list it came from.
  const notices = React.useMemo(
    () => [...(socket.notices || []), ...people.notices].sort((a, b) => (a.at || 0) - (b.at || 0)).slice(-5),
    [socket.notices, people.notices],
  );
  const collaboration = React.useMemo(() => (merged ? {
    ...socket,
    status: 'live',
    participants: merged.participants,
    cursors: merged.cursors,
    agents: merged.agents,
    notices,
    displayWins,
    previewWindowMove,
    sendCursor,
    sendTyping,
  } : { ...socket, notices }), [merged, socket, notices, displayWins, previewWindowMove, sendCursor, sendTyping]);
  React.useEffect(() => {
    setLivePresenceSenders({
      sendCursor: collaboration.sendCursor,
      sendTyping: collaboration.sendTyping,
      // With the shared doc live, the real text already streams through it.
      sendTextPreview: crdtLive ? null : socket.sendTextPreview,
      sendInk: socket.send,
      sendGame: socket.send,
      sendDock: socket.send,
    });
  }, [crdtLive, collaboration.sendCursor, collaboration.sendTyping, socket.sendTextPreview, socket.send]);
  return { persistence, collaboration, crdtStatus: yjs.status };
}
