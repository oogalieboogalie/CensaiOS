import React from 'react';
import { getAgents, getAgentById, refreshAgent, subscribe } from '../../lib/agentStore.js';

/**
 * The agent a chat talks to, re-rendering when its record changes (its model
 * switched here, or by a teammate). One this browser does not hold yet, made
 * on the board by a teammate since this browser opened it, is fetched, so the
 * chat is not left standing in for another agent (the first after Censai).
 */
export function useChatAgent(agentId) {
  const agent = React.useSyncExternalStore(subscribe, () => getAgentById(agentId), () => getAgentById(agentId));
  React.useEffect(() => { if (agentId && !agent) refreshAgent(agentId); }, [agentId, agent]);
  return agent || getAgents()[1];
}
