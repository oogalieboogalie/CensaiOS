import React from 'react';

export function AliasesTab({ mailcow }) {
  const { aliases, searchQuery, mutating, handleDeleteAlias, aliasForm, setAliasForm, handleAddAlias, showAddForm } = mailcow;

  return (
    <>
      {showAddForm && (
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-xl)', padding: 14, marginBottom: 14 }}>
          <form onSubmit={handleAddAlias} style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--ink-soft)' }}>ALIAS ADDRESS</span>
              <input
                type="email"
                placeholder="info@censai.app"
                value={aliasForm.address}
                onChange={(e) => setAliasForm({ ...aliasForm, address: e.target.value })}
                style={{ padding: '6px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--hairline)', fontSize: 'var(--text-md)', background: 'var(--surface)', color: 'var(--ink)', outline: 'none' }}
                required
              />
            </div>
            <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--ink-soft)' }}>FORWARD TO (GOTO)</span>
              <input
                type="text"
                placeholder="alex@censai.app (comma separated for multiple)"
                value={aliasForm.goto}
                onChange={(e) => setAliasForm({ ...aliasForm, goto: e.target.value })}
                style={{ padding: '6px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--hairline)', fontSize: 'var(--text-md)', background: 'var(--surface)', color: 'var(--ink)', outline: 'none' }}
                required
              />
            </div>
            <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
              <button type="submit" disabled={mutating} style={{ all: 'unset', cursor: 'pointer', background: 'var(--accent)', color: 'white', padding: '6px 16px', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                {mutating ? 'Creating...' : 'Create Alias'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div style={{ border: '1px solid var(--hairline)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', background: 'var(--surface)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-md)' }}>
          <thead>
            <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--hairline)', textAlign: 'left', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-label)', textTransform: 'var(--label-case)', color: 'var(--ink-soft)' }}>
              <th style={{ padding: '8px 12px', fontWeight: 600, width: 60 }}>Status</th>
              <th style={{ padding: '8px 12px', fontWeight: 600 }}>Alias Address</th>
              <th style={{ padding: '8px 12px', fontWeight: 600 }}>Goto (Forward Destination)</th>
              <th style={{ padding: '8px 12px', fontWeight: 600, width: 80 }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {aliases
              .filter(a => a.address.toLowerCase().includes(searchQuery.toLowerCase()) || a.goto.toLowerCase().includes(searchQuery.toLowerCase()))
              .map(a => {
                const active = a.active === '1' || a.active === 1;
                return (
                  <tr key={a.id} style={{ borderBottom: '1px solid var(--hairline)' }}>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: active ? 'var(--ps-green)' : 'var(--ink-faint)', display: 'inline-block' }} />
                    </td>
                    <td style={{ padding: '10px 12px', fontWeight: 500 }}>{a.address}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--ink-soft)', wordBreak: 'break-all' }}>{a.goto}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <button
                        onClick={() => handleDeleteAlias(a.id)}
                        disabled={mutating}
                        style={{ all: 'unset', cursor: 'pointer', color: 'var(--ps-red)', fontSize: 'var(--text-xs)', fontWeight: 500 }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            {aliases.length === 0 && (
              <tr>
                <td colSpan="4" style={{ padding: 24, textAlign: 'center', color: 'var(--ink-faint)', fontSize: 'var(--text-md)' }}>
                  No aliases found. Create one with "+ New Alias".
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
