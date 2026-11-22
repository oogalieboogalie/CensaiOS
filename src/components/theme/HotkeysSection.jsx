import React from 'react';
import {
  AGENT_HOTKEY_ACTIONS,
  assignAgentHotkey,
  defaultAgentHotkeys,
  hotkeyFromEvent,
  loadAgentHotkeys,
  saveAgentHotkeys,
} from '../../lib/agentHotkeys.js';
import { SettingsButton, SettingsNote, SettingsRow, SettingsRows, SettingsSection } from './settingsKit.jsx';

/** One row: press the key button, then press the new Alt+letter. Escape cancels. */
function HotkeyRow({ action, value, recording, onRecord, onSet }) {
  const onKeyDown = (e) => {
    if (!recording) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') { onRecord(null); return; }
    const key = hotkeyFromEvent(e);
    if (key) onSet(key);
  };
  return (
    <SettingsRow label={action.label} data-testid={`hotkey-row-${action.id}`}>
      <button type="button" className="hb-set-btn hb-set-key" aria-pressed={recording}
        data-hotkey-recorder="" aria-label={`Key for ${action.label}`}
        onClick={() => onRecord(recording ? null : action.id)} onKeyDown={onKeyDown} onBlur={() => recording && onRecord(null)}>
        {recording ? 'Press Alt + a letter' : value || 'Off'}
      </button>
      <SettingsButton small disabled={!value} onClick={() => onSet('')} aria-label={`Turn off the key for ${action.label}`}>Turn off</SettingsButton>
    </SettingsRow>
  );
}

/** Settings > Hotkeys: Alt keys that open a coding agent terminal. */
export function HotkeysSection() {
  const [map, setMap] = React.useState(loadAgentHotkeys);
  const [recording, setRecording] = React.useState(null);
  const [note, setNote] = React.useState('');
  const update = (next, text = 'Saved.') => { setMap(saveAgentHotkeys(next)); setRecording(null); setNote(text); };
  return (
    <SettingsSection
      title="Open a coding agent"
      hint="Press the keys anywhere on the board, even inside another terminal, to open a new terminal already running that agent. The first time, censaiOS installs the agent, then the agent asks you to sign in with your own account."
      actions={<SettingsButton small onClick={() => update(defaultAgentHotkeys(), 'The original keys are back.')}>Put the original keys back</SettingsButton>}
      data-testid="hotkeys-section"
    >
      <SettingsRows>
        {AGENT_HOTKEY_ACTIONS.map((action) => (
          <HotkeyRow key={action.id} action={action} value={map[action.id]} recording={recording === action.id}
            onRecord={(id) => { setRecording(id); setNote(''); }} onSet={(key) => update(assignAgentHotkey(map, action.id, key))} />
        ))}
      </SettingsRows>
      <p className="hb-set-hint">
        To change a key, click it, then press Alt and a letter (Shift is optional). If another agent had that key, it moves to the new one.
        Alt and a number stay with window groups.
      </p>
      <SettingsNote tone="ok">{note}</SettingsNote>
    </SettingsSection>
  );
}
