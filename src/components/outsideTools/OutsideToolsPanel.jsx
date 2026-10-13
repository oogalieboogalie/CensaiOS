/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../Icons.jsx';
import { outsideToolsApi } from '../../lib/outsideTools/api.js';
import { AddServerForm, OutsideCallList, ServerCard } from './OutsideToolsParts.jsx';

const POLL_MS = 6000;

/**
 * "Tools": the mirror of Share. Add outside MCP servers (a web address, or a
 * program on this computer in the desktop app) and pick which of them this
 * agent may use. A new server is off for every agent until it is given to
 * one here. Each call the agent makes shows in its chat and in the list below.
 */
export function OutsideToolsPanel({ agent, onClose }) {
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const agentId = agent.id;

  React.useEffect(() => {
    let alive = true;
    const load = () => outsideToolsApi.list(agentId)
      .then((result) => { if (alive) setData(result); })
      .catch((e) => { if (alive) setError(e.message); });
    load();
    const timer = setInterval(load, POLL_MS);
    return () => { alive = false; clearInterval(timer); };
  }, [agentId]);

  async function act(fn) {
    setBusy(true);
    setError('');
    try { setData(await fn()); return true; } catch (e) { setError(e.message); return false; } finally { setBusy(false); }
  }

  const handlers = {
    onAllow: (server, allowed) => act(() => outsideToolsApi.setAllowed(agentId, server.id, allowed)),
    onCheck: (server) => act(() => outsideToolsApi.check(agentId, server.id)),
    onEnable: (server, enabled) => act(() => outsideToolsApi.setEnabled(agentId, server.id, enabled)),
    onKey: (server, key) => act(() => outsideToolsApi.setKey(agentId, server.id, key)),
    onRemove: (server) => {
      if (!globalThis.confirm?.(`Remove "${server.name}"? Every agent loses its tools and its key is deleted.`)) return null;
      return act(() => outsideToolsApi.remove(agentId, server.id));
    },
  };

  return (
    <div className="hb-aep hb-otl" data-testid="outside-tools-panel" data-no-drag>
      <div className="hb-aep-head">
        <div>
          <div className="hb-aep-title">Tools for {agent.name}</div>
          <div className="hb-aep-sub">Give {agent.name} tools from outside MCP servers. Every call shows in this chat.</div>
        </div>
        <button type="button" className="hb-aep-icon" aria-label="Close" onClick={onClose}><Icon.Close size={13} /></button>
      </div>

      {error && <div className="hb-aep-error" role="alert" data-testid="otl-error">{error}</div>}
      {!data ? <div className="hb-aep-empty hb-otl-loading">{error ? '' : 'Loading…'}</div> : (
        <div className="hb-aep-body">
          <section className="hb-aep-section">
            <div className="hb-aep-label">Your tool servers</div>
            {data.servers.length === 0
              ? <div className="hb-aep-empty">No tool servers yet. Add one below.</div>
              : (
                <ul className="hb-otl-servers">
                  {data.servers.map((server) => (
                    <ServerCard key={server.id} server={server} agentId={agentId} agentName={agent.name} busy={busy} {...handlers} />
                  ))}
                </ul>
              )}
          </section>

          <section className="hb-aep-section">
            <div className="hb-aep-label">Add a tool server</div>
            <AddServerForm programsAllowed={data.programsAllowed} busy={busy}
              onAdd={(input) => act(() => outsideToolsApi.add(agentId, input))} />
          </section>

          <section className="hb-aep-section">
            <div className="hb-aep-label">Recent outside tool calls</div>
            <OutsideCallList calls={data.calls} agentName={agent.name} />
            <div className="hb-aep-hint">
              Apps that call {agent.name} through Share never get these tools; they keep look-up tools only.
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
