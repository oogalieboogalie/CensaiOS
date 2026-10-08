import React from 'react';

export function AgentTypeBadge({ type }) {
  const colors = { nano: 'var(--status-purple)', sub: 'var(--accent)', main: 'var(--warning)', utility: 'var(--ink-faint)' };
  const color = colors[type] || 'var(--ink-faint)';
  return (
    <span style={{
      fontSize: 'var(--text-xs)', fontWeight: 700, letterSpacing: '0.06em',
      textTransform: 'uppercase', padding: '2px 7px',
      borderRadius: 'var(--radius-full)', background: `color-mix(in oklab, ${color} 13%, transparent)`,
      color, border: `1px solid color-mix(in oklab, ${color} 27%, transparent)`,
      flexShrink: 0,
    }}>{type}</span>
  );
}

export function StatusDot({ active, size = 8 }) {
  return (
    <span style={{
      display: 'inline-block', width: size, height: size, borderRadius: '50%',
      background: active ? 'var(--success)' : 'var(--ink-faint)',
      boxShadow: active ? '0 0 6px color-mix(in oklab, var(--success) 67%, transparent)' : 'none',
      flexShrink: 0,
      animation: active ? 'vex-pulse 1.4s ease-in-out infinite' : 'none',
    }} />
  );
}

export function AgentRow({ agent }) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '9px 12px', borderRadius: 'var(--radius-lg)',
        background: hovered ? 'var(--accent-soft)' : 'transparent',
        transition: 'background 0.18s', cursor: 'default',
      }}
    >
      <StatusDot active={!agent.degraded} size={7} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontWeight: 600, fontSize: 'var(--text-md)', color: 'var(--ink)', letterSpacing: '-0.01em' }}>
            {agent.name}
          </span>
          <AgentTypeBadge type={agent.type} />
          {agent.degraded && (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--warning)', fontWeight: 600 }}>⚠ degraded</span>
          )}
        </div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-soft)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {agent.description || 'No description.'}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
          {(agent.capabilities || []).map(cap => (
            <span key={cap} style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', background: 'var(--hairline-bg)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-sm)', padding: '1px 5px' }}>
              {cap}
            </span>
          ))}
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-faint)' }}>v{agent.version}</div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', marginTop: 1 }}>{agent.timeout_ms}ms</div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', marginTop: 1 }}>@{agent.owner || '—'}</div>
      </div>
    </div>
  );
}

export function RunLogItem({ event }) {
  const color = event.level === 'error' ? 'var(--danger)' : event.level === 'warn' ? 'var(--warning)' : 'var(--ink-soft)';
  const prefix = event.level === 'error' ? '✗' : event.level === 'warn' ? '⚠' : '→';
  const ts = new Date(event.ts).toLocaleTimeString();
  return (
    <div style={{ display: 'flex', gap: 8, padding: '3px 0', fontSize: 'var(--text-xs)', lineHeight: 1.5 }}>
      <span style={{ color: 'var(--ink-faint)', flexShrink: 0, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>{ts}</span>
      <span style={{ color, flexShrink: 0, fontSize: 'var(--text-sm)' }}>{prefix}</span>
      <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', flexShrink: 0 }}>[{event.agent}]</span>
      <span style={{ color: 'var(--ink-soft)', flex: 1 }}>{event.msg}</span>
    </div>
  );
}

export function RunCard({ run, isActive, onClick }) {
  const ok = run.agents_succeeded === run.agents_dispatched && run.agents_dispatched > 0;
  const statusColor = run.status === 'complete' ? (ok ? 'var(--success)' : 'var(--warning)') : 'var(--status-purple)';
  return (
    <div onClick={onClick} style={{
      padding: '8px 12px', borderRadius: 'var(--radius-lg)', cursor: 'pointer',
      background: isActive ? 'var(--accent-soft)' : 'transparent',
      border: isActive ? '1px solid color-mix(in oklab, var(--accent) 27%, transparent)' : '1px solid transparent',
      transition: 'all 0.15s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <StatusDot active={run.status !== 'complete'} size={6} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', flex: 1 }}>
          {run.run_id?.replace('run_', '')}
        </span>
        <span style={{ fontSize: 'var(--text-xs)', color: statusColor, fontWeight: 600 }}>
          {run.status === 'complete' ? `${run.agents_succeeded}/${run.agents_dispatched}` : '…'}
        </span>
      </div>
      {run.task && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-soft)', marginTop: 2 }}>{run.task}</div>
      )}
    </div>
  );
}
