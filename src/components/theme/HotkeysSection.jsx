/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { ThemePanelCard } from './ThemeControls.jsx';
import {
  AGENT_HOTKEY_ACTIONS,
  assignAgentHotkey,
  defaultAgentHotkeys,
  hotkeyFromEvent,
  loadAgentHotkeys,
  saveAgentHotkeys,
} from '../../lib/agentHotkeys.js';

const muted = { fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', margin: 0, lineHeight: 1.5 };
const keyButton = { minWidth: 110, padding: '5px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--hairline)',
  background: 'var(--surface)', color: 'var(--ink)', font: 'inherit', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', cursor: 'pointer' };
const linkButton = { background: 'none', border: 'none', padding: 0, color: 'var(--ink-faint)', font: 'inherit',
  fontSize: 'var(--text-xs)', cursor: 'pointer', textDecoration: 'underline' };

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
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }} data-testid={`hotkey-row-${action.id}`}>
      <span>{action.label}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button type="button" style={{ ...keyButton, ...(recording ? { border: '1px solid var(--accent)', color: 'var(--accent)' } : {}) }}
          data-hotkey-recorder="" aria-label={`Key for ${action.label}`}
          onClick={() => onRecord(recording ? null : action.id)} onKeyDown={onKeyDown} onBlur={() => recording && onRecord(null)}>
          {recording ? 'Press Alt + a letter' : value || 'Off'}
        </button>
        <button type="button" style={linkButton} disabled={!value} onClick={() => onSet('')}>Turn off</button>
      </span>
    </div>
  );
}

/** Settings > Hotkeys: Alt keys that open a coding agent terminal. */
export function HotkeysSection() {
  const [map, setMap] = React.useState(loadAgentHotkeys);
  const [recording, setRecording] = React.useState(null);
  const update = (next) => { setMap(saveAgentHotkeys(next)); setRecording(null); };
  return (
    <div style={{ display: 'grid', gap: 12 }} data-testid="hotkeys-section">
      <ThemePanelCard style={{ padding: 14, display: 'grid', gap: 10 }}>
        <div style={{ fontWeight: 650 }}>Open a coding agent</div>
        <p style={muted}>
          Press the keys anywhere on the board, even inside another terminal, to open a new terminal already running that agent.
          The first time, censaiOS installs the agent for you, then the agent asks you to sign in with your own account.
        </p>
        {AGENT_HOTKEY_ACTIONS.map((action) => (
          <HotkeyRow key={action.id} action={action} value={map[action.id]} recording={recording === action.id}
            onRecord={setRecording} onSet={(key) => update(assignAgentHotkey(map, action.id, key))} />
        ))}
        <div>
          <button type="button" style={linkButton} onClick={() => update(defaultAgentHotkeys())}>Put the original keys back</button>
        </div>
        <p style={muted}>
          To change one, click its key, then press Alt plus a letter (Shift is optional). If another agent already had that key, it moves to the new one.
          Alt plus a number stays with window groups.
        </p>
      </ThemePanelCard>
    </div>
  );
}
