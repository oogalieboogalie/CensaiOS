import React from 'react';
import { useTheme } from '../../components/Theme.jsx';
import { useWorkspaceStore } from '../../lib/store.js';

/**
 * Tiled groups follow the look's group gap, and workspaces saved before
 * groups went frameless (32 px inner padding) settle into their tiles once
 * loaded. Deferred a tick so the theme provider has pushed the new gap to
 * the layout module first (its effect runs after ours).
 */
export function useGroupTileReconcile(isInitialized) {
  const groupGap = useTheme()?.theme?.groupGap;
  React.useEffect(() => {
    if (!isInitialized) return undefined;
    const timer = setTimeout(() => useWorkspaceStore.getState().reconcileGroupTiles?.(), 0);
    return () => clearTimeout(timer);
  }, [isInitialized, groupGap]);
}
