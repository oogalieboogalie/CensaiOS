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

export function useAppCollaboration({ enabled, workspaceId, wins, revision, onRevision, activeId }) {
  const persistence = useCanvasWorkspacePersistence({ enabled, revision, onRevision });
  const onAuthoritativeCommit = React.useCallback((value, nextRevision) => {
    const snapshot = canvasWorkspaceSnapshot(value);
    if (!persistence.adoptExternal(snapshot, nextRevision)) return false;
    applyCanvasWorkspaceSnapshot(useWorkspaceStore, snapshot);
    // Tell undo history: remote state is the new baseline, not an undo step.
    notifyRemoteHistory(snapshot);
    return true;
  }, [persistence.adoptExternal]);
  const collaboration = useWorkspaceCollaboration({
    enabled, workspaceId, wins, revision, onAuthoritativeCommit, activeId,
  });
  React.useEffect(() => {
    setLivePresenceSenders({
      sendCursor: collaboration.sendCursor,
      sendTyping: collaboration.sendTyping,
      sendTextPreview: collaboration.sendTextPreview,
    });
  }, [collaboration.sendCursor, collaboration.sendTyping, collaboration.sendTextPreview]);
  return { persistence, collaboration };
}
