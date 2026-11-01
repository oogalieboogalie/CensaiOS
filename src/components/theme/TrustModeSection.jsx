/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { ThemePanelCard } from './ThemeControls.jsx';
import { TrustModeSwitch } from '../approvals/TrustModeSwitch.jsx';
import { useTrustMode } from '../approvals/useTrustMode.js';
import { FAMILY_AGENTS } from '../../data/family-agents.js';

const muted = { fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', margin: 0, lineHeight: 1.5 };
const select = { padding: '5px 8px', borderRadius: 'var(--radius-md)', border: '1px solid var(--hairline)',
  background: 'var(--surface)', color: 'var(--ink)', font: 'inherit', fontSize: 'var(--text-xs)' };

function choiceFor(value) {
  if (value === true) return 'trust';
  if (value === false) return 'ask';
  return 'board';
}

/** Settings > Agents: the board's Trust mode, plus a per-agent override. */
export function TrustModeSection() {
  const trust = useTrustMode();
  const disabled = !trust.ready || !trust.canChange || trust.saving;
  const change = (agentId, choice) => trust.setAgent(agentId, choice === 'board' ? null : choice === 'trust');
  return (
    <div style={{ display: 'grid', gap: 12 }} data-testid="trust-mode-section">
      <ThemePanelCard style={{ padding: 14, display: 'grid', gap: 8 }}>
        <TrustModeSwitch trust={trust} />
        <p style={muted}>
          Still never automatic: sending a message or email to another person, spending money, and signing. Agents never sign.
        </p>
        <p style={muted} data-testid="trust-mode-files">
          Trust mode only skips the OK click. It does not give an agent new tools or files. For files, open a project from the top bar
          (only that project's files can be opened), and for Censai's family agents also equip Project Reader or Project Writer in the ExoSkeleton window.
        </p>
      </ThemePanelCard>
      <ThemePanelCard style={{ padding: 14, display: 'grid', gap: 8 }}>
        <div style={{ fontWeight: 650 }}>One agent at a time</div>
        <p style={muted}>Leave an agent on "Same as the board", or pick for that one agent.</p>
        {FAMILY_AGENTS.map(agent => (
          <label key={agent.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span>{agent.name}</span>
            <select style={select} disabled={disabled} aria-label={`Trust mode for ${agent.name}`}
              value={choiceFor(trust.agents[agent.id])} onChange={event => change(agent.id, event.target.value)}>
              <option value="board">Same as the board</option>
              <option value="trust">Acts on its own</option>
              <option value="ask">Asks first</option>
            </select>
          </label>
        ))}
      </ThemePanelCard>
    </div>
  );
}
