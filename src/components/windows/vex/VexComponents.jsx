// The look of these pieces is in ./vex.css, on the shared depth pieces
// (src/styles/depth.css). No sizes or colours are typed in here.

export function AgentTypeBadge({ type }) {
  return <span className="vex-badge" data-type={type}>{type}</span>;
}

export function StatusDot({ active }) {
  return <span className="vex-dot" data-on={active ? 'true' : 'false'} />;
}

export function AgentRow({ agent }) {
  const capabilities = agent.capabilities || [];
  return (
    <div className="hb-panel vex-agent">
      <StatusDot active={!agent.degraded} />
      <div className="vex-agent-main">
        <div className="vex-agent-head">
          <span className="vex-agent-name">{agent.name}</span>
          {agent.type && <AgentTypeBadge type={agent.type} />}
          {agent.degraded && <span className="vex-warn">⚠ degraded</span>}
        </div>
        <div className="vex-agent-text">{agent.description || 'No description.'}</div>
        {capabilities.length > 0 && (
          <div className="vex-caps">
            {capabilities.map((cap) => <span key={cap} className="vex-cap">{cap}</span>)}
          </div>
        )}
      </div>
      <div className="vex-agent-meta">
        {agent.version && <span>v{agent.version}</span>}
        {agent.timeout_ms != null && <span>{agent.timeout_ms}ms</span>}
        <span>@{agent.owner || '—'}</span>
      </div>
    </div>
  );
}

export function RunLogItem({ event }) {
  const level = event.level === 'error' ? 'error' : event.level === 'warn' ? 'warn' : 'info';
  const prefix = level === 'error' ? '✗' : level === 'warn' ? '⚠' : '→';
  const ts = new Date(event.ts).toLocaleTimeString();
  return (
    <div className="vex-log-line">
      <span className="vex-log-time">{ts}</span>
      <span className="vex-log-mark" data-level={level}>{prefix}</span>
      <span className="vex-log-agent">[{event.agent}]</span>
      <span className="vex-log-msg">{event.msg}</span>
    </div>
  );
}

export function RunCard({ run, isActive, onClick }) {
  const done = run.status === 'complete';
  const ok = run.agents_succeeded === run.agents_dispatched && run.agents_dispatched > 0;
  const tone = done ? (ok ? 'good' : 'warn') : 'busy';
  return (
    <button
      type="button"
      className="hb-panel hb-lift vex-runcard"
      aria-current={isActive ? 'true' : undefined}
      onClick={onClick}
    >
      <span className="vex-runcard-head">
        <StatusDot active={!done} />
        <span className="vex-runcard-id">{run.run_id?.replace('run_', '')}</span>
        <span className="vex-runcard-count" data-tone={tone}>
          {done ? `${run.agents_succeeded ?? 0}/${run.agents_dispatched ?? 0}` : '…'}
        </span>
      </span>
      {run.task && <span className="vex-runcard-task">{run.task}</span>}
    </button>
  );
}
