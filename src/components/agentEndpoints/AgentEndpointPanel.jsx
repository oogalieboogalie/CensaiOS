/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../Icons.jsx';
import { agentEndpointsApi } from '../../lib/agentEndpoints/api.js';
import { endpointUrls, trimBase } from '../../lib/agentEndpoints/snippets.js';
import { CallLog, ConnectTabs, CopyBlock, KeyList, ReachOutside, RelayAddress, Switch } from './AgentEndpointParts.jsx';

const OUTSIDE_BASE_KEY = 'censai.agentEndpoints.outsideBase';
const POLL_MS = 5000;

function readOutsideBase() {
  try { return globalThis.localStorage?.getItem(OUTSIDE_BASE_KEY) || ''; } catch { return ''; }
}

/**
 * "Share agent": turns one board agent into an endpoint other apps can call
 * (MCP or plain HTTP). Off until the owner turns it on; keys are per agent
 * and shown once; every outside call is listed here and lands in the chat.
 */
export function AgentEndpointPanel({ agent, windowId, workspaceId, onClose }) {
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [label, setLabel] = React.useState('');
  const [freshKey, setFreshKey] = React.useState(null);
  const [outsideBase, setOutsideBaseState] = React.useState(readOutsideBase);
  const endpointId = data?.endpoint?.id;

  const setOutsideBase = (value) => {
    setOutsideBaseState(value);
    try { globalThis.localStorage?.setItem(OUTSIDE_BASE_KEY, value); } catch { /* private window */ }
  };

  React.useEffect(() => {
    let alive = true;
    agentEndpointsApi.open({ workspaceId, agentId: agent.id, agentName: agent.name, windowId })
      .then((result) => { if (alive) setData(result); })
      .catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [workspaceId, agent.id, agent.name, windowId]);

  // Keep the call log fresh while the panel is open and sharing is on.
  React.useEffect(() => {
    if (!endpointId || !data?.endpoint?.enabled) return undefined;
    const timer = setInterval(() => {
      agentEndpointsApi.get(endpointId).then(setData).catch(() => {});
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [endpointId, data?.endpoint?.enabled]);

  async function act(fn) {
    setBusy(true);
    setError('');
    try { return await fn(); } catch (e) { setError(e.message); return null; } finally { setBusy(false); }
  }

  const toggle = (enabled) => act(async () => setData(await agentEndpointsApi.setEnabled(endpointId, enabled)));
  const makeKey = (event) => {
    event.preventDefault();
    return act(async () => {
      const result = await agentEndpointsApi.createKey(endpointId, label.trim() || 'Claude Code');
      setFreshKey(result.key);
      setLabel('');
      setData(result);
    });
  };
  const revoke = (key) => {
    if (!globalThis.confirm?.(`Revoke "${key.label}"? Apps using it stop working right away.`)) return null;
    return act(async () => setData(await agentEndpointsApi.revokeKey(endpointId, key.id)));
  };

  const base = trimBase(outsideBase) || globalThis.location?.origin || '';
  const endpoint = data?.endpoint;
  const urls = endpoint ? endpointUrls(base, endpoint) : null;

  return (
    <div className="hb-aep" data-testid="agent-endpoint-panel" data-no-drag>
      <div className="hb-aep-head">
        <div>
          <div className="hb-aep-title">Share {agent.name}</div>
          <div className="hb-aep-sub">Let Claude Code, Claude Desktop, Cursor and other apps ask {agent.name} for help.</div>
        </div>
        <button type="button" className="hb-aep-icon" aria-label="Close" onClick={onClose}><Icon.Close size={13} /></button>
      </div>

      {error && <div className="hb-aep-error" role="alert">{error}</div>}
      {!endpoint ? <div className="hb-aep-empty">{error ? '' : 'Loading…'}</div> : (
        <div className="hb-aep-body">
          <section className="hb-aep-section hb-aep-toggle-row">
            <div>
              <div className="hb-aep-row-main">Answer apps outside censaiOS</div>
              <div className="hb-aep-hint" data-testid="aep-state">
                {endpoint.enabled
                  ? `On. ${agent.name} answers while censaiOS is open on this computer.`
                  : `Off. Nothing outside censaiOS can reach ${agent.name}.`}
              </div>
            </div>
            <Switch on={endpoint.enabled} disabled={busy} onChange={toggle} label="Answer apps outside censaiOS" testId="aep-switch" />
          </section>

          <section className="hb-aep-section">
            <div className="hb-aep-label">Address</div>
            <CopyBlock text={urls.mcp} testId="aep-mcp-url" />
            <div className="hb-aep-hint">MCP tool <code>{endpoint.toolName}</code> · registry card <code>{endpoint.cardId}</code></div>
            <RelayAddress address={data.relayAddress} relay={data.relay} />
            <ReachOutside outsidePort={data.outsidePort} outsideBase={outsideBase} setOutsideBase={setOutsideBase} />
          </section>

          <section className="hb-aep-section">
            <div className="hb-aep-label">Keys</div>
            {freshKey && (
              <div className="hb-aep-fresh" data-testid="aep-fresh-key">
                <div className="hb-aep-hint">Copy this key now. It is not shown again.</div>
                <CopyBlock text={freshKey} />
              </div>
            )}
            <KeyList keys={data.keys} onRevoke={revoke} busy={busy} />
            <form className="hb-aep-new" onSubmit={makeKey}>
              <input className="hb-aep-input" placeholder="Key name, e.g. Claude Code" value={label} maxLength={60}
                onChange={(e) => setLabel(e.target.value)} data-testid="aep-key-label" />
              <button type="submit" className="hb-aep-btn" data-variant="primary" disabled={busy} data-testid="aep-new-key">New key</button>
            </form>
          </section>

          <section className="hb-aep-section">
            <div className="hb-aep-label">Connect an app</div>
            <ConnectTabs base={base} endpoint={endpoint} freshKey={freshKey} relayAddress={data.relayAddress} />
          </section>

          <section className="hb-aep-section">
            <div className="hb-aep-label">Recent outside calls</div>
            <CallLog calls={data.calls} />
            <div className="hb-aep-hint">
              Each key: {data.limits.callsPerMinute} calls a minute, {data.limits.concurrentPerKey} at once.
              Outside calls use {agent.name}'s model and memory, and only its look-up tools.
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
