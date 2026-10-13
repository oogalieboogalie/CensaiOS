import React from 'react';
import { useWorkspaceStore } from '../../lib/store.js';
import { writeFirstMission } from '../../lib/firstMission.js';
import { freshBoardFor, markWokenUp, shouldWakeUp, wakeUpWindows } from '../../lib/wakeUp/boardWakeUp.js';

// A short pause so the empty board is drawn first and the windows visibly
// glide in, rather than already being there.
const SETTLE_MS = 350;

/** Wakes a brand-new board once (see src/lib/wakeUp/boardWakeUp.js). Renders nothing. */
export function BoardWakeUp() {
  const workspaceId = useWorkspaceStore((state) => state.workspaceId);

  React.useEffect(() => {
    if (!freshBoardFor(workspaceId)) return undefined;
    const timer = setTimeout(() => {
      const state = useWorkspaceStore.getState();
      if (state.workspaceId !== workspaceId || !shouldWakeUp({ workspaceId, wins: state.wins })) return;
      markWokenUp(workspaceId);
      const allow = state.windowAllowList;
      if (allow && typeof allow === 'object') {
        state.setWindowAllowList({ ...allow, chat: true, leadHound: true, tryThis: true, doc: true });
      }
      const { name } = freshBoardFor(workspaceId);
      for (const [kind, props, pos, size] of wakeUpWindows({ name })) state.spawnAt(kind, props, pos, size);
      useWorkspaceStore.getState().fitView();
      // The Try this list replaces the first mission; its last step restarts it.
      writeFirstMission(workspaceId, 'dismissed');
      window.dispatchEvent(new CustomEvent('censai:first-mission', { detail: { action: 'close' } }));
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [workspaceId]);

  return null;
}
