import React from 'react';
import { MODEL_OPTIONS } from '../../lib/agentModelOptions.js';
import { useWorkspaceStore } from '../../lib/store.js';

const PROVIDER_LABEL = {
  openrouter: 'OpenRouter', google: 'Gemini', openai: 'OpenAI', cohere: 'Cohere',
  moonshot: 'Kimi', opencode: 'OpenCode', ollama: 'Ollama',
};

const fieldStyle = {
  background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-lg)',
  color: 'var(--ink)', font: '12px var(--font-sans)', padding: '6px 8px', outline: 'none', minWidth: 0,
};

export async function requestDesignRemix(payload, fetchImpl = globalThis.fetch) {
  const res = await fetchImpl('/api/design/remix', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Remix failed (${res.status})`);
  return data;
}

// "Keep working on it with any model": pick a model, say what to change.
export function DesignRemixBar({ source, sourceType, onApply, onClose }) {
  const workspaceId = useWorkspaceStore(state => state.workspaceId);
  const [instruction, setInstruction] = React.useState('');
  const [provider, setProvider] = React.useState('');
  const [model, setModel] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const models = provider ? (MODEL_OPTIONS[provider] || []) : [];

  const run = async () => {
    if (!instruction.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const data = await requestDesignRemix({
        source, sourceType, instruction: instruction.trim(), workspaceId,
        modelProvider: provider || null, modelName: provider ? (model || models[0]?.value || null) : null,
      });
      onApply(data.source);
      setInstruction('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      aria-label="Remix with AI"
      onSubmit={(e) => { e.preventDefault(); run(); }}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        position: 'absolute', left: 16, right: 16, bottom: 60, zIndex: 4,
        display: 'grid', gap: 8, padding: 10, borderRadius: 'var(--radius-xl)',
        background: 'var(--surface)', border: '1px solid var(--hairline)', boxShadow: 'var(--shadow-card)',
      }}
    >
      <textarea
        autoFocus
        rows={2}
        value={instruction}
        placeholder="Describe the change, e.g. make the hero dark with a bigger headline"
        onChange={(e) => setInstruction(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); run(); } if (e.key === 'Escape') onClose(); }}
        style={{ ...fieldStyle, resize: 'none', fontSize: 'var(--text-md)' }}
      />
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <select aria-label="Model provider" value={provider} onChange={(e) => { setProvider(e.target.value); setModel(''); }} style={fieldStyle}>
          <option value="">Workspace default model</option>
          {Object.keys(MODEL_OPTIONS).map(id => <option key={id} value={id}>{PROVIDER_LABEL[id] || id}</option>)}
        </select>
        {provider && (
          <select aria-label="Model" value={model || models[0]?.value || ''} onChange={(e) => setModel(e.target.value)} style={{ ...fieldStyle, flex: 1 }}>
            {models.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        )}
        <span style={{ flex: provider ? 0 : 1 }} />
        <button type="button" onClick={onClose} style={{ all: 'unset', cursor: 'pointer', font: '12px var(--font-sans)', color: 'var(--ink-soft)', padding: '6px 8px' }}>
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy || !instruction.trim()}
          style={{
            all: 'unset', cursor: busy ? 'progress' : 'pointer', padding: '6px 14px', borderRadius: 'var(--radius-full)',
            background: 'var(--accent)', color: 'var(--accent-contrast, white)', font: '600 12px var(--font-sans)',
            opacity: busy || !instruction.trim() ? 0.55 : 1,
          }}
        >
          {busy ? 'Remixing…' : 'Apply'}
        </button>
      </div>
      {error && <div role="alert" style={{ color: 'var(--ps-red)', font: '12px var(--font-sans)' }}>{error}</div>}
    </form>
  );
}
