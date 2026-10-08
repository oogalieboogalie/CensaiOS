import React from 'react';
import { useWorkspaceStore } from '../../lib/store.js';
import { setLivePresenceSenders } from '../../lib/collaboration/liveText.js';
import {
  applyCanvasWorkspaceSnapshot,
  canvasWorkspaceSnapshot,
} from '../../lib/workspace/canvasWorkspaceSnapshot.js';
import { notifyRemoteHistory } from '../../lib/workspace/historyMerge.js';
import { useCanvasWorkspacePersistence } from './useCanvasWorkspacePersistence.js';
import { useWorkspaceCollaboration } from './useWorkspaceCollaboration.js';
import { useYjsCanvas } from './useYjsCanvas.js';
import { emitBoardEvent } from '../../lib/collaboration/boardEvents.js';

export function useAppCollaboration({ enabled, workspaceId, wins, revision, onRevision, activeId }) {
  // Windows, groups, ink and dock merge live through the shared Yjs doc; the
  // revisioned snapshot save keeps running for everything else.
  const yjs = useYjsCanvas({ enabled, workspaceId });
  const crdtLive = yjs.status === 'live';
  const persistence = useCanvasWorkspacePersistence({ enabled, revision, onRevision, rebaseOnConflict: crdtLive });
  const onAuthoritativeCommit = React.useCallback((value, nextRevision) => {
    if (crdtLive) {
      // The canvas fields in this snapshot already reached us through Yjs
      // (agent edits are bridged into the doc server-side); applying the
      // snapshot could rewind newer merged edits.
      persistence.acknowledgeRevision(nextRevision);
      return true;
    }
    const snapshot = canvasWorkspaceSnapshot(value);
    if (!persistence.adoptExternal(snapshot, nextRevision)) return false;
    applyCanvasWorkspaceSnapshot(useWorkspaceStore, snapshot);
    // Tell undo history: remote state is the new baseline, not an undo step.
    notifyRemoteHistory(snapshot);
    return true;
  }, [crdtLive, persistence.acknowledgeRevision, persistence.adoptExternal]);
  const collaboration = useWorkspaceCollaboration({
    enabled, workspaceId, wins, revision, onAuthoritativeCommit, activeId, crdt: crdtLive,
    onEvent: emitBoardEvent,
  });
  React.useEffect(() => {
    setLivePresenceSenders({
      sendCursor: collaboration.sendCursor,
      sendTyping: collaboration.sendTyping,
      // With the shared doc live, the real text already streams through it.
      sendTextPreview: crdtLive ? null : collaboration.sendTextPreview,
      sendInk: collaboration.send,
    });
  }, [crdtLive, collaboration.sendCursor, collaboration.sendTyping, collaboration.sendTextPreview, collaboration.send]);
  return { persistence, collaboration, crdtStatus: yjs.status };
}
