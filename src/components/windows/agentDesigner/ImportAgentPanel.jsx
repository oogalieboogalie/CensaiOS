import React from 'react';
import { api } from '../../../lib/api.js';
import { getAgents } from '../../../lib/agentStore.js';
import {
  AgentImportError,
  PLATFORMS,
  parseAgentFile,
  toAgentPayload,
} from '../../../lib/agentImport/index.js';
import { uniqueAgentId } from './modelConfig.js';
import { darkInputStyle, panelHeaderStyle, primaryBtnStyle, formContainerStyle, detailsStyle } from './styles.js';
import { ImportCard } from './ImportAgentCard.jsx';

const HINTS = {
  'google-adk': 'agent.py with Agent(...) or root_agent.yaml',
  openai: 'Assistant JSON or an Agents SDK .py file, or pull your Assistants from your account',
  claude: 'Subagent .md file or Agent SDK JSON',
  grok: 'Agent JSON with a grok model',
  elevenlabs: 'Agent JSON, or pull from your account',
};

// Platforms whose agents can be pulled straight from the person's account.
const ACCOUNT_PULLS = [
  { platform: 'elevenlabs', label: 'ElevenLabs' },
  { platform: 'openai', label: 'OpenAI' },
];

const chipStyle = (active) => ({
  all: 'unset', cursor: 'pointer', padding: '6px 11px', borderRadius: 'var(--radius-full)',
  border: `1px solid ${active ? 'var(--accent-line)' : 'var(--hairline)'}`,
  background: active ? 'var(--accent-soft)' : 'var(--surface)', color: 'var(--ink)',
  fontSize: 'var(--text-sm)', fontWeight: 750,
});
const ghostBtnStyle = {
  all: 'unset', cursor: 'pointer', padding: '8px 13px', borderRadius: 'var(--radius-full)',
  border: '1px solid var(--hairline)', background: 'var(--surface)', color: 'var(--ink)',
  fontSize: 'var(--text-sm)', fontWeight: 800,
};
function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsText(file);
  });
}

export function ImportAgentPanel({ onCreateAgent, onUpdate }) {
  const [platform, setPlatform] = React.useState(null);
  const [text, setText] = React.useState('');
  const [fileName, setFileName] = React.useState('');
  const [result, setResult] = React.useState(null);
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [states, setStates] = React.useState({});
  const [savedKeys, setSavedKeys] = React.useState(null);
  const [dragging, setDragging] = React.useState(false);
  const fileRef = React.useRef(null);

  React.useEffect(() => {
    let alive = true;
    api.getUserKeys()
      .then(rows => { if (alive) setSavedKeys(new Set((rows || []).map(row => row.provider))); })
      .catch(() => { if (alive) setSavedKeys(null); });
    return () => { alive = false; };
  }, []);

  const read = React.useCallback((source, name, hint) => {
    setError('');
    setStates({});
    try {
      setResult(parseAgentFile(source, { platform: hint, fileName: name }));
    } catch (err) {
      setResult(null);
      setError(err instanceof AgentImportError ? err.message : `Could not read that file: ${err.message}`);
    }
  }, []);

  const onFile = async (file) => {
    if (!file) return;
    try {
      const contents = await readFile(file);
      setText(contents);
      setFileName(file.name);
      read(contents, file.name, platform);
    } catch (err) {
      setError(err.message);
    }
  };

  const pullFromAccount = async (source = 'elevenlabs') => {
    const label = ACCOUNT_PULLS.find((item) => item.platform === source)?.label || source;
    setBusy(source);
    setError('');
    setStates({});
    try {
      const res = await fetch('/api/agent-import/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: source }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Could not reach ${label}.`);
      if (!data.agents?.length) throw new Error(`No agents found in that ${label} account.`);
      setResult({ platform: source, agents: data.agents });
    } catch (err) {
      setResult(null);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const importAgent = async (agent) => {
    const key = agent.name;
    setStates(prev => ({ ...prev, [key]: 'saving' }));
    try {
      const id = uniqueAgentId(agent.name, 'core', getAgents());
      const hue = Math.abs([...agent.name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7)) % 360;
      const saved = await api.createAgent(toAgentPayload(agent, { id, hue }));
      const created = { ...saved, glyph: saved.glyph || agent.name[0]?.toUpperCase(), hue: saved.hue ?? hue, kind: 'ai', agentType: 'core', tool_scopes: saved.tool_scopes };
      onCreateAgent?.(created, { groupIds: [] });
      onUpdate?.({ createdAgentId: created.id, lastCreatedName: created.name, lastImportedFrom: agent.platform });
      setStates(prev => ({ ...prev, [key]: 'done' }));
    } catch (err) {
      setStates(prev => ({ ...prev, [key]: 'error' }));
      setError(`${agent.name}: ${err.message || 'could not be saved'}`);
    }
  };

  const doneCount = Object.values(states).filter(s => s === 'done').length;

  return (
    <div style={detailsStyle}>
      <div style={formContainerStyle} data-testid="import-agent-panel">
        <div style={panelHeaderStyle}>
          <span>Import an agent</span>
          <span style={{ color: 'var(--ink-faint)', fontSize: 'var(--text-xs)' }}>Your own keys · nothing runs from the file</span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <button type="button" style={chipStyle(!platform)} onClick={() => setPlatform(null)}>Detect it for me</button>
          {Object.values(PLATFORMS).map(p => (
            <button key={p.id} type="button" style={chipStyle(platform === p.id)} onClick={() => setPlatform(p.id)} data-platform={p.id}>{p.label}</button>
          ))}
        </div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-soft)' }}>
          {platform ? HINTS[platform] : 'Google ADK, OpenAI, Claude, Grok and ElevenLabs agent files all work. The platform is worked out from the file.'}
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); onFile(e.dataTransfer.files?.[0]); }}
          style={{ borderRadius: 'var(--radius-lg)', outline: dragging ? '2px dashed var(--accent)' : 'none' }}
        >
          <textarea
            value={text}
            onChange={e => { setText(e.target.value); setFileName(''); }}
            placeholder="Paste the agent file here, or drop it on this box"
            style={{ ...darkInputStyle, minHeight: 150, resize: 'vertical', font: '12px/1.45 var(--font-mono, monospace)' }}
            data-testid="import-text"
          />
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <button type="button" style={primaryBtnStyle} onClick={() => read(text, fileName, platform)} data-testid="import-read">Read it</button>
          <button type="button" style={ghostBtnStyle} onClick={() => fileRef.current?.click()}>Choose a file</button>
          <input ref={fileRef} type="file" accept=".json,.yaml,.yml,.md,.py,.txt" style={{ display: 'none' }} onChange={e => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
          {ACCOUNT_PULLS.filter((item) => !platform || platform === item.platform).map((item) => (
            <button key={item.platform} type="button" style={ghostBtnStyle} onClick={() => pullFromAccount(item.platform)} disabled={Boolean(busy)} data-testid={`import-${item.platform}-account`}>
              {busy === item.platform ? `Asking ${item.label}...` : `Pull from my ${item.label}`}
            </button>
          ))}
          {fileName && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-soft)' }}>{fileName}</span>}
        </div>

        {error && <div style={{ fontSize: 'var(--text-sm)', color: 'var(--danger)' }} data-testid="import-error">{error}</div>}

        {result && (
          <>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-soft)' }}>
              Found {result.agents.length === 1 ? 'one agent' : `${result.agents.length} agents`}
              {doneCount ? ` · ${doneCount} imported, each opened in its own chat window` : ''}.
            </div>
            {result.agents.map(agent => (
              <ImportCard key={agent.name} agent={agent} savedKeys={savedKeys} onImport={importAgent} state={states[agent.name]} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
