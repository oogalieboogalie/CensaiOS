import React from 'react';
import { logToApp } from '../../../lib/appLog/browserLog.js';
import { darkInputStyle, primaryBtnStyle } from './styles.js';

// "Pull from a GitHub repo" in Import: finds every Claude helper, Google ADK
// (Gemini) agent and agent JSON (Grok and others) in a repo the person names,
// with their own GitHub key, and imports the ticked ones through the panel's
// own importAgent (server: server/routes/agentImportGithub.js).

const ghostBtnStyle = {
  all: 'unset', cursor: 'pointer', padding: '8px 13px', borderRadius: 'var(--radius-full)',
  border: '1px solid var(--hairline)', background: 'var(--surface)', color: 'var(--ink)',
  fontSize: 'var(--text-sm)', fontWeight: 800, whiteSpace: 'nowrap',
};
const boxStyle = {
  display: 'flex', flexDirection: 'column', gap: 8, padding: 12, borderRadius: 'var(--radius-xl)',
  border: '1px solid var(--hairline)', background: 'var(--surface)',
};
const rowStyle = { display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 'var(--text-sm)', color: 'var(--ink)', cursor: 'pointer' };
const softStyle = { fontSize: 'var(--text-xs)', color: 'var(--ink-soft)' };
const keyOf = (agent) => `${agent.sourceFile}#${agent.name}`;

async function postJson(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `GitHub could not be reached (${res.status}).`);
  return data;
}

export function GithubRepoPull({ importAgent }) {
  const [repo, setRepo] = React.useState('');
  const [found, setFound] = React.useState(null);
  const [ticked, setTicked] = React.useState({});
  const [busy, setBusy] = React.useState('');
  const [error, setError] = React.useState('');
  const [done, setDone] = React.useState([]);

  const pull = async () => {
    if (!repo.trim()) { setError('Type the repo first, as owner/name or its GitHub link.'); return; }
    setBusy('reading'); setError(''); setDone([]);
    try {
      const data = await postJson('/api/agent-import/github', { repo: repo.trim() });
      setFound(data);
      setTicked(Object.fromEntries((data.agents || []).map(agent => [keyOf(agent), true])));
    } catch (err) {
      setFound(null);
      setError(err.message);
      logToApp('warn', `agent import: github pull failed: ${err.message}`, { where: 'agentDesigner' });
    } finally {
      setBusy('');
    }
  };

  const agents = found?.agents || [];
  const waiting = agents.filter(agent => ticked[keyOf(agent)] && !done.includes(keyOf(agent)));

  const importTicked = async () => {
    if (!waiting.length) return;
    setBusy('importing');
    const imported = [];
    for (const agent of waiting) {
      if (await importAgent(agent)) imported.push(agent);
    }
    setDone(prev => [...prev, ...imported.map(keyOf)]);
    setBusy('');
    postJson('/api/agent-import/github/imported', { repo: found.repo, names: imported.map(agent => agent.name) }).catch(() => {});
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} data-testid="github-repo-pull">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          value={repo}
          onChange={e => setRepo(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') pull(); }}
          placeholder="owner/name or a GitHub link"
          aria-label="GitHub repo"
          style={{ ...darkInputStyle, flex: 1, minWidth: 0 }}
          data-testid="github-repo-input"
        />
        <button type="button" style={ghostBtnStyle} onClick={pull} disabled={Boolean(busy)} data-testid="import-github-repo">
          {busy === 'reading' ? 'Reading the repo...' : 'Pull from a GitHub repo'}
        </button>
      </div>
      <span style={softStyle}>Finds Claude helpers, Google ADK (Gemini) agents and Grok agent files, using your GitHub key from Settings → Vault.</span>
      {error && <div role="alert" style={{ fontSize: 'var(--text-sm)', color: 'var(--danger)' }} data-testid="github-pull-error">{error}</div>}
      {found && (
        <div style={boxStyle}>
          <div style={softStyle} data-testid="github-pull-summary">
            {agents.length
              ? `Found ${agents.length === 1 ? 'one agent' : `${agents.length} agents`} in ${found.repo} (${found.branch}). Tick the ones to import.`
              : `No agent files in ${found.repo} (${found.branch}).`}
          </div>
          {agents.map(agent => {
            const key = keyOf(agent);
            const isDone = done.includes(key);
            return (
              <label key={key} style={rowStyle}>
                <input
                  type="checkbox"
                  checked={isDone || Boolean(ticked[key])}
                  disabled={isDone || Boolean(busy)}
                  onChange={e => setTicked(prev => ({ ...prev, [key]: e.target.checked }))}
                  aria-label={`Import ${agent.name}`}
                />
                <span style={{ minWidth: 0 }}>
                  <b>{agent.name}</b> · {agent.platformLabel || agent.platform}{isDone ? ' · imported, opened in its own chat' : ''}
                  <span style={{ ...softStyle, display: 'block' }}>{agent.sourceFile}{agent.description ? ` · ${agent.description}` : ''}</span>
                </span>
              </label>
            );
          })}
          {found.skipped?.map(item => (
            <div key={item.file} style={{ ...softStyle, color: 'var(--warning)' }}>Skipped {item.file}: {item.why}</div>
          ))}
          {found.capped && <div style={softStyle}>Showing the first 30 agent files.</div>}
          {agents.length > 0 && (
            <button type="button" style={{ ...primaryBtnStyle, alignSelf: 'flex-start', opacity: waiting.length ? 1 : 0.6 }} onClick={importTicked} disabled={!waiting.length || Boolean(busy)} data-testid="github-pull-import">
              {busy === 'importing' ? 'Importing...' : !waiting.length ? 'Tick an agent to import' : `Import ${waiting.length === 1 ? 'one agent' : `${waiting.length} agents`}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
