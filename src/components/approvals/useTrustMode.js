import React from 'react';
import { api } from '../../lib/api.js';
import { useWorkspaceStore } from '../../lib/store.js';

/**
 * Trust mode for the open board. On (the default) means agents act without
 * waiting in Action Approvals. `agents` holds per-agent overrides.
 */
export function useTrustMode() {
  const workspaceId = useWorkspaceStore(state => state.workspaceId);
  const [state, setState] = React.useState({ board: true, agents: {}, canChange: false, ready: false, saving: false, error: '' });

  React.useEffect(() => {
    let alive = true;
    if (!workspaceId) return undefined;
    setState(s => ({ ...s, ready: false, canChange: false, error: '' })); // another board: don't show the last one's switch
    api.getAgentTrust(workspaceId)
      .then(data => alive && setState(s => ({ ...s, board: data.board !== false, agents: data.agents || {},
        canChange: Boolean(data.canChange), ready: true, error: '' })))
      .catch(error => alive && setState(s => ({ ...s, ready: true, error: error.message })));
    return () => { alive = false; };
  }, [workspaceId]);

  const save = React.useCallback(async ({ agentId, trusted }) => {
    if (!workspaceId) return;
    setState(s => ({ ...s, saving: true, error: '' }));
    try {
      const data = await api.setAgentTrust({ workspaceId, agentId, trusted });
      setState(s => ({ ...s, board: data.board !== false, agents: data.agents || {}, saving: false }));
    } catch (error) {
      setState(s => ({ ...s, saving: false, error: error.message }));
    }
  }, [workspaceId]);

  return { ...state, workspaceId, setBoard: trusted => save({ trusted }), setAgent: (agentId, trusted) => save({ agentId, trusted }) };
}
