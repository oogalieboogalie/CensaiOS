import React from 'react';
import { useWorkspaceStore } from '../../lib/store.js';
import { DEFAULT_GROUPS } from '../../components/Dock.jsx';
import { computeFitView } from '../../lib/canvasMath.js';
import { withoutUnsupportedWindows } from '../../lib/appUtils.js';
import { applyAllowListToInitial } from '../../lib/workspace/allowList.js';
import { loadCamera, saveCamera } from '../../lib/cameraMemory.js';
import { newId } from '../../lib/ids/newId.js';

/**
 * Puts the loaded workspace on the board once: windows (through the window
 * allow-list), groups, drawings, dock and pen settings, then the camera this
 * board was last viewed at (or a fit of everything). Afterwards it remembers
 * the camera per board and hands back the pan/zoom handler for the canvas.
 */
export function useApplyInitialWorkspace({ initial, dataLoading, isInitialized, setIsInitialized, workspaceLoad, workspaceId, pan, zoom, spawnAt }) {
  React.useEffect(() => {
    if (initial && !dataLoading && !isInitialized) {
      const s = useWorkspaceStore.getState();
      // Brief B1 — apply migrated window allow-list (single helper).
      const { wins: gatedWins, windowAllowList: appliedAllowList } = applyAllowListToInitial(initial, s.windowAllowList);
      s.setWindowAllowList(appliedAllowList);
      const safeWins = withoutUnsupportedWindows(gatedWins);
      s.setWins(safeWins);
      s.setCanvasGroups(initial.canvasGroups || []);
      s.setPaths(initial.paths || []);
      s.setLinks(initial.links || []);
      if (initial.penColor) s.setPenColor(initial.penColor);
      if (initial.penSize) s.setPenSize(initial.penSize);
      const wsId = workspaceLoad.workspaceId || initial.workspaceId || newId(); s.setWorkspaceId(wsId);
      s.setPenMode(Boolean(initial.penMode));
      s.setDockOffset(initial.dockOffset || 0); s.setDock(initial.dock || { visible: false, groupOverrides: {} });
      s.setGroups(initial.groups || DEFAULT_GROUPS);
      s.setFocusMode(initial.focusMode || false);
      s.setExtraAgents(initial.extraAgents || []); s.setSidebarFavorites(initial.sidebarFavorites || []);

      const fit = loadCamera(wsId) || computeFitView(safeWins, initial.canvasGroups || []);
      s.setPan({ x: fit.x, y: fit.y });
      s.setZoom(fit.zoom);
      // Brief B2 — auto-launch the marketplace when the user has zero enabled windows (the marketplace itself is always allowed, so this only fires for fully-empty workspaces).
      if (appliedAllowList && !Object.values(appliedAllowList).some(Boolean)) setTimeout(() => spawnAt('marketplace'), 0);
      const id = requestAnimationFrame(() => setIsInitialized(true));
      return () => cancelAnimationFrame(id);
    }
  }, [initial, dataLoading, isInitialized, spawnAt]);

  React.useEffect(() => { if (isInitialized) saveCamera(workspaceId, { x: pan.x, y: pan.y, zoom }); }, [isInitialized, workspaceId, pan, zoom]);

  return React.useCallback(({ panX, panY, zoom: z }) => {
    const s = useWorkspaceStore.getState();
    s.setPan({ x: panX, y: panY });
    s.setZoom(z);
  }, []);
}
