/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from './Icons.jsx';
import { WindowTitle } from './Windows.jsx';

async function readJson(url, options) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

// User-facing local-model chat (Ollama canvas node). No cloud credentials:
// lists models from GET /api/ollama/models and chats via POST
// /api/ollama/chat. No streaming in v0.1 — waits for the full response.
export function OllamaNodeWindow({ win, onUpdate }) {
  const [models, setModels] = React.useState(null);
  const [baseUrl, setBaseUrl] = React.useState('');
  const [model, setModel] = React.useState('');
  const [msgs, setMsgs] = React.useState([]);
  const [draft, setDraft] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState('');
  const [loadError, setLoadError] = React.useState('');
  const scrollRef = React.useRef(null);

  const loadModels = React.useCallback(async () => {
    setLoadError('');
    try {
      const data = await readJson('/api/ollama/models');
      setBaseUrl(data.baseUrl || '');
      const list = Array.isArray(data.models) ? data.models : [];
      setModels(list);
      setModel((prev) => (prev && list.includes(prev) ? prev : (list[0] || '')));
    } catch (err) {
      setModels([]);
      setLoadError(err.message || 'Failed to reach Ollama');
    }
  }, []);

  React.useEffect(() => { loadModels(); }, [loadModels]);
  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs, sending]);

  const unreachable = models !== null && models.length === 0;

  const send = async () => {
    if (!draft.trim() || sending || !model) return;
    const userMsg = { role: 'user', content: draft.trim() };
    const history = [...msgs, userMsg];
    setMsgs(history);
    setDraft('');
    setError('');
    setSending(true);
    try {
      const data = await readJson('/api/ollama/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: history }),
      });
      setMsgs((m) => [...m, { role: 'assistant', content: data.text || '(empty reply)' }]);
    } catch (err) {
      setError(err.message || 'Send failed. Try again shortly.');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <WindowTitle
        icon={<Icon.Bot size={14} />}
        label={win?.title || 'Ollama'}
        subtitle={model || 'local models'}
        attachedAgentIds={win?.attachedAgents}
        onDetach={(id) => onUpdate?.({ attachedAgents: (win?.attachedAgents || []).filter((a) => a !== id) })}
      />
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--surface)', color: 'var(--ink)', fontFamily: 'var(--font-sans)' }}>
        <div style={{ display: 'flex', gap: 8, padding: 10, borderBottom: '1px solid var(--hairline)', alignItems: 'center' }}>
          <select aria-label="Ollama model" value={model} disabled={unreachable || models === null} onChange={(e) => setModel(e.target.value)} style={{ flex: 1, fontSize: 12, padding: '7px 9px', borderRadius: 8, border: '1px solid var(--hairline)', background: 'var(--surface-2)', color: 'var(--ink)' }}>
            {models === null && <option value="">Loading models…</option>}
            {models !== null && models.length === 0 && <option value="">No models</option>}
            {(models || []).map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <button type="button" onClick={loadModels} title="Retry model list" aria-label="Retry model list" style={{ all: 'unset', cursor: 'pointer', fontSize: 12, color: 'var(--ink-soft)', border: '1px solid var(--hairline)', borderRadius: 8, padding: '7px 10px' }}>Retry</button>
        </div>

        {unreachable ? (
          <div style={{ padding: 16, fontSize: 12.5, color: 'var(--ink-soft)', lineHeight: 1.6 }}>
            Ollama not reachable{baseUrl ? ` at ${baseUrl}` : ''}. Start Ollama
            (`ollama serve`) and pull a model (`ollama pull llama3`), then Retry.
            {loadError && <div style={{ marginTop: 6, color: 'var(--ps-red)' }}>{loadError}</div>}
          </div>
        ) : (
          <>
            <div ref={scrollRef} style={{ flex: 1, minHeight: 120, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {msgs.length === 0 && !sending && (
                <div style={{ fontSize: 12, color: 'var(--ink-faint)', fontStyle: 'italic' }}>Say hi — runs fully local, no cloud key needed.</div>
              )}
              {msgs.map((m, i) => (
                <div key={i} style={{
                  alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '85%', fontSize: 12, padding: '6px 10px', borderRadius: 12,
                  background: m.role === 'user' ? 'var(--accent)' : 'var(--surface-2)',
                  color: m.role === 'user' ? 'white' : 'var(--ink)',
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>{m.content}</div>
              ))}
              {sending && <div style={{ fontSize: 11, color: 'var(--ink-faint)', fontStyle: 'italic' }}>{model} is thinking…</div>}
              {error && <div style={{ fontSize: 11, color: 'var(--ps-red)' }}>{error}</div>}
            </div>
            <div style={{ display: 'flex', gap: 6, padding: 10, borderTop: '1px solid var(--hairline)' }}>
              <input aria-label="Ollama message" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder={`Message ${model || 'a model'}…`} style={{ all: 'unset', flex: 1, border: '1px solid var(--hairline)', borderRadius: 9, padding: '7px 10px', fontSize: 12, color: 'var(--ink)', background: 'var(--surface-2)' }} />
              <button type="button" onClick={send} disabled={sending || !draft.trim() || !model} aria-label="Send message" style={{ all: 'unset', cursor: sending || !draft.trim() ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 700, color: 'white', background: 'var(--accent)', borderRadius: 9, padding: '7px 14px', opacity: sending || !draft.trim() ? 0.5 : 1 }}>↑</button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
