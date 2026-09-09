import React from 'react';
import { api } from '../../lib/api.js';
import { useWorkspaceStore } from '../../lib/store.js';

export function useApprovalInbox() {
  const workspaceId = useWorkspaceStore(state => state.workspaceId);
  const [state, setState] = React.useState({
    approvals: [], canDecide: false, loading: false, decidingId: null, error: '', loadedWorkspaceId: '',
  });
  const requestRef = React.useRef(0);

  const load = React.useCallback(async ({ quiet = false } = {}) => {
    const requestId = ++requestRef.current;
    if (!workspaceId) {
      setState(current => ({ ...current, approvals: [], canDecide: false, loading: false,
        error: 'Open a workspace to review agent actions.', loadedWorkspaceId: '' }));
      return;
    }
    if (!quiet) setState(current => ({ ...current, loading: true, approvals: [], error: '', loadedWorkspaceId: '' }));
    try {
      const payload = await api.getToolApprovals(workspaceId);
      if (requestId !== requestRef.current) return;
      setState(current => ({ ...current, approvals: payload.approvals || [],
        canDecide: Boolean(payload.canDecide), loading: false, decidingId: null,
        error: '', loadedWorkspaceId: workspaceId }));
    } catch (error) {
      if (requestId !== requestRef.current) return;
      setState(current => ({ ...current, approvals: [], canDecide: false, loading: false, decidingId: null,
        error: error.message || 'Tool approvals could not be loaded.', loadedWorkspaceId: '' }));
    }
  }, [workspaceId]);

  React.useEffect(() => { load(); return () => { requestRef.current += 1; }; }, [load]);

  const decide = async (approval, decision) => {
    if (!workspaceId || state.loadedWorkspaceId !== workspaceId || state.decidingId) return false;
    setState(current => ({ ...current, decidingId: approval.id, error: '' }));
    try {
      await api.decideToolApproval(approval.id, { workspaceId, decision, revision: approval.revision });
      await load({ quiet: true });
      return true;
    } catch (error) {
      const message = error.message || 'The approval decision was not saved.';
      await load({ quiet: true });
      setState(current => ({ ...current, decidingId: null, error: message }));
      return false;
    }
  };

  return { ...state, workspaceId, ready: Boolean(workspaceId && state.loadedWorkspaceId === workspaceId), load, decide };
}
