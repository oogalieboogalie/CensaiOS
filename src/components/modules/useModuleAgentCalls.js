import React from 'react';
import { getCollaborationClientId } from '../../lib/collaboration/clientIdentity.js';
import { getSelf } from '../../lib/modules/presenceRoster.js';
import { AGENT_CALL_STATUS, claimPatch, finishPatch, runningPatch } from '../../lib/modules/moduleAgentCalls.js';

// "Chat to module", browser half. An agent's tool call arrives on the module
// window record (`agentCall`, written by server/modules/moduleAgentTools.js),
// so every browser on the board sees it. One browser runs it: each one that
// can edit claims the call, the board's CRDT settles on a single claim, and
// after a short wait only the winner presses the tool inside its sandbox and
// writes the result back for the agent (and everyone watching) to read.

export const CLAIM_SETTLE_MS = 400;

export function useModuleAgentCalls({ win, onUpdate, bridgeRef }) {
  const clientId = React.useMemo(() => getCollaborationClientId(), []);
  const latest = React.useRef(win);
  latest.current = win;
  const claimed = React.useRef(new Set());
  const started = React.useRef(new Set());
  const call = win.agentCall;

  React.useEffect(() => {
    if (!call?.id || !clientId) return undefined;
    if (call.status === AGENT_CALL_STATUS.waiting) {
      if (claimed.current.has(call.id) || getSelf().canEdit === false) return undefined;
      claimed.current.add(call.id);
      onUpdate?.({ agentCall: claimPatch(call, clientId) });
      return undefined;
    }
    if (call.status !== AGENT_CALL_STATUS.claimed || call.runner !== clientId || started.current.has(call.id)) return undefined;
    const timer = setTimeout(async () => {
      const now = latest.current.agentCall;
      if (!now || now.id !== call.id || now.status !== AGENT_CALL_STATUS.claimed || now.runner !== clientId) return;
      started.current.add(call.id);
      onUpdate?.({ agentCall: runningPatch(now) });
      try {
        const bridge = bridgeRef.current;
        if (!bridge) throw new Error('The module is not running in this browser.');
        const result = await bridge.callTool(now.tool, now.input || {});
        onUpdate?.({ agentCall: finishPatch(latest.current.agentCall || now, { result }) });
      } catch (error) {
        onUpdate?.({ agentCall: finishPatch(latest.current.agentCall || now, { error: error?.message || 'The tool failed.' }) });
      }
    }, CLAIM_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [call?.id, call?.status, call?.runner, clientId, onUpdate, bridgeRef]);

  return call || null;
}
