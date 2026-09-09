import {
  clearWorkspaceDraft,
  deleteWorkspaceAuthoritatively,
  downloadWorkspaceSnapshot,
  loadWorkspaceAuthoritatively,
  saveWorkspaceAuthoritatively,
} from './workspaceAuthority.js';

/**
   * Fetches the current workspace state.
   * @returns {Promise<Workspace|null>}
   */
export async function getWorkspace() {
    const result = await loadWorkspaceAuthoritatively();
    if (result.status !== 'ready') throw result.error || new Error('Workspace recovery is required');
    return result.value;
  }

export { clearWorkspaceDraft, downloadWorkspaceSnapshot, loadWorkspaceAuthoritatively };

/**
   * Saves the workspace state.
   * @param {Workspace} state
   * @returns {Promise<void>}
   */
export async function saveWorkspace(state, expectedRevision) {
    return saveWorkspaceAuthoritatively(state, expectedRevision);
  }

/**
   * Resets the workspace.
   * @returns {Promise<void>}
   */
export async function resetWorkspace(expectedRevision) {
    return deleteWorkspaceAuthoritatively(expectedRevision);
  }
