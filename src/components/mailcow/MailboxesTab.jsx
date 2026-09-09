import React from 'react';

const formatMB = (mb) => {
  const val = Number(mb);
  if (!val || val === 0) return 'unlimited';
  if (val >= 1024) return `${(val / 1024).toFixed(1)} GB`;
  return `${val} MB`;
};

export function MailboxesTab({ mailcow }) {
  const { mailboxes, domains, searchQuery, mutating, handleDeleteMailbox, mailboxForm, setMailboxForm, handleAddMailbox, showAddForm } = mailcow;

  return (
    <>
      {showAddForm && (
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 12, padding: 14, marginBottom: 14 }}>
          <form onSubmit={handleAddMailbox} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-soft)' }}>EMAIL ADDRESS</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="text"
                    placeholder="alex"
                    value={mailboxForm.local_part}
                    onChange={(e) => setMailboxForm({ ...mailboxForm, local_part: e.target.value })}
                    style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--hairline)', fontSize: 13, background: 'var(--surface)', color: 'var(--ink)', outline: 'none' }}
                    required
                  />
                  <span style={{ fontSize: 14 }}>@</span>
                  <select
                    value={mailboxForm.domain}
                    onChange={(e) => setMailboxForm({ ...mailboxForm, domain: e.target.value })}
                    style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--hairline)', fontSize: 13, background: 'var(--surface)', color: 'var(--ink)', outline: 'none', minWidth: 130 }}
                    required
                  >
                    {domains.map(d => (
                      <option key={d.domain} value={d.domain}>{d.domain}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{ flex: '1 1 180px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-soft)' }}>DISPLAY NAME</span>
                <input
                  type="text"
                  placeholder="Alex Johnson"
                  value={mailboxForm.name}
                  onChange={(e) => setMailboxForm({ ...mailboxForm, name: e.target.value })}
                  style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--hairline)', fontSize: 13, background: 'var(--surface)', color: 'var(--ink)', outline: 'none' }}
                  required
                />
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <div style={{ flex: '1 1 180px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-soft)' }}>PASSWORD</span>
                <input
                  type="password"
                  placeholder="Strong password"
                  value={mailboxForm.password}
                  onChange={(e) => setMailboxForm({ ...mailboxForm, password: e.target.value })}
                  style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--hairline)', fontSize: 13, background: 'var(--surface)', color: 'var(--ink)', outline: 'none' }}
                  required
                />
              </div>
              <div style={{ flex: '1 1 100px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-soft)' }}>QUOTA (MB)</span>
                <input
                  type="number"
                  value={mailboxForm.quota}
                  onChange={(e) => setMailboxForm({ ...mailboxForm, quota: parseInt(e.target.value) || 2048 })}
                  style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--hairline)', fontSize: 13, background: 'var(--surface)', color: 'var(--ink)', outline: 'none' }}
                  required
                />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
              <button type="submit" disabled={mutating} style={{ all: 'unset', cursor: 'pointer', background: 'var(--accent)', color: 'white', padding: '6px 16px', borderRadius: 6, fontSize: 12.5, fontWeight: 600 }}>
                {mutating ? 'Creating...' : 'Create Mailbox'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div style={{ border: '1px solid var(--hairline)', borderRadius: 10, overflow: 'hidden', background: 'var(--surface)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--hairline)', textAlign: 'left', fontSize: 11, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>
              <th style={{ padding: '8px 12px', fontWeight: 600 }}>Active</th>
              <th style={{ padding: '8px 12px', fontWeight: 600 }}>Address</th>
              <th style={{ padding: '8px 12px', fontWeight: 600 }}>Name</th>
              <th style={{ padding: '8px 12px', fontWeight: 600 }}>Quota Usage</th>
              <th style={{ padding: '8px 12px', fontWeight: 600, width: 80 }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {mailboxes
              .filter(m => m.username.toLowerCase().includes(searchQuery.toLowerCase()) || (m.name || '').toLowerCase().includes(searchQuery.toLowerCase()))
              .map(m => {
                const active = m.active === '1' || m.active === 1;
                const used = parseInt(m.used_quota) || 0;
                const total = parseInt(m.quota) || 2048;
                const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
                return (
                  <tr key={m.username} style={{ borderBottom: '1px solid var(--hairline)' }}>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: active ? 'var(--ps-green)' : 'var(--ink-faint)', display: 'inline-block' }} />
                    </td>
                    <td style={{ padding: '10px 12px', fontWeight: 500 }}>{m.username}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--ink-soft)' }}>{m.name || '—'}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: 140 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--ink-soft)' }}>
                          <span>{formatMB(m.used_quota)}</span>
                          <span>/</span>
                          <span>{formatMB(m.quota)}</span>
                        </div>
                        <div style={{ width: '100%', height: 4, background: 'var(--surface-2)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: pct > 85 ? 'var(--ps-red)' : pct > 60 ? 'var(--ps-yellow)' : 'var(--accent)' }} />
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <button
                        onClick={() => handleDeleteMailbox(m.username)}
                        disabled={mutating}
                        style={{ all: 'unset', cursor: 'pointer', color: 'var(--ps-red)', fontSize: 11, fontWeight: 500 }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            {mailboxes.length === 0 && (
              <tr>
                <td colSpan="5" style={{ padding: 24, textAlign: 'center', color: 'var(--ink-faint)', fontSize: 13 }}>
                  No mailboxes found. Create one with "+ New Mailbox".
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
