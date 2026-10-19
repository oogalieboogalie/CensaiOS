import React from 'react';
import { logToApp } from '../../../lib/appLog/browserLog.js';
import { primaryBtnStyle } from './styles.js';

// "Pull from this project" in Import > Claude: lists every Claude Code helper
// in the open project's .claude/agents folder and imports the ticked ones
// through the panel's own importAgent. Computer owner only (the server says
// so if someone else presses it).

const ghostBtnStyle = {
  all: 'unset', cursor: 'pointer', padding: '8px 13px', borderRadius: 'var(--radius-full)',
  border: '1px solid var(--hairline)', background: 'var(--surface)', color: 'var(--ink)',
  fontSize: 'var(--text-sm)', fontWeight: 800,
};
const boxStyle = {
  display: 'flex', flexDirection: 'column', gap: 8, padding: 12, borderRadius: 'var(--radius-xl)',
  border: '1px solid var(--hairline)', background: 'var(--surface)',
};
const rowStyle = { display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 'var(--text-sm)', color: 'var(--ink)', cursor: 'pointer' };
const softStyle = { fontSize: 'var(--text-xs)', color: 'var(--ink-soft)' };

async function postJson(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `The project folder could not be read (${res.status}).`);
  return data;
}

export function ProjectHelpersPull({ importAgent }) {
  const [found, setFound] = React.useState(null);
  const [ticked, setTicked] = React.useState({});
  const [busy, setBusy] = React.useState('');
  const [error, setError] = React.useState('');
  const [doneNames, setDoneNames] = React.useState([]);

  const pull = async () => {
    setBusy('reading'); setError(''); setDoneNames([]);
    try {
      const data = await postJson('/api/agent-import/project');
      setFound(data);
      setTicked(Object.fromEntries((data.agents || []).map(agent => [agent.name, true])));
    } catch (err) {
      setFound(null);
      setError(err.message);
      logToApp('warn', `agent import: project pull failed: ${err.message}`, { where: 'agentDesigner' });
    } finally {
      setBusy('');
    }
  };

  const importTicked = async () => {
    const chosen = (found?.agents || []).filter(agent => ticked[agent.name] && !doneNames.includes(agent.name));
    if (!chosen.length) return;
    setBusy('importing');
    const imported = [];
    for (const agent of chosen) {
      if (await importAgent(agent)) imported.push(agent.name);
    }
    setDoneNames(prev => [...prev, ...imported]);
    setBusy('');
    postJson('/api/agent-import/project/imported', { names: imported }).catch(() => {});
  };

  const agents = found?.agents || [];
  const tickedCount = agents.filter(agent => ticked[agent.name] && !doneNames.includes(agent.name)).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} data-testid="project-helpers-pull">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <button type="button" style={ghostBtnStyle} onClick={pull} disabled={Boolean(busy)} data-testid="import-claude-project">
          {busy === 'reading' ? 'Reading the project...' : 'Pull from this project'}
        </button>
        <span style={softStyle}>Reads the helpers in this project&apos;s .claude/agents folder.</span>
      </div>
      {error && <div role="alert" style={{ fontSize: 'var(--text-sm)', color: 'var(--danger)' }} data-testid="project-pull-error">{error}</div>}
      {found && (
        <div style={boxStyle}>
          <div style={softStyle} data-testid="project-pull-summary">
            {agents.length
              ? `Found ${agents.length === 1 ? 'one helper' : `${agents.length} helpers`} in ${found.folder}. Tick the ones to import.`
              : `No Claude helpers in ${found.folder}.`}
          </div>
          {agents.map(agent => {
            const done = doneNames.includes(agent.name);
            return (
              <label key={agent.name} style={rowStyle}>
                <input
                  type="checkbox"
                  checked={done || Boolean(ticked[agent.name])}
                  disabled={done || Boolean(busy)}
                  onChange={e => setTicked(prev => ({ ...prev, [agent.name]: e.target.checked }))}
                  aria-label={`Import ${agent.name}`}
                />
                <span style={{ minWidth: 0 }}>
                  <b>{agent.name}</b>{done ? ' · imported, opened in its own chat' : ''}
                  <span style={{ ...softStyle, display: 'block' }}>{agent.sourceFile}{agent.description ? ` · ${agent.description}` : ''}</span>
                </span>
              </label>
            );
          })}
          {found.skipped?.map(item => (
            <div key={item.file} style={{ ...softStyle, color: 'var(--warning)' }}>Skipped {item.file}: {item.why}</div>
          ))}
          {found.capped && <div style={softStyle}>Showing the first 50 helper files.</div>}
          {agents.length > 0 && (
            <button type="button" style={{ ...primaryBtnStyle, alignSelf: 'flex-start', opacity: tickedCount ? 1 : 0.6 }} onClick={importTicked} disabled={!tickedCount || Boolean(busy)} data-testid="project-pull-import">
              {busy === 'importing' ? 'Importing...' : !tickedCount ? 'Tick a helper to import' : `Import ${tickedCount === 1 ? 'one helper' : `${tickedCount} helpers`}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
