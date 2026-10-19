import React from 'react';
import { SCHEDULER_AGENTS } from './constants.js';
import { AgentAvatar } from '../Agents.jsx';

export function SchedulerAgentSelect({ selectedAgentId, setSelectedAgentId }) {
  return (
    <div className="hb-sched-field">
      <span className="hb-sched-label">Who runs it</span>
      <div className="hb-sched-agents" role="group" aria-label="Who runs it">
        {SCHEDULER_AGENTS.map(agent => (
          <button
            key={agent.id}
            type="button"
            className="hb-sched-agent"
            aria-pressed={selectedAgentId === agent.id}
            title={agent.role ? `${agent.name}: ${agent.role}` : agent.name}
            onClick={() => setSelectedAgentId(agent.id)}
          >
            <AgentAvatar agent={agent} size={24} ring={selectedAgentId === agent.id} />
            <span className="hb-sched-agent-name">{agent.name.replace(/^The /, '')}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
