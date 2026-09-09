// src/components/registry/PublishTab.jsx
// D4 RegistryWindow tab 3 — form to create a new card via REST.

import React from 'react';
import { ImportA2ACard } from './ImportA2ACard.jsx';
import { ImportN8NChatCard } from './ImportN8NChatCard.jsx';

const inputStyle = {
  width: '100%', padding: '7px 10px', borderRadius: 7,
  border: '1px solid var(--hairline)', background: 'var(--surface)',
  color: 'var(--ink)', fontSize: 12,
};

function Field({ label, htmlFor, children }) {
  return (
    <label htmlFor={htmlFor} style={{ display: 'grid', gap: 4 }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-faint)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</span>
      {children}
    </label>
  );
}

export function PublishTab({ client, onPublished, canPublish = true, canImport = false }) {
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [version, setVersion] = React.useState('0.1.0');
  const [skillsRaw, setSkillsRaw] = React.useState('');
  const [endpoint, setEndpoint] = React.useState('');
  const [visibility, setVisibility] = React.useState('private');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState('');

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!name.trim() || !description.trim()) return;
    setSubmitting(true); setError('');
    try {
      const skills = skillsRaw.split(',').map((s) => s.trim()).filter(Boolean)
        .map((s, i) => ({ id: `skill-${i}`, name: s }));
      const card = await client.createCard({
        name: name.trim(),
        description: description.trim(),
        version: version.trim() || '0.1.0',
        skills,
        endpoint: endpoint.trim() || null,
        visibility,
      });
      await onPublished?.(card);
      setName(''); setDescription(''); setSkillsRaw(''); setEndpoint(''); setVersion('0.1.0');
    } catch (err) {
      setError(err.message || 'Publish failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ padding: 12, display: 'grid', gap: 10, flex: 1, minHeight: 0, overflow: 'auto' }} data-testid="registry-publish-form">
      <ImportA2ACard client={client} onImported={onPublished} canImport={canImport} />
      <ImportN8NChatCard client={client} onImported={onPublished} canImport={canImport} />
      <div style={{ borderTop: '1px solid var(--hairline)', margin: '2px 0' }} />
      <div style={{ fontSize: 12, fontWeight: 750, color: 'var(--ink)' }}>Publish a descriptive card</div>
      {error && <div data-testid="registry-error" style={{ color: 'var(--ps-red)', fontSize: 12 }}>{error}</div>}
      <Field label="Name" htmlFor="pub-name">
        <input id="pub-name" data-testid="registry-publish-name" value={name} onChange={(e) => setName(e.target.value)} required style={inputStyle} />
      </Field>
      <Field label="Description" htmlFor="pub-desc">
        <textarea id="pub-desc" data-testid="registry-publish-description" value={description} onChange={(e) => setDescription(e.target.value)} required rows={3} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
      </Field>
      <Field label="Version" htmlFor="pub-ver">
        <input id="pub-ver" data-testid="registry-publish-version" value={version} onChange={(e) => setVersion(e.target.value)} style={inputStyle} />
      </Field>
      <Field label="Skills (comma-separated)" htmlFor="pub-skills">
        <input id="pub-skills" data-testid="registry-publish-skills" value={skillsRaw} onChange={(e) => setSkillsRaw(e.target.value)} placeholder="e.g. summarize, search" style={inputStyle} />
      </Field>
      <Field label="Endpoint (optional)" htmlFor="pub-endpoint">
        <input id="pub-endpoint" data-testid="registry-publish-endpoint" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://…" style={inputStyle} />
      </Field>
      <Field label="Visibility" htmlFor="pub-vis">
        <select id="pub-vis" data-testid="registry-publish-visibility" value={visibility} onChange={(e) => setVisibility(e.target.value)} style={inputStyle}>
          <option value="private">private (owner only)</option>
          <option value="workspace">workspace</option>
          <option value="public">public</option>
        </select>
      </Field>
      <div>
        <button
          type="submit"
          disabled={submitting || !canPublish}
          title={!canPublish ? 'Open a workspace to publish AgentCards.' : undefined}
          data-testid="registry-publish-submit"
          style={{ all: 'unset', cursor: canPublish ? 'pointer' : 'default', padding: '8px 14px', borderRadius: 7, background: canPublish ? 'var(--accent-soft)' : 'var(--surface)', color: canPublish ? 'var(--accent-ink)' : 'var(--ink-faint)', fontSize: 12, fontWeight: 700 }}
        >
          {submitting ? 'Publishing…' : 'Publish'}
        </button>
      </div>
    </form>
  );
}
