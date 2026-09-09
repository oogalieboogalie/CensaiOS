import React from 'react';
import { Icon } from '../Icons.jsx';

const TERMINAL = new Set(['succeeded', 'failed', 'denied', 'cancelled']);
const buttonStyle = (kind, disabled) => ({
  border: `1px solid ${kind === 'approve' ? 'var(--accent)' : 'var(--hairline)'}`,
  background: kind === 'approve' ? 'var(--accent-soft)' : 'var(--surface)',
  color: kind === 'approve' ? 'var(--accent)' : 'var(--ink-soft)',
  borderRadius: 7, padding: '6px 10px', display: 'inline-flex', alignItems: 'center', gap: 5,
  fontSize: 11, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1,
});

export function ApprovalCard({ approval, canDecide, deciding, onDecision }) {
  const pending = approval.status === 'pending';
  const uncertain = approval.status === 'executing';
  return (
    <article style={{ border: '1px solid var(--hairline)', borderRadius: 10,
      background: 'var(--surface-raised)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 12px',
        borderBottom: '1px solid var(--hairline)', alignItems: 'center' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 750, color: 'var(--ink)' }}>{approval.tool_name}</div>
          <div style={{ fontSize: 10, color: 'var(--ink-faint)', marginTop: 2 }}>
            {approval.agent_id} · {approval.module_id} · rev {approval.revision}
          </div>
        </div>
        <span style={{ borderRadius: 999, padding: '3px 8px', fontSize: 10, fontWeight: 800,
          color: uncertain ? 'var(--orange)' : TERMINAL.has(approval.status) ? 'var(--ink-soft)' : 'var(--accent)',
          background: 'var(--surface-2)', border: '1px solid var(--hairline)' }}>{approval.status}</span>
      </div>
      <pre style={{ margin: 0, padding: 12, maxHeight: 180, overflow: 'auto', whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere', color: 'var(--ink-soft)', fontSize: 10, lineHeight: 1.5,
        background: 'var(--surface-2)', fontFamily: 'var(--font-mono)' }}>
        {JSON.stringify(approval.arguments || {}, null, 2)}
      </pre>
      {(approval.result_preview || approval.cancellation_reason) && (
        <div style={{ padding: '8px 12px', color: 'var(--ink-soft)', fontSize: 11,
          borderTop: '1px solid var(--hairline)' }}>
          {approval.result_preview || `Cancelled: ${approval.cancellation_reason}`}
        </div>
      )}
      {pending && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 7, padding: 10,
          borderTop: '1px solid var(--hairline)' }}>
          {!canDecide && <span style={{ marginRight: 'auto', color: 'var(--ink-faint)', fontSize: 10 }}>
            Owner/admin decision required
          </span>}
          <button type="button" disabled={!canDecide || deciding}
            onClick={() => onDecision(approval, 'deny')} style={buttonStyle('deny', !canDecide || deciding)}>
            <Icon.Close size={12} /> Deny
          </button>
          <button type="button" disabled={!canDecide || deciding}
            onClick={() => onDecision(approval, 'approve')} style={buttonStyle('approve', !canDecide || deciding)}>
            <Icon.Check size={12} /> Approve once
          </button>
        </div>
      )}
      {uncertain && <div role="status" style={{ padding: '8px 12px', color: 'var(--orange)', fontSize: 10,
        borderTop: '1px solid var(--hairline)' }}>Execution is in progress or uncertain. It will not auto-retry.</div>}
    </article>
  );
}
