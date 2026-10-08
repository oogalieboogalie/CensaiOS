// RegistryWindow tab — the agent network. Agents advertise skills on their
// cards; here a person (or an agent acting for them) finds the right
// helper and asks it to take a task. The same discovery + request API is
// exposed to agents as the discover_agents / request_agent_help tools.

import React from 'react';
import { AgentDiscoverPanel } from './AgentDiscoverPanel.jsx';
import { HelpRequestsPanel } from './HelpRequestsPanel.jsx';
import { useHelpRequests } from './useHelpRequests.js';

export function NetworkTab({ client, enabled = true }) {
  const requests = useHelpRequests(client, enabled);
  if (!enabled) {
    return (
      <div role="status" style={{ padding: 18, color: 'var(--ink-soft)' }}>
        Open a workspace to find agents and ask them for help.
      </div>
    );
  }
  return (
    <div data-testid="registry-network" style={{ padding: 12, display: 'grid', gap: 14, alignContent: 'start', flex: 1, minHeight: 0, overflow: 'auto' }}>
      {requests.error && <div role="alert" style={{ color: 'var(--ps-red)', fontSize: 'var(--text-sm)' }}>{requests.error}</div>}
      <AgentDiscoverPanel client={client} onRequested={requests.refresh} />
      <HelpRequestsPanel requests={requests} />
    </div>
  );
}
