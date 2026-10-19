/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { ThemePanelCard } from './ThemeControls.jsx';
import { api } from '../../lib/api.js';
import { useWorkspaceStore } from '../../lib/store.js';
import { FAMILY_AGENTS } from '../../data/family-agents.js';

const muted = { fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', margin: 0, lineHeight: 1.5 };

/** Settings > Agents: which agents may post a short note to the Inbox on their own (diagram 17). */
export function SpeakUpSection() {
  const workspaceId = useWorkspaceStore(state => state.workspaceId);
  const [state, setState] = React.useState({ agents: {}, canChange: false, ready: false, saving: false, error: '' });

  React.useEffect(() => {
    let alive = true;
    if (!workspaceId) return undefined;
    api.getAgentSpeakUp(workspaceId)
      .then(data => alive && setState(s => ({ ...s, agents: data.agents || {}, canChange: Boolean(data.canChange), ready: true, error: '' })))
      .catch(error => alive && setState(s => ({ ...s, ready: true, error: error.message })));
    return () => { alive = false; };
  }, [workspaceId]);

  const toggle = async (agentId, enabled) => {
    setState(s => ({ ...s, saving: true, error: '' }));
    try {
      const data = await api.setAgentSpeakUp({ workspaceId, agentId, enabled });
      setState(s => ({ ...s, agents: data.agents || {}, saving: false }));
    } catch (error) {
      setState(s => ({ ...s, saving: false, error: error.message }));
    }
  };

  const disabled = !state.ready || !state.canChange || state.saving;
  return (
    <ThemePanelCard style={{ padding: 14, display: 'grid', gap: 8 }} data-testid="speak-up-section">
      <div style={{ fontWeight: 650 }}>Speak up</div>
      <p style={muted}>
        An agent that is on can post one short note to your Inbox by itself when its scheduled check finds
        something worth telling you. At most one note an hour. Every agent starts off. If you set up the Jules phone ping, your own boards' notes reach your phone too.
      </p>
      {FAMILY_AGENTS.map(agent => (
        <label key={agent.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
          cursor: disabled ? 'default' : 'pointer' }}>
          <span>{agent.name}</span>
          <input type="checkbox" role="switch" aria-label={`Speak up for ${agent.name}`} disabled={disabled}
            checked={Boolean(state.agents[agent.id])} onChange={event => toggle(agent.id, event.target.checked)} />
        </label>
      ))}
      {state.ready && !state.canChange && <p style={muted}>Only the board's owner or an admin can change this.</p>}
      {state.error && <p role="alert" style={{ ...muted, color: 'var(--danger)' }}>{state.error}</p>}
    </ThemePanelCard>
  );
}
