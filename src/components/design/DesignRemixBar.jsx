import React from 'react';
import { MODEL_OPTIONS } from '../../lib/agentModelOptions.js';
import { useWorkspaceStore } from '../../lib/store.js';

const PROVIDER_LABEL = {
  openrouter: 'OpenRouter', google: 'Gemini', openai: 'OpenAI', cohere: 'Cohere',
  moonshot: 'Kimi', opencode: 'OpenCode', ollama: 'Ollama', anthropic: 'Claude',
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
      className="hb-panel hb-lift hb-db-remix"
      aria-label="Remix with AI"
      onSubmit={(e) => { e.preventDefault(); run(); }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <textarea
        className="hb-well hb-db-field hb-db-note"
        autoFocus
        rows={2}
        value={instruction}
        placeholder="Describe the change, e.g. make the hero dark with a bigger headline"
        onChange={(e) => setInstruction(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); run(); } if (e.key === 'Escape') onClose(); }}
      />
      <div className="hb-db-remix-row">
        <select className="hb-well hb-db-field" aria-label="Model provider" value={provider} onChange={(e) => { setProvider(e.target.value); setModel(''); }}>
          <option value="">Workspace default model</option>
          {Object.keys(MODEL_OPTIONS).map(id => <option key={id} value={id}>{PROVIDER_LABEL[id] || id}</option>)}
        </select>
        {provider && (
          <select className="hb-well hb-db-field hb-db-grow" aria-label="Model" value={model || models[0]?.value || ''} onChange={(e) => setModel(e.target.value)}>
            {models.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        )}
        {!provider && <span className="hb-db-grow" />}
        <button type="button" className="hb-db-btn hb-press" onClick={onClose}>Cancel</button>
        <button
          type="submit"
          className="hb-db-btn hb-press"
          data-primary="true"
          data-busy={busy ? 'true' : undefined}
          disabled={busy || !instruction.trim()}
        >
          {busy ? 'Remixing…' : 'Apply'}
        </button>
      </div>
      {error && <div role="alert" className="hb-db-error">{error}</div>}
    </form>
  );
}
