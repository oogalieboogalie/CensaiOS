import React from 'react';

const fieldStyle = {
  width: '100%', minWidth: 0, boxSizing: 'border-box', padding: '7px 9px', borderRadius: 'var(--radius-md)',
  border: '1px solid var(--hairline)', background: 'var(--surface)',
  color: 'var(--ink)', fontSize: 'var(--text-xs)',
};

/**
 * Add an agent someone shared from their own censaiOS: paste the address
 * and key from their Share panel. People here can ask it right away; agents
 * here can ask it on their own once it is pinned (it is pinned on add).
 */
export function ImportCensaiAgent({ client, onImported, canImport }) {
  const [address, setAddress] = React.useState('');
  const [key, setKey] = React.useState('');
  const [name, setName] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const complete = address.trim() && key.trim();

  const submit = async (event) => {
    event?.preventDefault?.();
    if (!complete || !canImport) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await client.importCensaiAgent({ address: address.trim(), key: key.trim(), name: name.trim() });
      setNotice(result.reachable
        ? `Added ${result.card.name}. Your agents can ask it now.`
        : `Added ${result.card.name}. Its computer is off; questions wait in line until it is back.`);
      setAddress(''); setKey(''); setName('');
      await onImported?.(result.card);
    } catch (err) {
      setError(err.message || 'Adding that agent failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="registry-censai-import" style={{ display: 'grid', gap: 7, padding: 12, border: '1px solid var(--accent-line)', borderRadius: 'var(--radius-lg)', background: 'var(--surface-raised)' }}>
      <div>
        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 750, color: 'var(--ink)' }}>Add an agent from another censaiOS</div>
        <div style={{ marginTop: 2, fontSize: 'var(--text-xs)', lineHeight: 1.4, color: 'var(--ink-soft)' }}>
          Paste the address and key from the Share panel on their computer. It runs on their computer with their model, and every question leaves a signed receipt on both sides.
        </div>
      </div>
      <input aria-label="Agent address" data-testid="registry-censai-address" value={address}
        onChange={(event) => setAddress(event.target.value)} placeholder="https://…/api/mcp/agents/…" style={fieldStyle} />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1.4fr) minmax(110px, 0.6fr) auto', gap: 7 }}>
        <input aria-label="Agent key" data-testid="registry-censai-key" value={key} type="password" autoComplete="off"
          onChange={(event) => setKey(event.target.value)} placeholder="cak_…" style={fieldStyle} />
        <input aria-label="Agent name (optional)" data-testid="registry-censai-name" value={name}
          onChange={(event) => setName(event.target.value)} placeholder="Name (optional)" style={fieldStyle} />
        <button type="button" onClick={submit} data-testid="registry-censai-submit" disabled={busy || !canImport || !complete}
          title={!canImport ? 'Workspace owners and admins can add agents.' : undefined}
          style={{ border: 0, borderRadius: 'var(--radius-md)', padding: '7px 11px', background: 'var(--accent-soft)', color: 'var(--accent-ink)', fontSize: 'var(--text-xs)', fontWeight: 750, cursor: canImport ? 'pointer' : 'default', opacity: busy || !canImport ? 0.55 : 1 }}>
          {busy ? 'Checking…' : 'Add agent'}
        </button>
      </div>
      {error && <div role="alert" style={{ color: 'var(--ps-red)', fontSize: 'var(--text-xs)' }}>{error}</div>}
      {notice && <div role="status" data-testid="registry-censai-notice" style={{ color: 'var(--ps-green)', fontSize: 'var(--text-xs)' }}>{notice}</div>}
    </div>
  );
}
