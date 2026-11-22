import React from 'react';
import { api } from '../../lib/api.js';
import { useWorkspaceStore } from '../../lib/store.js';
import { OWNER_ONLY, SettingsNote, SettingsSection, SwitchRow, useSavedNote } from './settingsKit.jsx';

/** Settings > Agents: whether Censai may set wake-ups for himself and the family. */
export function WakeUpSection() {
  const workspaceId = useWorkspaceStore(state => state.workspaceId);
  const [state, setState] = React.useState({ on: false, canChange: false, ready: false, saving: false, error: '' });
  const note = useSavedNote(state.saving, state.error);

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
    <SettingsSection title="Wake-ups" data-testid="wake-up-section">
      <SwitchRow
        label="Censai can set wake-ups"
        hint="Censai can set a time to wake himself for a follow-up, or wake a family agent (Echo, Nexus, Foundation and the rest) to check its messages and do its part. Each one shows in the Scheduler with his reason, where you can pause or delete it. At most 6 run a day, and 8 can wait at once."
        switchLabel="Wake-ups for Censai"
        disabled={disabled}
        checked={state.on}
        onChange={toggle}
      />
      {state.ready && !state.canChange ? <SettingsNote>{OWNER_ONLY}</SettingsNote> : null}
      <SettingsNote note={note} />
    </SettingsSection>
  );
}
