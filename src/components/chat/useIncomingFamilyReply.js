import React from 'react';
import { getAgentActivity } from '../../lib/api/agentActivity.js';
import { familyReplyNotice } from '../../lib/chat/familyReply.js';
import { useVisibilityAwareInterval } from '../../lib/usePolling.js';

// While this agent's chat is on screen, append the acceptance from a reply
// wake as soon as it finishes. The person does not type anything.
export function useIncomingFamilyReply({
  agentId, workspaceId, messages, onReply, inactive = false,
}) {
  const seen = React.useRef(new Set());
  const alive = React.useRef(true);
  const onReplyRef = React.useRef(onReply);
  const messagesRef = React.useRef(messages);
  onReplyRef.current = onReply;
  messagesRef.current = messages;

  React.useEffect(() => () => { alive.current = false; }, []);

  const load = React.useCallback(async () => {
    if (!agentId || !workspaceId) return;
    const asked = agentId;
    let data;
    try {
      data = await getAgentActivity(asked, { workspaceId });
    } catch {
      return;
    }
    if (!alive.current) return;
    const current = messagesRef.current || [];
    for (const wake of data?.wakeups || []) {
      const id = String(wake?.id ?? '');
      if (!id || seen.current.has(id)) continue;
      const notice = familyReplyNotice({ ...wake, agent_id: wake.agent_id || asked });
      if (!notice) {
        if (wake?.status === 'completed' || wake?.status === 'failed') seen.current.add(id);
        continue;
      }
      if (current.some((message) => message?.familyReplyWakeId === notice.familyReplyWakeId)) {
        seen.current.add(id);
        continue;
      }
      seen.current.add(id);
      onReplyRef.current(asked, notice);
    }
  }, [agentId, workspaceId]);

  React.useEffect(() => {
    if (!inactive) load();
  }, [load, inactive]);

  useVisibilityAwareInterval(load, agentId && workspaceId && !inactive ? 3000 : null, { inactive });
}
