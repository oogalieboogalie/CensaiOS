import { useState } from 'react';
import { logToApp } from '../../lib/appLog/browserLog.js';

export const MODEL_PROVIDERS = ['OpenAI', 'Anthropic', 'Google', 'xAI', 'Hugging Face', 'Self-hosted', 'Other'];

const field = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--text-sm)', color: 'var(--ink-soft)' };
const input = {
  padding: '8px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--hairline)',
  background: 'var(--layer-well)', boxShadow: 'var(--well-shadow)', color: 'var(--ink)', fontSize: 'var(--text-base)', font: 'inherit',
};

// "Add a model" in the MLOps Dashboard: a name, the provider and what it is
// for. On save the new model is handed back so the window can open it.
export function AddModelForm({ workspaceId, onAdded, onCancel }) {
  const [modelName, setModelName] = useState('');
  const [provider, setProvider] = useState('OpenAI');
  const [purpose, setPurpose] = useState('');
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState('');

  const save = async (event) => {
    event.preventDefault();
    if (!modelName.trim()) return setProblem('Give the model a name.');
    setSaving(true);
    setProblem('');
    try {
      const res = await fetch('/api/mlops/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, modelName, provider, purpose }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'The model could not be added.');
      onAdded?.(data);
    } catch (err) {
      setProblem(err.message);
      logToApp('warn', `mlops: model not added: ${err.message}`, { where: 'mlops' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} aria-label="Add a model" style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 420 }}>
      <h2 style={{ margin: 0, fontSize: 'var(--text-xl)', fontWeight: 600 }}>Add a model</h2>
      <label style={field}>
        Name
        <input style={input} value={modelName} onChange={(e) => setModelName(e.target.value)} placeholder="Price predictor" autoFocus />
      </label>
      <label style={field}>
        Provider
        <select style={input} value={provider} onChange={(e) => setProvider(e.target.value)}>
          {MODEL_PROVIDERS.map((p) => <option key={p}>{p}</option>)}
        </select>
      </label>
      <label style={field}>
        What it is for
        <textarea style={{ ...input, minHeight: 70, resize: 'vertical' }} value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Sets prices for the online shop" />
      </label>
      {problem && <div role="alert" style={{ fontSize: 'var(--text-sm)', color: 'var(--danger-text)' }}>{problem}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" disabled={saving} className="ml-btn ml-btn--primary">
          {saving ? 'Adding…' : 'Add model'}
        </button>
        <button type="button" onClick={onCancel} className="ml-btn ml-btn--tall">
          Cancel
        </button>
      </div>
    </form>
  );
}
