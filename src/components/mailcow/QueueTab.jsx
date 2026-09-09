import React from 'react';

export function QueueTab({ mailcow }) {
  const { queue, mutating, handleFlushQueue } = mailcow;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-2)', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--hairline)' }}>
        <div style={{ fontSize: 12.5 }}>
          Queue Size: <span style={{ fontWeight: 600, color: queue.length > 0 ? 'var(--ps-red)' : 'var(--ps-green)' }}>{queue.length} item(s)</span>
        </div>
        {queue.length > 0 && (
          <button
            onClick={handleFlushQueue}
            disabled={mutating}
            style={{ all: 'unset', cursor: 'pointer', background: 'var(--ps-red)', color: 'white', padding: '6px 12px', borderRadius: 6, fontSize: 11.5, fontWeight: 600 }}
          >
            {mutating ? 'Flushing...' : 'Flush Queue'}
          </button>
        )}
      </div>
      
      <div style={{ border: '1px solid var(--hairline)', borderRadius: 10, overflow: 'hidden', background: 'var(--surface)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--hairline)', textAlign: 'left', fontSize: 11, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>
              <th style={{ padding: '8px 12px', fontWeight: 600 }}>Queue ID</th>
              <th style={{ padding: '8px 12px', fontWeight: 600 }}>Sender</th>
              <th style={{ padding: '8px 12px', fontWeight: 600 }}>Recipient</th>
              <th style={{ padding: '8px 12px', fontWeight: 600 }}>Reason / Error</th>
            </tr>
          </thead>
          <tbody>
            {queue.map((q, idx) => (
              <tr key={q.queue_id || q.id || idx} style={{ borderBottom: '1px solid var(--hairline)' }}>
                <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-soft)' }}>{q.queue_id || q.id}</td>
                <td style={{ padding: '8px 12px' }}>{q.sender}</td>
                <td style={{ padding: '8px 12px' }}>{Array.isArray(q.recipients) ? q.recipients.join(', ') : q.recipients}</td>
                <td style={{ padding: '8px 12px', color: 'var(--ps-red)', fontSize: 11.5 }}>{q.reason}</td>
              </tr>
            ))}
            {queue.length === 0 && (
              <tr>
                <td colSpan="4" style={{ padding: 24, textAlign: 'center', color: 'var(--ps-green)', fontSize: 13, fontWeight: 500 }}>
                  ✓ Mail queue is empty. Outbound SMTP relay via Brevo is working healthy!
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
