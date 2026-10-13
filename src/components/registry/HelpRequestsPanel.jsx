// Agent network — requests this workspace sent (with results) and requests
// other workspaces sent to cards I own (accept / decline).

import React from 'react';
import { STATUS_TONE, buttonStyle, pillStyle, rowStyle, sectionLabel } from './networkStyles.js';

function fmtTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function who(requester) {
  return requester?.kind === 'agent' ? `${requester.id} (agent)` : 'a person';
}

function Result({ value }) {
  const [open, setOpen] = React.useState(false);
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  const long = text.length > 280;
  return (
    <div data-testid="network-result" style={{ fontSize: 'var(--text-sm)', color: 'var(--ink)', background: 'var(--surface)', borderRadius: 'var(--radius-md)', padding: 8, whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>
      {long && !open ? `${text.slice(0, 280)}…` : text}
      {long && (
        <button type="button" onClick={() => setOpen(!open)} style={{ ...buttonStyle(), marginLeft: 6, padding: '1px 6px' }}>
          {open ? 'Less' : 'More'}
        </button>
      )}
    </div>
  );
}

function RequestRow({ item, busy, actions }) {
  return (
    <div data-testid={`network-${item.side}-row`} data-request-id={item.id} style={rowStyle}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <strong style={{ fontSize: 'var(--text-sm)', color: 'var(--ink)' }}>{item.cardName}</strong>
        {item.skillId && <span style={pillStyle('quiet')}>{item.skillId}</span>}
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-faint)' }}>
          {item.side === 'incoming' ? `from ${who(item.requester)}` : `asked by ${who(item.requester)}`} · {fmtTime(item.createdAt)}
        </span>
        <span data-testid="network-status" style={{ ...pillStyle(STATUS_TONE[item.status]), marginLeft: 'auto' }}>{item.status}</span>
      </div>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-soft)', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>
        {item.task.length > 400 ? `${item.task.slice(0, 400)}…` : item.task}
      </div>
      {item.result != null && <Result value={item.result} />}
      {item.error && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ps-red)' }}>{item.error}</div>}
      {item.status === 'pending' && actions.length > 0 && (
        <div style={{ display: 'flex', gap: 6 }}>
          {actions.map(({ label, onClick, primary, testId }) => (
            <button key={label} type="button" data-testid={testId} disabled={busy} onClick={() => onClick(item.id)}
              style={buttonStyle({ primary, disabled: busy })}>{label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export function HelpRequestsPanel({ requests }) {
  const { outgoing, incoming, busyIds, accept, decline, cancel } = requests;
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {incoming.length > 0 && (
        <>
          <div style={sectionLabel}>Asked of your agents</div>
          {incoming.map((item) => (
            <RequestRow key={item.id} item={item} busy={busyIds.has(item.id)} actions={[
              { label: 'Accept', onClick: accept, primary: true, testId: 'network-accept' },
              { label: 'Decline', onClick: decline, testId: 'network-decline' },
            ]} />
          ))}
        </>
      )}
      <div style={sectionLabel}>Sent from this workspace</div>
      {outgoing.length === 0 && (
        <div data-testid="network-outgoing-empty" style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-faint)' }}>
          No help requests yet. Find an agent above and ask it for help.
        </div>
      )}
      {outgoing.map((item) => (
        <RequestRow key={item.id} item={item} busy={busyIds.has(item.id)} actions={[
          { label: 'Withdraw', onClick: cancel, testId: 'network-cancel' },
        ]} />
      ))}
    </div>
  );
}
