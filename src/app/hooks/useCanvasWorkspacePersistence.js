import React from 'react';
import { useWorkspaceStore } from '../../lib/store.js';
import { canvasWorkspaceSnapshot } from '../../lib/workspace/canvasWorkspaceSnapshot.js';
import { useWorkspacePersistence } from './useWorkspacePersistence.js';

export function useCanvasWorkspacePersistence({ enabled, revision, onRevision }) {
  const state = useWorkspaceStore();
  const workspace = React.useMemo(() => canvasWorkspaceSnapshot(state),
    [state.workspaceId, state.currentProject, state.wins, state.canvasGroups,
    state.dockOffset, state.dock, state.groups, state.focusMode, state.paths, state.links,
    state.extraAgents, state.penColor, state.penSize, state.penMode,
    state.sidebarFavorites, state.windowAllowList]);
  return useWorkspacePersistence({ enabled, workspace, revision, onRevision });
}
