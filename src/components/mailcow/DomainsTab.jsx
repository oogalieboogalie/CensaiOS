import React from 'react';

const formatMB = (mb) => {
  const val = Number(mb);
  if (!val || val === 0) return 'unlimited';
  if (val >= 1024) return `${(val / 1024).toFixed(1)} GB`;
  return `${val} MB`;
};

export function DomainsTab({ mailcow }) {
  const { domains, searchQuery, mutating, handleDeleteDomain, domainForm, setDomainForm, handleAddDomain, showAddForm } = mailcow;

  return (
    <>
      {showAddForm && (
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 12, padding: 14, marginBottom: 14 }}>
          <form onSubmit={handleAddDomain} style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-soft)' }}>DOMAIN NAME</span>
              <input
                type="text"
                placeholder="censai.app"
                value={domainForm.domain}
                onChange={(e) => setDomainForm({ ...domainForm, domain: e.target.value })}
                style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--hairline)', fontSize: 13, background: 'var(--surface)', color: 'var(--ink)', outline: 'none' }}
                required
              />
            </div>
            <div style={{ flex: '1 1 120px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-soft)' }}>MAX MAILBOXES</span>
              <input
                type="number"
                value={domainForm.maxMailboxes}
                onChange={(e) => setDomainForm({ ...domainForm, maxMailboxes: parseInt(e.target.value) || 10 })}
                style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--hairline)', fontSize: 13, background: 'var(--surface)', color: 'var(--ink)', outline: 'none' }}
                required
              />
            </div>
            <div style={{ flex: '1 1 120px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-soft)' }}>MAX QUOTA (MB)</span>
              <input
                type="number"
                value={domainForm.maxQuota}
                onChange={(e) => setDomainForm({ ...domainForm, maxQuota: parseInt(e.target.value) || 10240 })}
                style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--hairline)', fontSize: 13, background: 'var(--surface)', color: 'var(--ink)', outline: 'none' }}
                required
              />
            </div>
            <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
              <button type="submit" disabled={mutating} style={{ all: 'unset', cursor: 'pointer', background: 'var(--accent)', color: 'white', padding: '6px 16px', borderRadius: 6, fontSize: 12.5, fontWeight: 600 }}>
                {mutating ? 'Creating...' : 'Create Domain'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {domains
          .filter(d => d.domain.toLowerCase().includes(searchQuery.toLowerCase()))
          .map(d => {
            const active = d.active === '1' || d.active === 1;
            return (
              <div key={d.domain} style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 8, boxShadow: 'var(--shadow-card)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{d.domain}</span>
                  <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', padding: '2px 6px', borderRadius: 4, background: active ? 'var(--accent-soft)' : 'var(--surface-2)', color: active ? 'var(--accent-ink)' : 'var(--ink-soft)' }}>
                    {active ? 'active' : 'inactive'}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--ink-soft)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Mailboxes:</span>
                    <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{d.mboxes_in_domain ?? d.mbox_count ?? '?'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Max Quota:</span>
                    <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{formatMB(d.max_quota_for_domain)}</span>
                  </div>
                  {d.relayhost && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Relay host:</span>
                      <span style={{ fontWeight: 500, color: 'var(--ink)', fontSize: 11 }}>{d.relayhost}</span>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--hairline)', paddingTop: 8, marginTop: 4 }}>
                  <button
                    onClick={() => handleDeleteDomain(d.domain)}
                    disabled={mutating}
                    style={{ all: 'unset', cursor: 'pointer', color: 'var(--ps-red)', fontSize: 11, fontWeight: 500 }}
                  >
                    Delete Domain
                  </button>
                </div>
              </div>
            );
          })}
        {domains.length === 0 && (
          <div style={{ gridColumn: '1 / -1', padding: 24, textAlign: 'center', border: '1px dashed var(--hairline)', borderRadius: 12, color: 'var(--ink-faint)', fontSize: 13 }}>
            No domains configured yet. Use "+ Add Domain" to register one.
          </div>
        )}
      </div>
    </>
  );
}
