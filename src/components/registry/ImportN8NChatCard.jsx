import React from 'react';

const fieldStyle = {
  width: '100%', minWidth: 0, padding: '7px 9px', borderRadius: 7,
  border: '1px solid var(--hairline)', background: 'var(--surface)',
  color: 'var(--ink)', fontSize: 11,
};

export function ImportN8NChatCard({ client, onImported, canImport }) {
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [webhookUrl, setWebhookUrl] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const complete = name.trim() && description.trim() && webhookUrl.trim();

  const submit = async (event) => {
    event?.preventDefault?.();
    if (!complete || !canImport) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await client.importN8NChat({
        name: name.trim(), description: description.trim(), webhookUrl: webhookUrl.trim(),
      });
      setNotice(`Imported ${result.card.name}. The endpoint is verified on its first call.`);
      setName(''); setDescription(''); setWebhookUrl('');
      await onImported?.(result.card);
    } catch (err) {
      setError(err.message || 'n8n import failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="registry-n8n-import" style={{ display: 'grid', gap: 7, padding: 12, border: '1px solid var(--hairline)', borderRadius: 9, background: 'var(--surface-raised)' }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 750, color: 'var(--ink)' }}>Import an n8n chat workflow</div>
        <div style={{ marginTop: 2, fontSize: 11, lineHeight: 1.4, color: 'var(--ink-soft)' }}>
          Use an active Chat Trigger production URL. Each message runs the workflow and may consume one n8n execution. Import does not run it.
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 0.7fr) minmax(180px, 1.3fr)', gap: 7 }}>
        <input
          aria-label="n8n agent name"
          data-testid="registry-n8n-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Research workflow"
          style={fieldStyle}
        />
        <input
          aria-label="n8n agent description"
          data-testid="registry-n8n-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="What this workflow does"
          style={fieldStyle}
        />
      </div>
      <div style={{ display: 'flex', gap: 7 }}>
        <input
          aria-label="n8n production Chat Trigger URL"
          data-testid="registry-n8n-url"
          type="url"
          value={webhookUrl}
          onChange={(event) => setWebhookUrl(event.target.value)}
          placeholder="https://example.app.n8n.cloud/webhook/…"
          style={{ ...fieldStyle, flex: 1 }}
        />
        <button
          type="button"
          onClick={submit}
          data-testid="registry-n8n-submit"
          disabled={busy || !canImport || !complete}
          title={!canImport ? 'Workspace owners and admins can import agents.' : undefined}
          style={{ border: 0, borderRadius: 7, padding: '7px 11px', background: 'var(--accent-soft)', color: 'var(--accent-ink)', fontSize: 11, fontWeight: 750, cursor: canImport ? 'pointer' : 'default', opacity: busy || !canImport ? 0.55 : 1 }}
        >
          {busy ? 'Saving…' : 'Import'}
        </button>
      </div>
      {error && <div role="alert" style={{ color: 'var(--ps-red)', fontSize: 11 }}>{error}</div>}
      {notice && <div role="status" style={{ color: 'var(--ps-green)', fontSize: 11 }}>{notice}</div>}
    </div>
  );
}
