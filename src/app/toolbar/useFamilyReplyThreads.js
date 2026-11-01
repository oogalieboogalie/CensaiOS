import React from 'react';
import { getAgentActivity } from '../../lib/api/agentActivity.js';
import { familyReplyNotice } from '../../lib/chat/familyReply.js';
import { useVisibilityAwareInterval } from '../../lib/usePolling.js';

// Poll every family thread, not only the one on screen. A reply that
// finishes while another agent is selected still lands in the right thread
// before it ages out of the five-wakeup window.
export function useFamilyReplyThreads({
  agentIds, workspaceId, threads, onReply, inactive = false,
}) {
  const seen = React.useRef(new Set());
  const alive = React.useRef(true);
  const onReplyRef = React.useRef(onReply);
  const threadsRef = React.useRef(threads);
  onReplyRef.current = onReply;
  threadsRef.current = threads;
  const idsKey = (agentIds || []).filter(Boolean).join('\n');

  React.useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const load = React.useCallback(async () => {
    if (!workspaceId || !idsKey) return;
    const ids = idsKey.split('\n');
    await Promise.all(ids.map(async (asked) => {
      let data;
      try {
        data = await getAgentActivity(asked, { workspaceId });
      } catch {
        return;
      }
      if (!alive.current) return;
      const current = threadsRef.current?.[asked] || [];
      for (const wake of data?.wakeups || []) {
        const id = String(wake?.id ?? '');
        if (!id || seen.current.has(id)) continue;
        if (wake?.agent_id && String(wake.agent_id) !== asked) continue;
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
    }));
  }, [idsKey, workspaceId]);

  React.useEffect(() => {
    if (!inactive) load();
  }, [load, inactive]);

  useVisibilityAwareInterval(load, workspaceId && idsKey && !inactive ? 3000 : null, { inactive });
}
