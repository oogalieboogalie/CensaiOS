import React from 'react';

export function AgentTypeBadge({ type }) {
  const colors = { nano: '#a855f7', sub: '#3b82f6', main: '#f59e0b', utility: '#6b7280' };
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
      textTransform: 'uppercase', padding: '2px 7px',
      borderRadius: 99, background: colors[type] + '22',
      color: colors[type] || '#6b7280', border: `1px solid ${colors[type] || '#6b7280'}44`,
      flexShrink: 0,
    }}>{type}</span>
  );
}

export function StatusDot({ active, size = 8 }) {
  return (
    <span style={{
      display: 'inline-block', width: size, height: size, borderRadius: '50%',
      background: active ? '#2ed573' : '#6b7280',
      boxShadow: active ? '0 0 6px #2ed573aa' : 'none',
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
        padding: '9px 12px', borderRadius: 10,
        background: hovered ? 'var(--accent-soft, rgba(99,102,241,0.1))' : 'transparent',
        transition: 'background 0.18s', cursor: 'default',
      }}
    >
      <StatusDot active={!agent.degraded} size={7} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink)', letterSpacing: '-0.01em' }}>
            {agent.name}
          </span>
          <AgentTypeBadge type={agent.type} />
          {agent.degraded && (
            <span style={{ fontSize: 10, color: '#ffa502', fontWeight: 600 }}>⚠ degraded</span>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {agent.description || 'No description.'}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
          {(agent.capabilities || []).map(cap => (
            <span key={cap} style={{ fontSize: 10, color: 'var(--ink-faint)', background: 'var(--hairline-bg, rgba(255,255,255,0.05))', border: '1px solid var(--hairline)', borderRadius: 4, padding: '1px 5px' }}>
              {cap}
            </span>
          ))}
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 10, color: 'var(--ink-faint)' }}>v{agent.version}</div>
        <div style={{ fontSize: 10, color: 'var(--ink-faint)', marginTop: 1 }}>{agent.timeout_ms}ms</div>
        <div style={{ fontSize: 10, color: 'var(--ink-faint)', marginTop: 1 }}>@{agent.owner || '—'}</div>
      </div>
    </div>
  );
}

export function RunLogItem({ event }) {
  const color = event.level === 'error' ? '#ff4757' : event.level === 'warn' ? '#ffa502' : 'var(--ink-soft)';
  const prefix = event.level === 'error' ? '✗' : event.level === 'warn' ? '⚠' : '→';
  const ts = new Date(event.ts).toLocaleTimeString();
  return (
    <div style={{ display: 'flex', gap: 8, padding: '3px 0', fontSize: 11, lineHeight: 1.5 }}>
      <span style={{ color: 'var(--ink-faint)', flexShrink: 0, fontFamily: 'var(--font-mono)', fontSize: 10 }}>{ts}</span>
      <span style={{ color, flexShrink: 0, fontSize: 12 }}>{prefix}</span>
      <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: 10, flexShrink: 0 }}>[{event.agent}]</span>
      <span style={{ color: 'var(--ink-soft)', flex: 1 }}>{event.msg}</span>
    </div>
  );
}

export function RunCard({ run, isActive, onClick }) {
  const ok = run.agents_succeeded === run.agents_dispatched && run.agents_dispatched > 0;
  const statusColor = run.status === 'complete' ? (ok ? '#2ed573' : '#ffa502') : '#a855f7';
  return (
    <div onClick={onClick} style={{
      padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
      background: isActive ? 'var(--accent-soft, rgba(99,102,241,0.1))' : 'transparent',
      border: isActive ? '1px solid var(--accent, #6366f1)44' : '1px solid transparent',
      transition: 'all 0.15s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <StatusDot active={run.status !== 'complete'} size={6} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-faint)', flex: 1 }}>
          {run.run_id?.replace('run_', '')}
        </span>
        <span style={{ fontSize: 10, color: statusColor, fontWeight: 600 }}>
          {run.status === 'complete' ? `${run.agents_succeeded}/${run.agents_dispatched}` : '…'}
        </span>
      </div>
      {run.task && (
        <div style={{ fontSize: 10, color: 'var(--ink-soft)', marginTop: 2 }}>{run.task}</div>
      )}
    </div>
  );
}
