/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../Icons.jsx';
import { agentMemoryApi } from '../../lib/agentMemory/api.js';
import { AddFactForm, EpisodeList, FactCard, IdentityEditor } from './AgentMemoryParts.jsx';

const TABS = [
  { id: 'facts', label: 'What it knows' },
  { id: 'identity', label: 'Who it is' },
  { id: 'episodes', label: 'Past conversations' },
];

/**
 * "Memory": what this agent remembers for you. Facts carry two dates (when
 * it became true, when the agent learned it) and every earlier version stays
 * in the history. Who it is stays the same when its AI model changes.
 */
export function AgentMemoryPanel({ agent, onClose }) {
  const [data, setData] = React.useState(null);
  const [tab, setTab] = React.useState('facts');
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const agentId = agent.id;

  React.useEffect(() => {
    let alive = true;
    agentMemoryApi.load(agentId)
      .then((result) => { if (alive) setData(result); })
      .catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [agentId]);

  async function act(fn) {
    setBusy(true);
    setError('');
    try { setData(await fn()); return true; } catch (e) { setError(e.message); return false; } finally { setBusy(false); }
  }

  const saveFact = (fact) => act(() => agentMemoryApi.saveFact(agentId, fact));

  return (
    <div className="hb-aep hb-amem" data-testid="agent-memory-panel" data-no-drag>
      <div className="hb-aep-head">
        <div>
          <div className="hb-aep-title">{agent.name}&apos;s memory</div>
          <div className="hb-aep-sub">What {agent.name} remembers for you, with dates. Only you see this.</div>
        </div>
        <button type="button" className="hb-aep-icon" aria-label="Close" onClick={onClose}><Icon.Close size={13} /></button>
      </div>
      <div className="hb-aep-tabs hb-amem-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className="hb-aep-tab"
            data-testid={`amem-tab-${t.id}`} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {error && <div className="hb-aep-error" role="alert" data-testid="amem-error">{error}</div>}
      {!data ? <div className="hb-aep-empty hb-amem-pad">{error ? '' : 'Loading…'}</div> : (
        <div className="hb-aep-body">
          {tab === 'facts' && (
            <>
              <section className="hb-aep-section">
                <div className="hb-aep-label">Facts {agent.name} knows</div>
                {data.facts.length === 0
                  ? <div className="hb-aep-empty">Nothing yet. Tell {agent.name} something in the chat, or add a fact below.</div>
                  : (
                    <ul className="hb-amem-list" data-testid="amem-facts">
                      {data.facts.map((fact) => (
                        <FactCard key={fact.id} fact={fact} busy={busy}
                          history={data.history.filter((row) => row.key === fact.key)}
                          onSave={saveFact}
                          onForget={() => act(() => agentMemoryApi.forgetFact(agentId, fact.id))} />
                      ))}
                    </ul>
                  )}
              </section>
              <section className="hb-aep-section">
                <div className="hb-aep-label">Add a fact</div>
                <AddFactForm busy={busy} onSave={saveFact} />
              </section>
            </>
          )}
          {tab === 'identity' && (
            <section className="hb-aep-section">
              <IdentityEditor agent={agent} identity={data.identity} versions={data.identityVersions} busy={busy}
                onSave={(core) => act(() => agentMemoryApi.setIdentity(agentId, core))} />
            </section>
          )}
          {tab === 'episodes' && (
            <section className="hb-aep-section">
              <EpisodeList agentId={agentId} agentName={agent.name} initial={data.episodes} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}
