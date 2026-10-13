import React from 'react';
import { useCommentStore } from '../../lib/comments/commentStore.js';
import { useBoardEvent } from '../../lib/collaboration/boardEvents.js';

/**
 * Keep the comment store loaded for this board and merge live updates.
 * Reloads whenever the socket (re)connects so nothing missed while offline
 * stays missing.
 */
export function useBoardComments({ mode, workspaceId, enabled, live }) {
  React.useEffect(() => {
    if (!enabled) return;
    const store = useCommentStore.getState();
    store.configure({ mode, workspaceId });
    if (live) useCommentStore.getState().load();
  }, [mode, workspaceId, enabled, live]);
  useBoardEvent('comment.upsert', (message) => {
    if (enabled) useCommentStore.getState().upsert(message.comment);
  });
}
