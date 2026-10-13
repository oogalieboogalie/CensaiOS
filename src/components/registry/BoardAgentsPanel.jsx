// Agent network — the live directory of agents on this board. Every chat
// agent, coding CLI and built module on the shared canvas, what each can
// take in, and whether it is busy. Built from the canvas windows (synced
// through Yjs), so every teammate sees the same list and the same requests.

import React from 'react';
import { useWorkspaceStore } from '../../lib/store.js';
import { getAgentById, getAgents, subscribe as subscribeAgents } from '../../lib/agentStore.js';
import { listBoardAgents, listHelpCards, searchBoardAgents } from '../../lib/agentNetwork/boardAgents.js';
import { askBoardAgent, showWindow } from '../../lib/agentNetwork/askBoardAgent.js';

const KIND_LABEL = { chat: 'Chat agent', agent: 'Agent', agentConsole: 'Coding agent', module: 'Module', leadHound: 'Lead finder' };
const STATUS_LABEL = {
  pending: 'waiting for owner', queued: 'queued', dispatched: 'queued', working: 'working',
  'needs approval': 'needs approval', completed: 'answered', failed: 'failed', declined: 'declined', cancelled: 'withdrawn',
};

// The agent list is replaced whenever an agent record (name, model) changes.
function useAgentRecords() {
  return React.useSyncExternalStore(subscribeAgents, getAgents, getAgents);
}

function AskForm({ target, agents, onSend, onClose }) {
  const [task, setTask] = React.useState('');
  const [from, setFrom] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState('');
  const askers = agents.filter((agent) => agent.windowId !== target.windowId && agent.executor === 'network');
  const submit = async (event) => {
    event.preventDefault();
    if (!task.trim()) return;
    setSending(true); setError('');
    try {
      await onSend({ target, task, fromWindowId: from || null });
      onClose();
    } catch (cause) {
      setError(cause.message || 'The request could not be sent.');
    } finally {
      setSending(false);
    }
  };
  return (
    <form className="an-ask" onSubmit={submit} data-testid="board-ask-form">
      {error && <div className="an-error" role="alert">{error}</div>}
      <textarea data-testid="board-ask-task" rows={3} maxLength={8000} value={task} onChange={(e) => setTask(e.target.value)}
        placeholder={`What should ${target.name} do? Give it everything it needs.`} />
      <div className="an-ask-row">
        <label className="an-label">Asking as
          <select data-testid="board-ask-from" value={from} onChange={(e) => setFrom(e.target.value)}>
            <option value="">Me</option>
            {askers.map((agent) => <option key={agent.windowId} value={agent.windowId}>{agent.name}</option>)}
          </select>
        </label>
        <button type="submit" className="an-btn an-btn--primary" data-testid="board-ask-send" disabled={sending || !task.trim()}>
          {sending ? 'Sending…' : 'Send'}
        </button>
        <button type="button" className="an-btn" onClick={onClose}>Cancel</button>
      </div>
    </form>
  );
}

function AgentRow({ agent, agents, open, onToggle, onSend }) {
  return (
    <div className="an-row" data-testid="board-agent" data-window-id={agent.windowId} data-status={agent.status}>
      <div className="an-row-head">
        <span className={`an-dot an-dot--${agent.status}`} title={agent.status === 'working' ? 'Working' : 'Ready'} />
        <strong>{agent.name}</strong>
        <span className="an-kind">{KIND_LABEL[agent.kind] || agent.kind}{agent.model ? ` · ${agent.model}` : ''}</span>
        <span className="an-row-actions">
          <button type="button" className="an-btn" onClick={() => showWindow(agent.windowId)}>Show</button>
          {!open && <button type="button" className="an-btn an-btn--primary" data-testid="board-ask" onClick={onToggle}>Ask</button>}
        </span>
      </div>
      <div className="an-sub">{agent.role}</div>
      <div className="an-pills">
        {agent.abilities.map((ability) => <span key={ability} className="an-pill an-pill--quiet">{ability}</span>)}
        {agent.activeRequests > 0 && <span className="an-pill an-pill--busy">{agent.activeRequests} request{agent.activeRequests === 1 ? '' : 's'}</span>}
      </div>
      {open && <AskForm target={agent} agents={agents} onSend={onSend} onClose={onToggle} />}
    </div>
  );
}

export function BoardAgentsPanel({ client }) {
  const wins = useWorkspaceStore((state) => state.wins);
  const workspaceId = useWorkspaceStore((state) => state.workspaceId);
  const records = useAgentRecords();
  const [query, setQuery] = React.useState('');
  const [openId, setOpenId] = React.useState(null);
  const agents = React.useMemo(() => {
    const byId = new Map(records.map((agent) => [agent.id, agent]));
    return listBoardAgents(wins, { agentFor: (id) => byId.get(id) || getAgentById(id) });
  }, [wins, records]);
  const shown = React.useMemo(() => searchBoardAgents(agents, query), [agents, query]);
  const cards = React.useMemo(() => listHelpCards(wins).slice(0, 8), [wins]);
  const send = (input) => askBoardAgent({ ...input, client, workspaceId });

  return (
    <section className="an-board" data-testid="board-agents">
      <div className="an-section-head">
        <span className="an-section">On this board</span>
        <span className="an-count">{agents.length} agent{agents.length === 1 ? '' : 's'} · {agents.filter((a) => a.status === 'working').length} working</span>
      </div>
      {agents.length > 0 && (
        <input className="an-search" data-testid="board-agent-query" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by what they can do, e.g. images, code, databases" />
      )}
      {agents.length === 0 && (
        <div className="an-empty" data-testid="board-agents-empty">
          No agents on this board yet. Open a chat, an Agent Console or a module and it shows up here.
        </div>
      )}
      {shown.map((agent) => (
        <AgentRow key={agent.windowId} agent={agent} agents={agents} open={openId === agent.windowId}
          onToggle={() => setOpenId((current) => (current === agent.windowId ? null : agent.windowId))} onSend={send} />
      ))}
      {cards.length > 0 && (
        <>
          <div className="an-section-head"><span className="an-section">Requests on this board</span></div>
          {cards.map((card) => (
            <button key={card.id} type="button" className="an-request" data-testid="board-request" onClick={() => showWindow(card.id)}>
              <span>{card.fromLabel} → {card.toLabel}</span>
              <span className="an-request-task">{card.task}</span>
              <span className="an-kind">{STATUS_LABEL[card.status] || card.status}</span>
            </button>
          ))}
        </>
      )}
    </section>
  );
}
