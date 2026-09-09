/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { WindowTitle } from './Windows.jsx';
import { Icon } from './Icons.jsx';
import { ApprovalCard } from './approvals/ApprovalCard.jsx';
import { useApprovalInbox } from './approvals/useApprovalInbox.js';
import { useVisibilityAwareInterval } from '../lib/usePolling.js';

export function PolicyDashboardWindow({ win, isActive }) {
  const inbox = useApprovalInbox();
  const [pendingOnly, setPendingOnly] = React.useState(true);
  useVisibilityAwareInterval(() => inbox.load({ quiet: true }), 5000, { inactive: !isActive || !inbox.workspaceId });
  const approvals = pendingOnly
    ? inbox.approvals.filter(item => ['pending', 'executing'].includes(item.status))
    : inbox.approvals;
  const pending = inbox.approvals.filter(item => item.status === 'pending').length;
  const uncertain = inbox.approvals.filter(item => item.status === 'executing').length;

  return <>
    <WindowTitle icon={<Icon.Alert size={14} />} label={win.title || 'Action Approvals'}
      subtitle={inbox.ready ? `${pending} pending · ${uncertain} executing` : 'workspace-scoped'}>
      <button type="button" onClick={() => inbox.load()} disabled={inbox.loading}
        title="Refresh approval inbox" style={{ all: 'unset', cursor: inbox.loading ? 'wait' : 'pointer',
          color: 'var(--ink-soft)', padding: 4 }}><Icon.Refresh size={13} /></button>
    </WindowTitle>
    <section style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'grid', gridTemplateRows: 'auto 1fr',
      background: 'var(--surface)', color: 'var(--ink)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
        padding: '9px 12px', borderBottom: '1px solid var(--hairline)' }}>
        <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>
          Exact captured arguments · one signed decision · no automatic retry
        </div>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', color: 'var(--ink-faint)', fontSize: 10 }}>
          <input type="checkbox" checked={pendingOnly} onChange={event => setPendingOnly(event.target.checked)} />
          Pending only
        </label>
      </div>
      <div style={{ minHeight: 0, overflow: 'auto', padding: 12, display: 'grid', gap: 10, alignContent: 'start' }}>
        {inbox.error && <div role="alert" style={{ border: '1px solid var(--hairline)', borderRadius: 8,
          padding: 10, color: 'var(--red)', background: 'var(--surface-raised)', fontSize: 11 }}>{inbox.error}</div>}
        {inbox.loading && <div role="status" style={{ color: 'var(--ink-faint)', fontSize: 11 }}>Loading approvals…</div>}
        {inbox.ready && approvals.length === 0 && <div style={{ border: '1px dashed var(--hairline)',
          borderRadius: 10, padding: 24, textAlign: 'center', color: 'var(--ink-faint)', fontSize: 11 }}>
          {pendingOnly ? 'No agent actions are waiting for approval.' : 'No approval history in this workspace.'}
        </div>}
        {approvals.map(approval => <ApprovalCard key={approval.id} approval={approval}
          canDecide={inbox.canDecide} deciding={inbox.decidingId === approval.id} onDecision={inbox.decide} />)}
      </div>
    </section>
  </>;
}
