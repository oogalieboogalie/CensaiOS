/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from './Icons.jsx';
import { WindowTitle } from './Windows.jsx';
import { ChatBubble } from './chat/ChatBubble.jsx';
import { ChatInput } from './chat/ChatInput.jsx';
import { ChatEmptyState } from './chat/ChatEmptyState.jsx';
import { ChatStatus } from './chat/ChatStatus.jsx';
import { sendToCanvas } from '../lib/chat/sendToCanvas.js';

const OLLAMA_STARTERS = ['Explain what you are good at', 'Summarize a paragraph I paste', 'Write a small Python script'];

async function readJson(url, options) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

// User-facing local-model chat (Ollama canvas node). No cloud credentials:
// lists models from GET /api/ollama/models and chats via POST
// /api/ollama/chat. Waits for the full response. Uses the shared spec 3
// chat components so it looks like every other chat on the canvas.
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

  const send = async (textOverride = null) => {
    const text = String(textOverride ?? draft).trim();
    if (!text || sending || !model) return;
    const userMsg = { role: 'user', content: text };
    const history = [...msgs, userMsg];
    setMsgs(history);
    setDraft('');
    setError('');
    setSending(true);
    try {
      const data = await readJson('/api/ollama/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: history.map(({ role, content }) => ({ role, content })) }),
      });
      setMsgs((m) => [...m, { role: 'assistant', content: data.text || '(empty reply)', model }]);
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
      <div className="hb-chat" data-chat-root>
        {unreachable ? (
          <div className="hb-chat-empty" style={{ padding: 'var(--pad-4)' }}>
            <div className="hb-chat-empty-name">Ollama is not reachable</div>
            <div className="hb-chat-empty-blurb">
              Ollama not reachable{baseUrl ? ` at ${baseUrl}` : ''}. Start Ollama
              (`ollama serve`) and pull a model (`ollama pull llama3`), then retry.
            </div>
            {loadError && <div className="hb-chat-empty-model" style={{ color: 'var(--danger)' }}>{loadError}</div>}
            <div><button type="button" className="hb-text-btn" data-primary="true" onClick={loadModels}>Retry</button></div>
          </div>
        ) : (
          <>
            <div ref={scrollRef} className="hb-chat-scroll">
              {msgs.length === 0 && !sending ? (
                <ChatEmptyState title={model || 'Local model'} blurb="Runs fully on your machine through Ollama. No cloud key needed."
                  starters={OLLAMA_STARTERS} onPick={(prompt) => send(prompt)} />
              ) : (
                <div className="hb-chat-col">
                  {msgs.map((m, i) => (
                    <ChatBubble key={i} index={i}
                      message={{ from: m.role === 'user' ? 'me' : 'ollama', text: m.content }}
                      authorMeta={m.role === 'user' ? null : m.model}
                      onSend={(artifact) => sendToCanvas(win?.id, artifact)} />
                  ))}
                  {sending && <div className="hb-msg" data-from="agent"><ChatStatus liveStatus={{ status: 'thinking' }} /></div>}
                  {error && <div className="hb-msg-note" role="alert">{error}</div>}
                </div>
              )}
            </div>
            <ChatInput draft={draft} setDraft={setDraft} sending={sending} send={() => send()}
              inputLabel="Ollama message" placeholder={`Message ${model || 'a model'}`}
              modelChip={(
                <select aria-label="Ollama model" className="hb-model-chip" value={model} disabled={models === null} onChange={(e) => setModel(e.target.value)}>
                  {models === null && <option value="">Loading models…</option>}
                  {(models || []).map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              )} />
          </>
        )}
      </div>
    </>
  );
}
