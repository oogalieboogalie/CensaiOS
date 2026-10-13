/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Switch } from '../agentEndpoints/AgentEndpointParts.jsx';

function when(value) {
  if (!value) return '';
  const mins = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`;
  return new Date(value).toLocaleDateString();
}

function serverState(server) {
  if (!server.enabled) return { status: 'off', text: 'Off for every agent' };
  if (server.lastError) return { status: 'error', text: server.lastError };
  if (!server.lastCheckedAt) return { status: 'off', text: 'Not checked yet' };
  const n = server.tools.length;
  return { status: 'ok', text: `${n} tool${n === 1 ? '' : 's'}` };
}

export function ServerCard({ server, agentId, agentName, busy, onAllow, onCheck, onEnable, onKey, onRemove }) {
  const allowed = server.agents.some((id) => id.toLowerCase() === String(agentId).toLowerCase());
  const state = serverState(server);
  const [keyOpen, setKeyOpen] = React.useState(false);
  const [key, setKey] = React.useState('');
  return (
    <li className="hb-otl-server" data-testid="otl-server" data-allowed={allowed ? 'true' : 'false'}>
      <div className="hb-aep-toggle-row">
        <div className="hb-otl-server-main">
          <div className="hb-aep-row-main hb-otl-name">
            <span className="hb-aep-dot" data-status={state.status} aria-hidden="true" /> {server.name}
          </div>
          <div className="hb-aep-hint hb-otl-address" title={server.address}>
            {server.transport === 'stdio' ? 'Program: ' : ''}{server.address}{server.hasKey ? ' · key saved' : ''}
          </div>
        </div>
        <Switch on={allowed} disabled={busy || !server.enabled} onChange={(next) => onAllow(server, next)}
          label={`Let ${agentName} use ${server.name}`} testId="otl-allow" />
      </div>
      <div className="hb-aep-hint" data-testid="otl-server-state" data-status={state.status}>
        {allowed ? `${agentName} can use these. ` : `${agentName} cannot use these yet. `}{state.text}
      </div>
      {server.tools.length > 0 && (
        <ul className="hb-otl-tools" data-testid="otl-tools">
          {server.tools.map((tool) => (
            <li key={tool.name} className="hb-otl-tool" title={tool.description || tool.name}>{tool.name}</li>
          ))}
        </ul>
      )}
      <div className="hb-otl-actions">
        <button type="button" className="hb-aep-btn" data-variant="quiet" disabled={busy} onClick={() => onCheck(server)}>Check again</button>
        <button type="button" className="hb-aep-btn" data-variant="quiet" disabled={busy} onClick={() => setKeyOpen((o) => !o)}>
          {server.hasKey ? 'Change key' : 'Add key'}
        </button>
        <button type="button" className="hb-aep-btn" data-variant="quiet" disabled={busy} onClick={() => onEnable(server, !server.enabled)}>
          {server.enabled ? 'Turn off' : 'Turn on'}
        </button>
        <button type="button" className="hb-aep-btn" data-variant="quiet" disabled={busy} onClick={() => onRemove(server)}>Remove</button>
      </div>
      {keyOpen && (
        <form className="hb-aep-new" onSubmit={(e) => { e.preventDefault(); onKey(server, key); setKey(''); setKeyOpen(false); }}>
          <input className="hb-aep-input" type="password" autoComplete="off" placeholder="Paste the key (empty removes it)"
            value={key} onChange={(e) => setKey(e.target.value)} />
          <button type="submit" className="hb-aep-btn" data-variant="primary" disabled={busy}>Save key</button>
        </form>
      )}
    </li>
  );
}

const EMPTY = { name: '', url: '', command: '', key: '', keyEnv: '' };

export function AddServerForm({ programsAllowed, busy, onAdd }) {
  const [kind, setKind] = React.useState('http');
  const [form, setForm] = React.useState(EMPTY);
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    const ok = await onAdd(kind === 'stdio'
      ? { transport: 'stdio', name: form.name, command: form.command, key: form.key, keyEnv: form.keyEnv }
      : { transport: 'http', name: form.name, url: form.url, key: form.key });
    if (ok) setForm(EMPTY);
  };
  return (
    <form className="hb-otl-add" onSubmit={submit} data-testid="otl-add">
      {programsAllowed && (
        <div className="hb-aep-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={kind === 'http'} className="hb-aep-tab" onClick={() => setKind('http')}>Web address</button>
          <button type="button" role="tab" aria-selected={kind === 'stdio'} className="hb-aep-tab" data-testid="otl-kind-program"
            onClick={() => setKind('stdio')}>Program on this computer</button>
        </div>
      )}
      <input className="hb-aep-input" placeholder="Name, e.g. Weather" maxLength={40} value={form.name} onChange={set('name')} data-testid="otl-name" />
      {kind === 'http'
        ? <input className="hb-aep-input" placeholder="https://example.com/mcp" value={form.url} onChange={set('url')} data-testid="otl-url" />
        : <input className="hb-aep-input" placeholder="npx -y @modelcontextprotocol/server-everything" value={form.command}
          onChange={set('command')} data-testid="otl-command" />}
      <input className="hb-aep-input" type="password" autoComplete="off" placeholder="Key, if the server needs one (optional)"
        value={form.key} onChange={set('key')} data-testid="otl-key" />
      {kind === 'stdio' && (
        <input className="hb-aep-input" placeholder="Key goes in the setting named, e.g. API_KEY" value={form.keyEnv} onChange={set('keyEnv')} />
      )}
      <div className="hb-aep-hint">
        {kind === 'http'
          ? 'Any MCP server with a web address (Streamable HTTP). The key is sent as "Authorization: Bearer <key>".'
          : 'censaiOS starts this command and talks to it directly. It runs on this computer with your permissions.'}
        {' '}Keys are locked in your key vault and never shown again.
      </div>
      <button type="submit" className="hb-aep-btn" data-variant="primary" disabled={busy} data-testid="otl-add-btn">
        {busy ? 'Connecting…' : 'Add and check'}
      </button>
    </form>
  );
}

export function OutsideCallList({ calls, agentName }) {
  if (!calls.length) return <div className="hb-aep-empty">{agentName} has not used an outside tool yet.</div>;
  return (
    <ul className="hb-aep-list" data-testid="otl-calls">
      {calls.map((c) => (
        <li key={c.id} className="hb-aep-row" data-testid="otl-call" title={c.error || ''}>
          <span className="hb-aep-dot" data-status={c.ok ? 'ok' : 'error'} aria-hidden="true" />
          <span className="hb-aep-row-main">{c.tool} <span className="hb-otl-from">from {c.server}</span></span>
          <span className="hb-aep-row-meta">
            {c.origin === 'chat' ? 'Chat' : c.origin === 'help' ? 'Helping an agent' : 'Outside app'} · {c.ok ? `${(c.durationMs / 1000).toFixed(1)} s` : 'failed'} · {when(c.at)}
          </span>
        </li>
      ))}
    </ul>
  );
}
