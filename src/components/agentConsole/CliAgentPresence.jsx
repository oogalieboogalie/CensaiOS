/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { CliMark } from './CliMark.jsx';
import { useCliRoster } from './useCliRoster.js';
import './agentConsole.css';

// Coding agents at work, shown next to the people on the board: one chip per
// CLI that is running a task, amber when it is waiting for someone to allow
// a step. Square marks for agents, round avatars for people.
const selectActive = (s) => s.clis.filter((c) => c.running > 0 || c.needsApproval > 0);

export function CliAgentPresence() {
  const active = useCliRoster(selectActive);
  if (!active.length) return null;
  return (
    <span className="ac-presence" data-testid="cli-agent-presence">
      {active.map((cli) => {
        const waiting = cli.needsApproval > 0;
        const tasks = (cli.activeTasks || []).map((t) => `${t.title}${t.by ? ` (for ${t.by})` : ''}`).join('\n');
        return (
          <span key={cli.id} className={`ac-presence-chip${waiting ? ' ac-presence-chip--warn' : ''}`}
            title={`${cli.label} ${waiting ? 'is waiting for approval' : 'is working'}${tasks ? `\n${tasks}` : ''}`}>
            <CliMark cli={cli.id} size="sm" active={!waiting} />
            {waiting ? 'needs you' : cli.running > 1 ? `${cli.running} tasks` : 'working'}
          </span>
        );
      })}
    </span>
  );
}
