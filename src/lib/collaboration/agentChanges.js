// A teammate saved an agent with another model (server/ws/agentChangeMessages.js
// relays it to the board): fetch the agents again, so this board's open copies
// of the chat show the new model, and Grok's sign-in bar, at once. The server's
// list holds only the built-in agents, so each agent made on the board is
// fetched by itself too; every one is, since the board may say two quick
// changes as one.
import React from 'react';
import { onBoardEvent } from './boardEvents.js';
import { refreshAgents, refreshBoardAgents } from '../agentStore.js';

function fetchAgentsAgain() {
  refreshAgents();
  refreshBoardAgents();
}

/** Until the returned stop is called, each agent a teammate changes is fetched again. */
export function followAgentChanges() {
  return onBoardEvent('agent.changed', fetchAgentsAgain);
}

/**
 * Follows teammates' agent changes while the board shares live (`enabled`);
 * when the board's socket (`status`) is back from a drop, fetches the agents
 * once more for any change said while it was away.
 */
export function useAgentChanges(enabled, status) {
  React.useEffect(() => (enabled ? followAgentChanges() : undefined), [enabled]);
  const wasLive = React.useRef(false);
  React.useEffect(() => {
    if (!enabled || status !== 'live') return;
    if (wasLive.current) fetchAgentsAgain();
    wasLive.current = true;
  }, [enabled, status]);
}
