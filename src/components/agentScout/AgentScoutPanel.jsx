/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../Icons.jsx';
import { agentScoutApi } from '../../lib/agentScout/api.js';
import { FindResult, MapSummary, ScoutModelPicker } from './AgentScoutParts.jsx';

/**
 * "Scout": this agent's fast, cheap helper for code. It keeps a map of a
 * project (what each file defines, what uses what) and, when the agent
 * needs to change something, points to the exact file and line. The agent
 * makes the edit itself; the scout only looks.
 */
export function AgentScoutPanel({ agent, workspaceId, onClose }) {
  const [data, setData] = React.useState(null);
  const [projectId, setProjectId] = React.useState('');
  const [map, setMap] = React.useState(null);
  const [change, setChange] = React.useState('');
  const [result, setResult] = React.useState(null);
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState('');
  const agentId = agent.id;

  React.useEffect(() => {
    let alive = true;
    agentScoutApi.load(agentId, workspaceId)
      .then((next) => {
        if (!alive) return;
        setData(next);
        setProjectId((id) => id || next.projects.find((p) => p.mappable)?.id || '');
      })
      .catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [agentId, workspaceId]);

  async function act(kind, fn) {
    setBusy(kind);
    setError('');
    try { return await fn(); } catch (e) { setError(e.message); return null; } finally { setBusy(''); }
  }

  const pickModel = (choice) => act('model', async () => setData(await agentScoutApi.setModel(agentId, workspaceId, choice)));
  const lookNow = () => act('map', async () => setMap(await agentScoutApi.map(agentId, workspaceId, { projectId, fresh: true })));
  const find = (e) => {
    e.preventDefault();
    if (!change.trim()) return;
    act('find', async () => setResult((await agentScoutApi.find(agentId, workspaceId, { projectId, change })).result));
  };
  const mappable = data?.projects.filter((p) => p.mappable) || [];

  return (
    <div className="hb-aep hb-scout" data-testid="agent-scout-panel" data-no-drag>
      <div className="hb-aep-head">
        <div>
          <div className="hb-aep-title">{agent.name}&apos;s scout</div>
          <div className="hb-aep-sub">A fast, cheap helper that maps the code and points to the exact line to change. {agent.name} makes the edit.</div>
        </div>
        <button type="button" className="hb-aep-icon" aria-label="Close" onClick={onClose}><Icon.Close size={13} /></button>
      </div>

      {error && <div className="hb-aep-error" role="alert" data-testid="scout-error">{error}</div>}
      {!data ? <div className="hb-aep-empty hb-scout-pad">{error ? '' : 'Loading…'}</div> : (
        <div className="hb-aep-body">
          <section className="hb-aep-section">
            <div className="hb-aep-label">Scout model</div>
            <ScoutModelPicker model={data.model} choices={data.choices} busy={busy === 'model'} onPick={pickModel} />
          </section>

          <section className="hb-aep-section">
            <div className="hb-aep-label">Project</div>
            {mappable.length === 0 ? (
              <div className="hb-aep-empty" data-testid="scout-no-project">
                {agent.name} has no project in a folder on this computer yet. Ask {agent.name} to open one, then come back.
              </div>
            ) : (
              <div className="hb-scout-row">
                <select className="hb-aep-input" data-testid="scout-project" value={projectId} aria-label="Project"
                  onChange={(e) => { setProjectId(e.target.value); setMap(null); setResult(null); }}>
                  {mappable.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <button type="button" className="hb-aep-btn" data-testid="scout-look" disabled={Boolean(busy)} onClick={lookNow}>
                  {busy === 'map' ? 'Looking…' : 'Map it now'}
                </button>
              </div>
            )}
            <MapSummary map={map} />
          </section>

          {mappable.length > 0 && (
            <section className="hb-aep-section">
              <div className="hb-aep-label">Where would a change go?</div>
              <form className="hb-scout-row" onSubmit={find}>
                <input className="hb-aep-input" data-testid="scout-change" value={change} placeholder="e.g. make the welcome screen button say Start"
                  onChange={(e) => setChange(e.target.value)} />
                <button type="submit" className="hb-aep-btn" data-variant="primary" data-testid="scout-find" disabled={Boolean(busy) || !change.trim()}>
                  {busy === 'find' ? 'Looking…' : 'Find it'}
                </button>
              </form>
              <FindResult result={result} />
              <div className="hb-aep-hint">{agent.name} does this on its own with the scout_find tool before it edits code.</div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
