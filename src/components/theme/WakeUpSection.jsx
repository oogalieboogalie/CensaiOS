/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { ThemePanelCard } from './ThemeControls.jsx';
import { api } from '../../lib/api.js';
import { useWorkspaceStore } from '../../lib/store.js';

const muted = { fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', margin: 0, lineHeight: 1.5 };

/** Settings > Agents: whether Censai may set wake-ups for himself and the family. */
export function WakeUpSection() {
  const workspaceId = useWorkspaceStore(state => state.workspaceId);
  const [state, setState] = React.useState({ on: false, canChange: false, ready: false, saving: false, error: '' });

  React.useEffect(() => {
    let alive = true;
    if (!workspaceId) return undefined;
    api.getAgentWakeUps(workspaceId)
      .then(data => alive && setState(s => ({ ...s, on: Boolean(data.agents?.censai), canChange: Boolean(data.canChange), ready: true, error: '' })))
      .catch(error => alive && setState(s => ({ ...s, ready: true, error: error.message })));
    return () => { alive = false; };
  }, [workspaceId]);

  const toggle = async (enabled) => {
    setState(s => ({ ...s, saving: true, error: '' }));
    try {
      const data = await api.setAgentWakeUps({ workspaceId, agentId: 'censai', enabled });
      setState(s => ({ ...s, on: Boolean(data.agents?.censai), saving: false }));
    } catch (error) {
      setState(s => ({ ...s, saving: false, error: error.message }));
    }
  };

  const disabled = !state.ready || !state.canChange || state.saving;
  return (
    <ThemePanelCard style={{ padding: 14, display: 'grid', gap: 8 }} data-testid="wake-up-section">
      <div style={{ fontWeight: 650 }}>Wake-ups</div>
      <p style={muted}>
        When this is on, Censai can set a time to wake himself up for a follow-up, or wake a family agent
        (Echo, Nexus, Foundation and the rest) to check its messages and do its part. Each one shows in the
        Scheduler with his reason, and you can pause or delete it there. At most 6 run a day and 8 can wait at once.
      </p>
      <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
        cursor: disabled ? 'default' : 'pointer' }}>
        <span>Censai can set wake-ups</span>
        <input type="checkbox" role="switch" aria-label="Wake-ups for Censai" disabled={disabled}
          checked={state.on} onChange={event => toggle(event.target.checked)} />
      </label>
      {state.ready && !state.canChange && <p style={muted}>Only the board's owner or an admin can change this.</p>}
      {state.error && <p role="alert" style={{ ...muted, color: 'var(--danger)' }}>{state.error}</p>}
    </ThemePanelCard>
  );
}
