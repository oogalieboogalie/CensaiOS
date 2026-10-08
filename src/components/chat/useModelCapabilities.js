import React from 'react';
import { fetchChatCapabilities } from '../../lib/chat.js';
import { getModelCapabilities } from '../../lib/chat/modelCapabilities.js';

/**
 * What the agent's model accepts. Starts from the agent record (so controls
 * render immediately and in demo mode), then takes the server's answer, which
 * also knows about vault-key model overrides and the server default model.
 */
export function useModelCapabilities(agent, { workspaceId, demoMode = false } = {}) {
  const provider = agent?.model_provider || agent?.modelProvider || null;
  const model = agent?.model_name || agent?.modelName || '';
  const local = React.useMemo(() => getModelCapabilities(provider, model), [provider, model]);
  const [remote, setRemote] = React.useState(null);

  React.useEffect(() => {
    if (demoMode || !agent?.id) return undefined;
    let cancelled = false;
    setRemote(null);
    fetchChatCapabilities(agent.id, { workspaceId })
      .then((data) => {
        if (!cancelled && data?.capabilities) setRemote(data.capabilities);
      })
      .catch(() => { /* keep the local map */ });
    return () => { cancelled = true; };
  }, [agent?.id, provider, model, workspaceId, demoMode]);

  return remote || local;
}
