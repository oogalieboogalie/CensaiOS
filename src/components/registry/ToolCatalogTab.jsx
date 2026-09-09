import React from 'react';
import { FAMILY_AGENTS } from '../../data/family-agents.js';

const badgeStyle = {
  border: '1px solid var(--hairline)', borderRadius: 999, padding: '2px 7px',
  fontSize: 10, lineHeight: 1.4, color: 'var(--ink-soft)', whiteSpace: 'nowrap',
};

export function ToolCatalogTab({ client }) {
  const [agentId, setAgentId] = React.useState('architect');
  const [search, setSearch] = React.useState('');
  const [state, setState] = React.useState({ loading: true, data: null, error: '' });

  React.useEffect(() => {
    let current = true;
    setState({ loading: true, data: null, error: '' });
    client.listTools(agentId).then(
      data => { if (current) setState({ loading: false, data, error: '' }); },
      error => { if (current) setState({ loading: false, data: null, error: error.message }); },
    );
    return () => { current = false; };
  }, [agentId, client]);

  const query = search.trim().toLowerCase();
  const tools = (state.data?.tools || []).filter(tool => !query || [
    tool.label, tool.name, tool.description, tool.module?.name, tool.category,
  ].some(value => String(value || '').toLowerCase().includes(query)));

  return (
    <div data-testid="registry-tools" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--hairline)', display: 'grid', gap: 8 }}>
        <div style={{ color: 'var(--ink-soft)', fontSize: 11 }}>
          Active means callable now. Attachable means its add-on is installed. Install required grants nothing; approval-required tools still wait for a signed decision.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select aria-label="Team agent" data-testid="tool-registry-agent" value={agentId}
            onChange={event => setAgentId(event.target.value)}
            style={{ background: 'var(--surface-2)', color: 'var(--ink)', border: '1px solid var(--hairline)', borderRadius: 7, padding: '6px 8px' }}>
            {FAMILY_AGENTS.map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
          </select>
          <input aria-label="Search tools" data-testid="tool-registry-search" value={search}
            onChange={event => setSearch(event.target.value)} placeholder="Search tools…"
            style={{ flex: 1, minWidth: 0, background: 'var(--surface-2)', color: 'var(--ink)', border: '1px solid var(--hairline)', borderRadius: 7, padding: '6px 9px' }} />
        </div>
        {state.data && <div data-testid="tool-registry-counts" style={{ fontSize: 11, color: 'var(--ink-faint)' }}>
          {state.data.counts.active} active · {state.data.counts.attachable} attachable · {state.data.counts.installRequired || 0} install required · {state.data.counts.equippedModules} equipped modules
        </div>}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 8 }}>
        {state.loading && <div role="status" style={{ padding: 12, color: 'var(--ink-soft)' }}>Loading effective tools…</div>}
        {state.error && <div role="alert" data-testid="tool-registry-error" style={{ padding: 12, color: 'var(--ps-red)' }}>{state.error}</div>}
        {!state.loading && !state.error && tools.length === 0 && <div data-testid="tool-registry-empty" style={{ padding: 12, color: 'var(--ink-faint)' }}>No tools match.</div>}
        {tools.map(tool => (
          <div key={tool.name} data-testid="tool-registry-row" style={{ padding: '9px 10px', borderBottom: '1px solid var(--hairline)', display: 'grid', gap: 5 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <strong style={{ fontSize: 12 }}>{tool.label}</strong>
              <code style={{ color: 'var(--ink-faint)', fontSize: 10 }}>{tool.name}</code>
              <span style={{ ...badgeStyle, marginLeft: 'auto', color: tool.status === 'active' ? 'var(--accent)' : 'var(--ink-soft)' }}>{tool.status.replaceAll('_', ' ')}</span>
            </div>
            <div style={{ color: 'var(--ink-soft)', fontSize: 11 }}>{tool.description}</div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              <span style={badgeStyle}>{tool.module?.name || (tool.source === 'intrinsic' ? 'Built-in' : 'Role core')}</span>
              <span style={badgeStyle}>{tool.risk}</span>
              <span style={badgeStyle}>{tool.approvalRequired ? 'owner approval' : tool.mode.replaceAll('_', ' ')}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
