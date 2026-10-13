import React from 'react';
import { DEFAULT_GROUPS } from '../../components/Dock.jsx';
import { withoutUnsupportedWindows } from '../../lib/appUtils.js';
import { applyAllowListToInitial, migrateWorkspace } from '../../lib/workspace/allowList.js';
import { clearWorkspaceDraft } from '../../lib/api/workspaceAuthority.js';
import { api } from '../../lib/api.js';

// Newer browser draft from an unfinished save: offered back via a
// non-blocking bar, never a fullscreen gate. Applying it re-runs the
// same allow-list + gating path as boot so the canvas stays consistent.
// Extracted from AppContent.jsx with no logic changes.
export function useWorkspaceDraft({
  workspaceLoad,
  windowAllowList,
  setWindowAllowList,
  setWins,
  setCanvasGroups,
  setPaths,
  setLinks,
  setPenColor,
  setPenSize,
  setPenMode,
  setDockOffset,
  setDock,
  setGroups,
  setFocusMode,
  setExtraAgents,
  setSidebarFavorites,
}) {
  const [draftDismissed, setDraftDismissed] = React.useState(false);
  React.useEffect(() => { setDraftDismissed(false); }, [workspaceLoad]);
  const pendingDraft = !draftDismissed && workspaceLoad.status === 'draft_required' ? workspaceLoad.draft : null;

  const restoreDraft = React.useCallback(() => {
    const value = workspaceLoad.draft?.value;
    if (!value) return;
    const migrated = migrateWorkspace(value || {});
    const { wins: gatedWins, windowAllowList: appliedAllowList } = applyAllowListToInitial(migrated, windowAllowList);
    setWindowAllowList(appliedAllowList);
    setWins(withoutUnsupportedWindows(gatedWins));
    setCanvasGroups(migrated.canvasGroups || []);
    setPaths(migrated.paths || []);
    setLinks(migrated.links || []);
    if (migrated.penColor) setPenColor(migrated.penColor);
    if (migrated.penSize) setPenSize(migrated.penSize);
    setPenMode(Boolean(migrated.penMode));
    setDockOffset(migrated.dockOffset || 0);
    setDock(migrated.dock || { visible: false, groupOverrides: {} });
    setGroups(migrated.groups || DEFAULT_GROUPS);
    setFocusMode(migrated.focusMode || false);
    setExtraAgents(migrated.extraAgents || []);
    setSidebarFavorites(migrated.sidebarFavorites || []);
    clearWorkspaceDraft();
    setDraftDismissed(true);
  }, [workspaceLoad, windowAllowList, setWindowAllowList, setWins, setCanvasGroups, setPaths, setLinks, setPenColor, setPenSize, setPenMode, setDockOffset, setDock, setGroups, setFocusMode, setExtraAgents, setSidebarFavorites]);

  const discardDraft = React.useCallback(() => {
    clearWorkspaceDraft();
    setDraftDismissed(true);
  }, []);

  const downloadDraft = React.useCallback(() => {
    if (pendingDraft?.value) api.downloadWorkspaceSnapshot(pendingDraft.value, 'draft');
  }, [pendingDraft]);

  return { pendingDraft, restoreDraft, discardDraft, downloadDraft };
}
