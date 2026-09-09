import React from 'react';

export function ImportA2ACard({ client, onImported, canImport }) {
  const [cardUrl, setCardUrl] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');

  const submit = async (event) => {
    event.preventDefault();
    if (!cardUrl.trim() || !canImport) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await client.importA2A(cardUrl.trim());
      setNotice(result.executable
        ? `Imported ${result.card.name} — ready to call through A2A ${result.protocolVersion}.`
        : `Imported ${result.card.name} for discovery. ${result.reason || 'Its protocol is not executable yet.'}`);
      setCardUrl('');
      await onImported?.(result.card);
    } catch (err) {
      setError(err.message || 'A2A import failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="registry-a2a-import" style={{ display: 'grid', gap: 7, padding: 12, border: '1px solid var(--hairline)', borderRadius: 9, background: 'var(--surface-raised)' }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 750, color: 'var(--ink)' }}>Import an A2A agent</div>
        <div style={{ marginTop: 2, fontSize: 11, lineHeight: 1.4, color: 'var(--ink-soft)' }}>
          Google ADK, LangGraph, or any public A2A v0.3 Agent Card. This imports identity and an endpoint—not remote memory or secrets.
        </div>
      </div>
      <div style={{ display: 'flex', gap: 7 }}>
        <input
          aria-label="A2A Agent Card URL"
          data-testid="registry-a2a-url"
          type="url"
          value={cardUrl}
          onChange={(event) => setCardUrl(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') submit(event); }}
          placeholder="https://agent.example/.well-known/agent-card.json"
          style={{ flex: 1, minWidth: 0, padding: '7px 9px', borderRadius: 7, border: '1px solid var(--hairline)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 11 }}
        />
        <button
          type="button"
          onClick={submit}
          data-testid="registry-a2a-submit"
          disabled={busy || !canImport || !cardUrl.trim()}
          title={!canImport ? 'Workspace owners and admins can import agents.' : undefined}
          style={{ border: 0, borderRadius: 7, padding: '7px 11px', background: 'var(--accent-soft)', color: 'var(--accent-ink)', fontSize: 11, fontWeight: 750, cursor: canImport ? 'pointer' : 'default', opacity: busy || !canImport ? 0.55 : 1 }}
        >
          {busy ? 'Checking…' : 'Import'}
        </button>
      </div>
      {error && <div role="alert" style={{ color: 'var(--ps-red)', fontSize: 11 }}>{error}</div>}
      {notice && <div role="status" style={{ color: 'var(--ps-green)', fontSize: 11 }}>{notice}</div>}
    </div>
  );
}
